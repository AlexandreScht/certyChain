import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env";
import { logger } from "./logger";

/**
 * ProConnect (DINUM) OpenID Connect client — strong ownership proof (verify.md §1).
 * The State attests *who* the agent is AND *which SIRET* they represent, so we can
 * auto-approve when `siret_ProConnect === siret_declared`.
 *
 * Standard OIDC Authorization Code Flow. Endpoints are read from the provider's
 * Discovery document (never hard-coded). Degrades cleanly when unconfigured:
 * `proconnectConfigured` is false → the option is simply not offered.
 */

export interface ProConnectIdentity {
  sub: string;
  siret: string | null;
  givenName: string | null;
  usualName: string | null;
  email: string | null;
}

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

/** Strip everything but digits — SIRET comparison must ignore spaces/formatting. */
export function normalizeSiret(siret: string | null | undefined): string {
  return (siret ?? "").replace(/\D/g, "");
}

let discoveryCache: Discovery | null = null;
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function getDiscovery(): Promise<Discovery> {
  if (discoveryCache) return discoveryCache;
  const url = `${env.PROCONNECT_ISSUER.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`ProConnect discovery failed (${res.status})`);
  const d = (await res.json()) as Discovery;
  discoveryCache = d;
  jwks = createRemoteJWKSet(new URL(d.jwks_uri));
  return d;
}

/** Builds the /authorize redirect URL (state = anti-CSRF, nonce = anti-replay). */
export async function buildAuthorizeUrl(state: string, nonce: string): Promise<string> {
  const d = await getDiscovery();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.PROCONNECT_CLIENT_ID,
    redirect_uri: env.PROCONNECT_REDIRECT_URI,
    scope: env.PROCONNECT_SCOPES,
    state,
    nonce,
    acr_values: "eidas1",
  });
  return `${d.authorization_endpoint}?${params.toString()}`;
}

/**
 * Exchanges the authorization code, verifies the id_token (incl. our nonce) and
 * the userinfo JWT signature via the provider JWKS, then returns the identity.
 * Throws on any verification failure (caller maps to a verification error).
 */
export async function exchangeAndVerify(
  code: string,
  expectedNonce: string,
): Promise<ProConnectIdentity> {
  const d = await getDiscovery();

  const tokenRes = await fetch(d.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.PROCONNECT_REDIRECT_URI,
      client_id: env.PROCONNECT_CLIENT_ID,
      client_secret: env.PROCONNECT_CLIENT_SECRET,
    }),
  });
  if (!tokenRes.ok) throw new Error(`ProConnect token exchange failed (${tokenRes.status})`);
  const tokens = (await tokenRes.json()) as { id_token?: string; access_token?: string };
  if (!tokens.id_token || !tokens.access_token) throw new Error("ProConnect: missing tokens");
  if (!jwks) throw new Error("ProConnect: JWKS not loaded");

  // Verify id_token signature, issuer, audience, and our nonce (anti-replay).
  const { payload: idClaims } = await jwtVerify(tokens.id_token, jwks, {
    issuer: d.issuer,
    audience: env.PROCONNECT_CLIENT_ID,
  });
  if (idClaims.nonce !== expectedNonce) throw new Error("ProConnect: nonce mismatch");

  // UserInfo is itself a signed JWT — fetch then verify its signature too.
  const uiRes = await fetch(d.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/jwt" },
  });
  if (!uiRes.ok) throw new Error(`ProConnect userinfo failed (${uiRes.status})`);
  const uiJwt = await uiRes.text();
  const { payload } = await jwtVerify(uiJwt, jwks, {
    issuer: d.issuer,
    audience: env.PROCONNECT_CLIENT_ID,
  });

  const str = (k: string): string | null =>
    typeof payload[k] === "string" ? (payload[k] as string) : null;

  return {
    sub: String(payload.sub ?? idClaims.sub ?? ""),
    siret: str("siret"),
    givenName: str("given_name"),
    usualName: str("usual_name"),
    email: str("email"),
  };
}

/** Best-effort discovery warm-up (logs but never throws into the request path). */
export async function warmProConnect(): Promise<void> {
  try {
    await getDiscovery();
  } catch (e) {
    logger.error("proconnect.discovery_failed", { error: String(e) });
  }
}

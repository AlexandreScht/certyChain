import { Hono, type Context, type MiddlewareHandler } from "hono";
import { RATE_LIMIT, VC } from "../../config/constants";
import type { AppEnv } from "../../http/types";
import { AppError } from "../../lib/http-error";
import { logger } from "../../lib/logger";
import { rateLimit } from "../../middleware/rate-limit";
import { listIssuerPublicJwks } from "./keys";
import {
  authorizationServerMetadata,
  credentialIssuerMetadata,
  jwtVcIssuerMetadata,
} from "./metadata";
import {
  normalizeVcProtocolError,
  VcProtocolError,
  type VcOAuthError,
} from "./protocol";
import { signVcNonce } from "./tokens";
import {
  exchangePreAuthorizedCode,
  getCredentialOffer,
  getVcStatusListToken,
  issueVcCredential,
  vcIssuanceAvailable,
} from "./vc.service";

function noStore(c: Context<AppEnv>): void {
  c.header("Cache-Control", "no-store");
  c.header("Pragma", "no-cache");
}

function protocolErrorResponse(
  c: Context<AppEnv>,
  error: VcOAuthError,
  status: 400 | 401 | 429 | 503,
) {
  noStore(c);
  if (status === 401) c.header("WWW-Authenticate", `Bearer error="${error}"`);
  if (status === 400) return c.json({ error }, 400);
  if (status === 401) return c.json({ error }, 401);
  if (status === 429) return c.json({ error }, 429);
  return c.json({ error }, 503);
}

function handleProtocolError(c: Context<AppEnv>, error: unknown) {
  const normalized = normalizeVcProtocolError(error);
  if (!(error instanceof VcProtocolError)) {
    logger.error("vc.protocol_unavailable", {
      id: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  }
  return protocolErrorResponse(c, normalized.error, normalized.status);
}

/** Convert the generic limiter's AppError into a wallet-parseable OAuth body. */
function oauthRateLimit(
  key: string,
  options: { max: number; windowSec: number },
): MiddlewareHandler<AppEnv> {
  const limiter = rateLimit({ key, by: "ip", ...options });
  return async (c, next) => {
    try {
      return await limiter(c, next);
    } catch (error) {
      if (error instanceof AppError && error.status === 429) {
        return protocolErrorResponse(c, "slow_down", 429);
      }
      return handleProtocolError(c, error);
    }
  };
}

async function issuanceUnavailable(c: Context<AppEnv>): Promise<Response | null> {
  if (await vcIssuanceAvailable()) return null;
  noStore(c);
  return c.json({ error: "not_found" }, 404);
}

function formString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function hasContentType(c: Context<AppEnv>, expected: string): boolean {
  const mediaType = (c.req.header("content-type") ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  return mediaType === expected;
}

export const vcRoutes = new Hono<AppEnv>()
  .get("/.well-known/openid-credential-issuer", async (c) => {
    const unavailable = await issuanceUnavailable(c);
    if (unavailable) return unavailable;
    c.header("Cache-Control", "public, max-age=60");
    return c.json(credentialIssuerMetadata());
  })
  .get("/.well-known/oauth-authorization-server", async (c) => {
    const unavailable = await issuanceUnavailable(c);
    if (unavailable) return unavailable;
    c.header("Cache-Control", "public, max-age=60");
    return c.json(authorizationServerMetadata());
  })
  .get("/.well-known/jwt-vc-issuer", async (c) => {
    const keys = await listIssuerPublicJwks();
    if (keys.length === 0) {
      noStore(c);
      return c.json({ error: "not_found" }, 404);
    }
    c.header("Cache-Control", "public, max-age=300");
    return c.json(jwtVcIssuerMetadata(keys));
  })
  .get("/vc/offers/:id", async (c) => {
    noStore(c);
    const id = c.req.param("id");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return c.json({ error: "not_found" }, 404);
    }
    const offer = await getCredentialOffer(id);
    if (!offer) return c.json({ error: "not_found" }, 404);
    return c.json(offer);
  })
  .post(
    "/vc/nonce",
    oauthRateLimit("vc_nonce", RATE_LIMIT.VC_NONCE),
    async (c) => {
      const unavailable = await issuanceUnavailable(c);
      if (unavailable) return unavailable;
      noStore(c);
      return c.json({ c_nonce: await signVcNonce() });
    },
  )
  .post(
    "/vc/oauth/token",
    oauthRateLimit("vc_token", RATE_LIMIT.VC_TOKEN),
    async (c) => {
      const unavailable = await issuanceUnavailable(c);
      if (unavailable) return unavailable;
      if (!hasContentType(c, "application/x-www-form-urlencoded")) {
        return protocolErrorResponse(c, "invalid_request", 400);
      }
      let form: Record<string, unknown>;
      try {
        form = (await c.req.parseBody()) as Record<string, unknown>;
      } catch {
        return protocolErrorResponse(c, "invalid_request", 400);
      }
      try {
        const response = await exchangePreAuthorizedCode({
          grantType: formString(form.grant_type),
          preAuthorizedCode: formString(form["pre-authorized_code"]),
          txCode: formString(form.tx_code),
        });
        noStore(c);
        return c.json(response);
      } catch (error) {
        return handleProtocolError(c, error);
      }
    },
  )
  .post(
    "/vc/credential",
    oauthRateLimit("vc_credential", RATE_LIMIT.VC_CREDENTIAL),
    async (c) => {
      const unavailable = await issuanceUnavailable(c);
      if (unavailable) return unavailable;
      if (!hasContentType(c, "application/json")) {
        return protocolErrorResponse(c, "invalid_credential_request", 400);
      }
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return protocolErrorResponse(c, "invalid_credential_request", 400);
      }
      try {
        const response = await issueVcCredential(c.req.header("authorization"), body);
        noStore(c);
        return c.json(response);
      } catch (error) {
        return handleProtocolError(c, error);
      }
    },
  )
  .get("/vc/status/:listId", async (c) => {
    const raw = c.req.param("listId");
    if (!/^\d{1,9}$/.test(raw)) {
      noStore(c);
      return c.json({ error: "not_found" }, 404);
    }
    const token = await getVcStatusListToken(Number(raw));
    if (!token) {
      noStore(c);
      return c.json({ error: "not_found" }, 404);
    }
    c.header("Cache-Control", `public, max-age=${VC.STATUS_TTL_SEC}`);
    c.header("Content-Type", "application/statuslist+jwt");
    return c.body(token);
  });

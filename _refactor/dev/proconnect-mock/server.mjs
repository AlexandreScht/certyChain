/**
 * Mock ProConnect (DINUM) OpenID Connect provider — DEV / TEST ONLY.
 *
 * Lets you exercise the ownership-proof "ProConnect" path (verify.md §3) end to
 * end on your machine, with ZERO external signup. Zero npm dependencies: it signs
 * JWTs with node:crypto (Ed25519 / "EdDSA") and exposes a JWKS that the API's
 * `jose` client verifies against — exactly like the real provider.
 *
 * What it implements (the subset `server/src/lib/proconnect.ts` actually calls):
 *   GET  /.well-known/openid-configuration  → discovery
 *   GET  /authorize                          → tiny consent page → redirect w/ code
 *   POST /token                              → { id_token (nonce echoed), access_token }
 *   GET  /userinfo  (Accept: application/jwt)→ SIGNED JWT with the `siret` claim
 *   GET  /jwks                               → public key (OKP/Ed25519)
 *
 * The asserted SIRET is `MOCK_SIRET` (default 12345678901234 — the seed school).
 * The API approves the school iff this SIRET matches the school's declared SIRET.
 *
 * URL split (the classic container-vs-browser OIDC gotcha):
 *   • discovery / token / userinfo / jwks are fetched SERVER-SIDE  → container host
 *     (`http://proconnect-mock:8090`), injected via ISSUER below.
 *   • /authorize is opened by the BROWSER → must be host-reachable
 *     (`http://localhost:8090`), injected via PUBLIC_ORIGIN below.
 */
import { createServer } from "node:http";
import { generateKeyPairSync, sign as cryptoSign, randomBytes } from "node:crypto";

const PORT = Number(process.env.PORT ?? 8090);
/** Server-reachable origin (what the API container fetches). */
const ISSUER = process.env.ISSUER ?? "http://proconnect-mock:8090";
/** Browser-reachable origin (what the human's browser hits for /authorize). */
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN ?? "http://localhost:8090";
/** SIRET asserted to the API — must equal the school's declared SIRET to pass. */
const MOCK_SIRET = (process.env.MOCK_SIRET ?? "12345678901234").replace(/\D/g, "");
const MOCK_GIVEN_NAME = process.env.MOCK_GIVEN_NAME ?? "Camille";
const MOCK_USUAL_NAME = process.env.MOCK_USUAL_NAME ?? "Directeur";
const MOCK_EMAIL = process.env.MOCK_EMAIL ?? "direction@etablissement.test";
const KID = "proconnect-mock-ed25519";

/* ── Signing key (fresh per process) ─────────────────────────────────────── */
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
// `publicKey` is already a public KeyObject → export its JWK directly.
const publicJwk = { ...publicKey.export({ format: "jwk" }), kid: KID, use: "sig", alg: "EdDSA" };

const b64url = (buf) => Buffer.from(buf).toString("base64url");

/** Sign a compact EdDSA JWT (alg=EdDSA, Ed25519 → crypto.sign with algorithm null). */
function signJwt(claims) {
  const header = b64url(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: KID }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 600, ...claims }));
  const signingInput = `${header}.${payload}`;
  const signature = b64url(cryptoSign(null, Buffer.from(signingInput), privateKey));
  return `${signingInput}.${signature}`;
}

/** In-memory authorization codes / access tokens (single-process dev store). */
const codes = new Map(); // code → { nonce, clientId, sub }
const tokens = new Map(); // access_token → { clientId, sub }

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, ISSUER);
  const path = url.pathname;

  // ── Discovery ──────────────────────────────────────────────────────────
  if (path === "/.well-known/openid-configuration") {
    return send(res, 200, {
      issuer: ISSUER,
      authorization_endpoint: `${PUBLIC_ORIGIN}/authorize`, // browser-facing
      token_endpoint: `${ISSUER}/token`,
      userinfo_endpoint: `${ISSUER}/userinfo`,
      jwks_uri: `${ISSUER}/jwks`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["EdDSA"],
      scopes_supported: ["openid", "siret", "given_name", "usual_name", "email"],
    });
  }

  // ── JWKS ───────────────────────────────────────────────────────────────
  if (path === "/jwks") return send(res, 200, { keys: [publicJwk] });

  // ── Authorize (browser): consent page → redirect with code+state ─────────
  if (path === "/authorize") {
    const clientId = url.searchParams.get("client_id") ?? "";
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const nonce = url.searchParams.get("nonce") ?? "";
    if (!redirectUri) return send(res, 400, { error: "missing redirect_uri" });

    if (url.searchParams.get("confirm") === "1") {
      const code = b64url(randomBytes(24));
      codes.set(code, { nonce, clientId, sub: `mock|${MOCK_SIRET}` });
      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      target.searchParams.set("state", state);
      return send(res, 302, "", { Location: target.toString() });
    }

    // Minimal consent screen so it's obvious you're on the MOCK, not real ProConnect.
    const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
    const confirmUrl = `${PUBLIC_ORIGIN}/authorize?${url.searchParams.toString()}&confirm=1`;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><meta charset="utf-8"><title>Mock ProConnect</title>
<body style="font-family:system-ui;max-width:30rem;margin:4rem auto;line-height:1.5">
<h1>🏛️ Mock ProConnect <small style="color:#a00">(DEV)</small></h1>
<p>Vous allez attester l'identité et le SIRET suivants à CertifyChain :</p>
<ul><li><b>SIRET</b> : ${esc(MOCK_SIRET)}</li><li><b>Agent</b> : ${esc(MOCK_GIVEN_NAME)} ${esc(MOCK_USUAL_NAME)}</li>
<li><b>Email</b> : ${esc(MOCK_EMAIL)}</li></ul>
<p style="color:#555;font-size:.9em">La validation réussit si ce SIRET == le SIRET déclaré par l'école.</p>
<a href="${esc(confirmUrl)}" style="display:inline-block;background:#000091;color:#fff;padding:.7rem 1.2rem;border-radius:.4rem;text-decoration:none">Se connecter avec ProConnect (mock)</a>
</body>`);
  }

  // ── Token endpoint (server-side): code → id_token + access_token ─────────
  if (path === "/token" && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const form = new URLSearchParams(raw);
    const code = form.get("code") ?? "";
    const clientId = form.get("client_id") ?? "";
    const rec = codes.get(code);
    if (!rec) return send(res, 400, { error: "invalid_grant" });
    codes.delete(code);

    const accessToken = b64url(randomBytes(24));
    tokens.set(accessToken, { clientId: clientId || rec.clientId, sub: rec.sub });
    const idToken = signJwt({
      aud: clientId || rec.clientId,
      sub: rec.sub,
      nonce: rec.nonce,
      siret: MOCK_SIRET,
      email: MOCK_EMAIL,
    });
    return send(res, 200, {
      access_token: accessToken,
      id_token: idToken,
      token_type: "Bearer",
      expires_in: 600,
    });
  }

  // ── UserInfo (server-side): returns a SIGNED JWT (ProConnect quirk) ──────
  if (path === "/userinfo") {
    const auth = req.headers["authorization"] ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const rec = tokens.get(token);
    if (!rec) return send(res, 401, { error: "invalid_token" });
    const jwt = signJwt({
      aud: rec.clientId,
      sub: rec.sub,
      siret: MOCK_SIRET,
      given_name: MOCK_GIVEN_NAME,
      usual_name: MOCK_USUAL_NAME,
      email: MOCK_EMAIL,
    });
    res.writeHead(200, { "Content-Type": "application/jwt" });
    return res.end(jwt);
  }

  send(res, 404, { error: "not_found" });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[mock-proconnect] listening on ${PORT} · issuer=${ISSUER} · siret=${MOCK_SIRET}`);
});

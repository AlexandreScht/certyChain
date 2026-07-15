import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, before, test, type TestContext } from "node:test";
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from "jose";

// env is frozen on first server import. This file imports the application only
// dynamically, after selecting the enabled branch for the integration flow.
process.env.VC_EXPORT_ENABLED = "true";

type App = ReturnType<(typeof import("../../../src/app"))["createApp"]>;
type SqlClient = (typeof import("../../../src/db/client"))["sqlClient"];

const SERVER_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const schoolId = randomUUID();
const studentId = randomUUID();
const diplomaId = randomUUID();
const studentCsrf = "vc-integration-csrf";

let app: App;
let sqlClient: SqlClient;
let studentAccessToken = "";
let testIssuerKeyId: string | null = null;
let integrationReady = false;
let skipReason = "PostgreSQL d'intégration indisponible";
let VC_ISSUER = "";
let VC_CREDENTIAL_CONFIGURATION_ID = "";
let VC_PRE_AUTHORIZED_GRANT = "";

interface OfferFixture {
  id: string;
  preAuthorizedCode: string;
  txCode: string;
}

function requireIntegration(t: TestContext): boolean {
  if (integrationReady) return true;
  t.skip(skipReason);
  return false;
}

function studentHeaders(): Headers {
  return new Headers({
    cookie: `cc_at=${studentAccessToken}; cc_csrf=${studentCsrf}`,
    "x-csrf-token": studentCsrf,
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function cleanup(): Promise<void> {
  if (!sqlClient) return;
  await sqlClient`delete from audit_log where school_id = ${schoolId}`;
  await sqlClient`delete from vc_credentials where diploma_id = ${diplomaId}`;
  await sqlClient`delete from vc_offers where diploma_id = ${diplomaId}`;
  await sqlClient`delete from diplomas where id = ${diplomaId}`;
  await sqlClient`delete from students where id = ${studentId}`;
  await sqlClient`delete from schools where id = ${schoolId}`;
  if (testIssuerKeyId) {
    await sqlClient`delete from vc_issuer_keys where id = ${testIssuerKeyId}`;
    testIssuerKeyId = null;
  }
}

async function createOffer(): Promise<OfferFixture> {
  const response = await app.request(`/wallet/diplomas/${diplomaId}/eudi-offer`, {
    method: "POST",
    headers: studentHeaders(),
  });
  assert.equal(response.status, 201);
  const dto = await json<{ offerDeepLink: string; txCode: string }>(response);
  assert.match(dto.txCode, /^\d{5}$/);

  const deepLink = new URL(dto.offerDeepLink);
  const offerUri = deepLink.searchParams.get("credential_offer_uri");
  assert.ok(offerUri);
  const id = new URL(offerUri).pathname.split("/").at(-1);
  assert.ok(id);

  const fetched = await app.request(`/vc/offers/${id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.headers.get("cache-control"), "no-store");
  const offer = await json<{
    credential_issuer: string;
    credential_configuration_ids: string[];
    grants: Record<string, { "pre-authorized_code": string }>;
  }>(fetched);
  assert.equal(offer.credential_issuer, VC_ISSUER);
  assert.deepEqual(offer.credential_configuration_ids, [VC_CREDENTIAL_CONFIGURATION_ID]);
  const grant = offer.grants[VC_PRE_AUTHORIZED_GRANT];
  assert.ok(grant);
  return { id, preAuthorizedCode: grant["pre-authorized_code"], txCode: dto.txCode };
}

async function exchangeToken(
  fixture: OfferFixture,
  txCode = fixture.txCode,
): Promise<Response> {
  return await app.request("/vc/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: VC_PRE_AUTHORIZED_GRANT,
      "pre-authorized_code": fixture.preAuthorizedCode,
      tx_code: txCode,
    }).toString(),
  });
}

async function freshNonce(): Promise<string> {
  const response = await app.request("/vc/nonce", { method: "POST" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const { c_nonce: nonce } = await json<{ c_nonce: string }>(response);
  assert.ok(nonce);
  return nonce;
}

async function holder(): Promise<{
  privateKey: KeyLike;
  publicJwk: JWK;
}> {
  const pair = await generateKeyPair("ES256", { extractable: true });
  return { privateKey: pair.privateKey, publicJwk: await exportJWK(pair.publicKey) };
}

async function proof(
  nonce: string,
  signer: KeyLike,
  advertisedJwk: JWK,
): Promise<string> {
  return await new SignJWT({ nonce })
    .setProtectedHeader({
      alg: "ES256",
      typ: "openid4vci-proof+jwt",
      jwk: advertisedJwk,
    })
    .setAudience(VC_ISSUER)
    .setIssuedAt()
    .sign(signer);
}

async function credential(accessToken: string, signedProof: string): Promise<Response> {
  return await app.request("/vc/credential", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      credential_configuration_id: VC_CREDENTIAL_CONFIGURATION_ID,
      proofs: { jwt: [signedProof] },
    }),
  });
}

async function assertOAuthError(
  response: Response,
  status: number,
  error: string,
): Promise<void> {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error });
  assert.equal(response.headers.get("cache-control"), "no-store");
}

before(async () => {
  ({ sqlClient } = await import("../../../src/db/client"));
  try {
    const [schema] = await sqlClient<
      { vcOffers: string | null; vcIssuerKeys: string | null }[]
    >`select to_regclass('public.vc_offers')::text as "vcOffers",
             to_regclass('public.vc_issuer_keys')::text as "vcIssuerKeys"`;
    if (!schema?.vcOffers || !schema.vcIssuerKeys) {
      skipReason = "migration VC 0012 absente de PostgreSQL";
      return;
    }
  } catch (error) {
    skipReason = `PostgreSQL d'intégration indisponible: ${
      error instanceof Error ? error.message : String(error)
    }`;
    return;
  }

  integrationReady = true;
  await cleanup();
  const suffix = `${Date.now()}${randomInt(1000, 9999)}`.slice(-12);
  const schoolSiret = `9${suffix}`.padStart(14, "0").slice(-14);
  await sqlClient`
    insert into schools (id, name, siret, status)
    values (${schoolId}, 'École VC intégration', ${schoolSiret}, 'approved')
  `;
  await sqlClient`
    insert into students (id, email, full_name)
    values (${studentId}, ${`vc-${studentId}@example.test`}, 'Titulaire VC')
  `;
  await sqlClient`
    insert into diplomas (
      id, school_id, student_id, holder_name, holder_email, program_title,
      mention, rncp, issued_at, payload_hash, signature, encrypted_holder_secret, status
    ) values (
      ${diplomaId}, ${schoolId}, ${studentId}, 'Titulaire VC',
      ${`vc-${studentId}@example.test`}, 'Master Sécurité', 'Très bien',
      'RNCP98765', '2026-06-30', ${"b".repeat(64)}, 'test-signature',
      'test-holder-secret', 'active'
    )
  `;

  const { ensureActiveVcIssuerKey } = await import("../../../src/modules/vc/issuer-keys");
  const issuerKey = await ensureActiveVcIssuerKey();
  if (issuerKey.created) testIssuerKeyId = issuerKey.id;
  const issuer = await import("../../../src/modules/vc/issuer");
  VC_ISSUER = issuer.VC_ISSUER;
  VC_CREDENTIAL_CONFIGURATION_ID = issuer.VC_CREDENTIAL_CONFIGURATION_ID;
  VC_PRE_AUTHORIZED_GRANT = issuer.VC_PRE_AUTHORIZED_GRANT;
  const { signAccessToken } = await import("../../../src/lib/tokens");
  studentAccessToken = await signAccessToken({
    sub: studentId,
    role: "student",
    email: `vc-${studentId}@example.test`,
  });
  const { createApp } = await import("../../../src/app");
  app = createApp();
});

after(async () => {
  try {
    if (integrationReady) await cleanup();
  } finally {
    if (sqlClient) await sqlClient.end({ timeout: 1 });
  }
});

test("VC HTTP: feature-off renvoie un 404 OAuth sans toucher la DB", () => {
  const script = `
    import { createApp } from './src/app.ts';
    const response = await createApp().request('/vc/nonce', { method: 'POST' });
    process.stdout.write(JSON.stringify({ status: response.status, body: await response.json() }));
  `;
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", script],
    {
      cwd: SERVER_ROOT,
      encoding: "utf8",
      env: { ...process.env, VC_EXPORT_ENABLED: "false" },
      timeout: 20_000,
    },
  );
  assert.equal(child.status, 0, child.stderr);
  // The request logger also writes one JSON line to stdout. The probe result is
  // deliberately emitted last so it stays easy to distinguish.
  const resultLine = child.stdout.trim().split(/\r?\n/).at(-1);
  assert.ok(resultLine, child.stdout);
  assert.deepEqual(JSON.parse(resultLine) as unknown, {
    status: 404,
    body: { error: "not_found" },
  });
});

test("VC HTTP/DB: offre -> nonce -> token -> credential et défenses anti-rejeu", async (t) => {
  if (!requireIntegration(t)) return;

  // Complete happy path, including the protocol-shaped replay error.
  const complete = await createOffer();
  const completeNonce = await freshNonce();
  const completeTokenResponse = await exchangeToken(complete);
  assert.equal(completeTokenResponse.status, 200);
  const { access_token: completeToken } = await json<{ access_token: string }>(
    completeTokenResponse,
  );
  const completeHolder = await holder();
  const issued = await credential(
    completeToken,
    await proof(completeNonce, completeHolder.privateKey, completeHolder.publicJwk),
  );
  assert.equal(issued.status, 200);
  const issuedBody = await json<{ credentials: Array<{ credential: string }> }>(issued);
  assert.equal(issuedBody.credentials.length, 1);
  assert.match(issuedBody.credentials[0]!.credential, /^[^.~]+\.[^.~]+\.[^.~]+~/);
  await assertOAuthError(
    await credential(
      completeToken,
      await proof(completeNonce, completeHolder.privateKey, completeHolder.publicJwk),
    ),
    401,
    "invalid_token",
  );

  // Three wrong tx_code attempts permanently consume the offer.
  const locked = await createOffer();
  const wrongCode = locked.txCode === "00000" ? "99999" : "00000";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assertOAuthError(await exchangeToken(locked, wrongCode), 400, "invalid_grant");
  }
  await assertOAuthError(await exchangeToken(locked), 400, "invalid_grant");
  const [lockedRow] = await sqlClient<{ txAttempts: number; consumedAt: Date | null }[]>`
    select tx_attempts as "txAttempts", consumed_at as "consumedAt"
    from vc_offers where id = ${locked.id}
  `;
  assert.equal(lockedRow?.txAttempts, 3);
  assert.ok(lockedRow?.consumedAt);

  // A valid pre-authorized code is itself one-shot.
  const replayed = await createOffer();
  assert.equal((await exchangeToken(replayed)).status, 200);
  await assertOAuthError(await exchangeToken(replayed), 400, "invalid_grant");

  // Expiration is checked at exchange time, not only when fetching the offer.
  const expired = await createOffer();
  await sqlClient`update vc_offers set expires_at = now() - interval '1 second' where id = ${expired.id}`;
  await assertOAuthError(await exchangeToken(expired), 400, "invalid_grant");

  // Signature verification precedes token consumption: a forged proof cannot
  // burn the access token, which remains usable with the legitimate holder key.
  const recoverable = await createOffer();
  const recoverableTokenResponse = await exchangeToken(recoverable);
  const { access_token: recoverableToken } = await json<{ access_token: string }>(
    recoverableTokenResponse,
  );
  const legitimate = await holder();
  const attacker = await holder();
  const recoverableNonce = await freshNonce();
  await assertOAuthError(
    await credential(
      recoverableToken,
      await proof(recoverableNonce, attacker.privateKey, legitimate.publicJwk),
    ),
    400,
    "invalid_proof",
  );
  const recovered = await credential(
    recoverableToken,
    await proof(recoverableNonce, legitimate.privateKey, legitimate.publicJwk),
  );
  assert.equal(recovered.status, 200, "le proof forgé ne doit pas brûler le token");

  // An otherwise correctly signed proof carrying an expired nonce has a stable
  // OID4VCI error body (no internal fail.* envelope).
  const stale = await createOffer();
  const staleTokenResponse = await exchangeToken(stale);
  const { access_token: staleToken } = await json<{ access_token: string }>(staleTokenResponse);
  const now = Math.floor(Date.now() / 1000);
  const jwtSecret = process.env.JWT_ACCESS_SECRET;
  assert.ok(jwtSecret);
  const expiredNonce = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(VC_ISSUER)
    .setAudience("vc-nonce")
    .setIssuedAt(now - 400)
    .setJti(randomUUID())
    .setExpirationTime(now - 1)
    .sign(new TextEncoder().encode(jwtSecret));
  const staleHolder = await holder();
  await assertOAuthError(
    await credential(
      staleToken,
      await proof(expiredNonce, staleHolder.privateKey, staleHolder.publicJwk),
    ),
    400,
    "invalid_nonce",
  );

  // A corrupted encrypted bearer payload must not escape as an internal 500 on
  // this public wallet endpoint.
  const corrupted = await createOffer();
  await sqlClient`
    update vc_offers set offer_payload_encrypted = 'corrupted-fixture'
    where id = ${corrupted.id}
  `;
  await assertOAuthError(await app.request(`/vc/offers/${corrupted.id}`), 404, "not_found");

  // The status document is public/cacheable for the advertised protocol TTL.
  const status = await app.request("/vc/status/1");
  assert.equal(status.status, 200);
  assert.match(status.headers.get("content-type") ?? "", /application\/statuslist\+jwt/);
  assert.match(status.headers.get("cache-control") ?? "", /(?:^|,\s*)max-age=300(?:,|$)/);
});

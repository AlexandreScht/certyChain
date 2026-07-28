/**
 * HTTP-level integration tests for the sensitive auth-adjacent surface (P10,
 * PLAN.md): login + OTP/TOTP, public diploma verification, and diploma
 * issuance — plus the P3 refresh-rotation-family invariant. Follows the same
 * `app.request()` + real-Postgres pattern already used in
 * `test/modules/vc/flow.test.ts` and `test/modules/accrochage/service.test.ts`
 * (skips cleanly when no integration Postgres is reachable). The smoke E2E
 * (`pnpm smoke`) already exercises the realistic end-to-end path; these tests
 * target fast, deterministic error cases and security invariants instead.
 *
 * ⚠️ Piège postgres.js + drizzle : le driver `drizzle-orm/postgres-js` remplace
 * les *serializers* des OID date/timestamp (1082/1083/1114/1184) par l'identité
 * pour piloter lui-même la conversion. Toute requête `sqlClient` brute doit donc
 * passer une chaîne ISO, jamais un objet `Date` (sinon ERR_INVALID_ARG_TYPE
 * « Received an instance of Date » au Bind).
 */
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, test, type TestContext } from "node:test";

type App = ReturnType<(typeof import("../../../src/app"))["createApp"]>;
type SqlClient = (typeof import("../../../src/db/client"))["sqlClient"];
type DB = (typeof import("../../../src/db/client"))["db"];

const schoolId = randomUUID();
const adminId = randomUUID();
const ADMIN_EMAIL = `admin-${adminId}@example.test`;
const ADMIN_PASSWORD = "Correct-Horse-Battery-Staple-9!";
const STUDENT_EMAIL = `student-${randomUUID()}@example.test`;
const HOLDER_NAME = "Titulaire Intégration Sensible";
const HOLDER_EMAIL = `titulaire-${randomUUID()}@example.test`;

let app: App;
let sqlClient: SqlClient;
let db: DB;
let integrationReady = false;
let skipReason = "PostgreSQL d'intégration indisponible";
let totpSecretB32 = "";
/** Set by the login+issuance test, consumed by the verify-flow test (same
 * ordering guarantee node:test gives top-level tests within one file). */
let issuedDiplomaId = "";
const shareToken = randomUUID();

function requireIntegration(t: TestContext): boolean {
  if (integrationReady) return true;
  t.skip(skipReason);
  return false;
}

/** Distinct-looking 14-digit SIRET, collision-safe across parallel test files. */
function siret(seed: number): string {
  const run = `${Date.now()}${randomInt(1000, 9999)}`.slice(-11);
  return `${seed}${run}`.padStart(14, "0").slice(-14);
}

/** Minimal cookie jar: folds `Set-Cookie` name=value pairs from a response in. */
function mergeCookies(jar: Record<string, string>, res: Response): void {
  for (const raw of res.headers.getSetCookie()) {
    const pair = raw.split(";")[0] ?? "";
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

before(async () => {
  ({ sqlClient, db } = await import("../../../src/db/client"));
  try {
    const [col] = await sqlClient<{ ok: boolean }[]>`
      select true as ok from information_schema.columns
      where table_name = 'refresh_sessions' and column_name = 'family_id'
    `;
    if (!col?.ok) {
      skipReason = "migration 0019 (refresh_sessions.family_id) absente de PostgreSQL";
      return;
    }
  } catch (error) {
    skipReason = `PostgreSQL d'intégration indisponible: ${
      error instanceof Error ? error.message : String(error)
    }`;
    return;
  }
  integrationReady = true;

  const { signerFor, issueSchoolCertificate, keyVault } = await import("../../../src/crypto");
  const { hashPassword } = await import("../../../src/lib/password");
  const { generateTotpSecret } = await import("../../../src/lib/totp");

  const signer = signerFor("envelope");
  const { publicKeyPem, ref } = await signer.createSchoolKey(schoolId);
  const approvedAt = new Date();
  const certificate = issueSchoolCertificate({
    schoolId,
    publicKey: publicKeyPem,
    name: "École Auth Intégration",
    issuedAt: approvedAt.toISOString().slice(0, 10),
  });
  await sqlClient`
    insert into schools (
      id, name, siret, status, public_key, certificate, signer_kind, signer_ref, approved_at
    ) values (
      ${schoolId}, 'École Auth Intégration', ${siret(9)}, 'approved',
      ${publicKeyPem}, ${certificate}, 'envelope', ${ref}, ${approvedAt.toISOString()}
    )
  `;

  totpSecretB32 = generateTotpSecret();
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  await sqlClient`
    insert into school_admins (id, school_id, email, password_hash, totp_secret, totp_enabled_at)
    values (
      ${adminId}, ${schoolId}, ${ADMIN_EMAIL}, ${passwordHash},
      ${keyVault.encrypt(totpSecretB32)}, now()
    )
  `;

  const { createApp } = await import("../../../src/app");
  app = createApp();
});

after(async () => {
  if (!sqlClient) return;
  try {
    if (integrationReady) {
      await sqlClient`delete from audit_log where school_id = ${schoolId}`;
      await sqlClient`delete from share_links where diploma_id in
        (select id from diplomas where school_id = ${schoolId})`;
      await sqlClient`delete from issuance_log where diploma_id in
        (select id from diplomas where school_id = ${schoolId})`;
      // Le journal de transparence est APPEND-ONLY : supprimer la feuille
      // ci-dessus (nécessaire, sinon la FK bloque la suppression du diplôme)
      // laisse orphelins les checkpoints que la vérification de ce test a fait
      // signer — ils s'engagent sur un arbre qui n'existe plus. Le `leaf_index`
      // libéré est réattribué à la PROCHAINE émission avec un haché différent,
      // donc `ensureCheckpointCovering` (qui rend le checkpoint de plus grande
      // taille) renverrait ensuite une racine incohérente et TOUTE preuve
      // d'inclusion ultérieure échouerait — constaté sur le Gate C : trois
      // checks V3 rouges après un simple `pnpm --filter server test` sur la
      // même base que la stack Docker. On restaure donc l'invariant en purgeant
      // exactement les checkpoints devenus plus grands que le journal réel ;
      // ceux d'avant ce test (taille ≤ nombre de feuilles restantes) portent sur
      // un préfixe intact et sont conservés.
      await sqlClient`delete from log_checkpoints
        where tree_size > (select count(*) from issuance_log)`;
      await sqlClient`delete from diplomas where school_id = ${schoolId}`;
      await sqlClient`delete from student_email_aliases where school_id = ${schoolId}`;
      await sqlClient`delete from refresh_sessions where subject_id = ${adminId}`;
      await sqlClient`delete from otp_codes where lower(email) = lower(${STUDENT_EMAIL})`;
      await sqlClient`delete from students where lower(email) = lower(${STUDENT_EMAIL})`;
      await sqlClient`delete from school_admins where id = ${adminId}`;
      await sqlClient`delete from schools where id = ${schoolId}`;
    }
  } finally {
    await sqlClient.end({ timeout: 1 });
  }
});

test("POST /auth/school/login — mauvais mot de passe (invariant anti-énumération)", async (t) => {
  if (!requireIntegration(t)) return;
  const res = await app.request("/auth/school/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: "definitely-wrong-password" }),
  });
  assert.equal(res.status, 401);
  const body = await json<{ error: { code: string } }>(res);
  assert.equal(body.error.code, "invalid_credentials");
});

test(
  "école : login (mdp + TOTP) -> émission -> rotation -> course tolérée puis rejeu détecté (P3)",
  async (t) => {
    if (!requireIntegration(t)) return;
    const { generateTotp } = await import("../../../src/lib/totp");

    const jar: Record<string, string> = {};

    const step1 = await app.request("/auth/school/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    assert.equal(step1.status, 200);
    mergeCookies(jar, step1);
    const challenge = await json<{ mfaStage: string }>(step1);
    // Already enrolled by fixture setup: step 1 must ask to VERIFY, not enroll.
    assert.equal(challenge.mfaStage, "verify");

    // Invariant: a wrong TOTP code is rejected without consuming the MFA cookie.
    const wrongCode = generateTotp(totpSecretB32, Date.now() - 10 * 60_000);
    const badTotp = await app.request("/auth/school/login/totp", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader(jar) },
      body: JSON.stringify({ code: wrongCode }),
    });
    assert.equal(badTotp.status, 401);

    const code = generateTotp(totpSecretB32);
    const step2 = await app.request("/auth/school/login/totp", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader(jar) },
      body: JSON.stringify({ code }),
    });
    assert.equal(step2.status, 200);
    mergeCookies(jar, step2);
    const session = await json<{ role: string; schoolId?: string }>(step2);
    assert.equal(session.role, "school_admin");
    assert.equal(session.schoolId, schoolId);

    const csrf = jar.cc_csrf;
    assert.ok(csrf, "cc_csrf must be set after a successful login");

    // Invariant: issuance without the CSRF header is refused.
    const noCsrf = await app.request("/diplomas", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader(jar) },
      body: JSON.stringify({
        holderName: HOLDER_NAME,
        holderEmail: HOLDER_EMAIL,
        programTitle: "Master Sécurité",
        issuedAt: "2026-06-30",
      }),
    });
    assert.equal(noCsrf.status, 403);

    // Invariant: no session cookie at all is refused.
    const noAuth = await app.request("/diplomas", { method: "POST" });
    assert.equal(noAuth.status, 401);

    // Happy path: real login session, real CSRF, real issuance route.
    const issue = await app.request("/diplomas", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader(jar),
        "x-csrf-token": csrf,
      },
      body: JSON.stringify({
        holderName: HOLDER_NAME,
        holderEmail: HOLDER_EMAIL,
        programTitle: "Master Sécurité",
        issuedAt: "2026-06-30",
      }),
    });
    assert.equal(issue.status, 201);
    const diploma = await json<{ id: string; holderName: string }>(issue);
    assert.equal(diploma.holderName, HOLDER_NAME);
    issuedDiplomaId = diploma.id;

    /* ── P3: refresh rotation + reuse (theft) detection ────────────────── */

    const rt0 = jar.cc_rt;
    assert.ok(rt0, "cc_rt must be set after login");

    const refresh1 = await app.request("/auth/refresh", {
      method: "POST",
      headers: { cookie: cookieHeader(jar), "x-csrf-token": csrf },
    });
    assert.equal(refresh1.status, 200);
    const jarAfterRefresh = { ...jar };
    mergeCookies(jarAfterRefresh, refresh1);
    const rt1 = jarAfterRefresh.cc_rt;
    const csrf1 = jarAfterRefresh.cc_csrf;
    assert.ok(rt1 && rt1 !== rt0, "refresh must rotate the token");
    assert.ok(csrf1, "refresh must also reissue a CSRF cookie");

    /* (a) Course inter-onglets : le jeton tout juste tourné est présenté par une
       requête restée en vol dans un autre onglet (même cookie jar). Dans la
       fenêtre de grâce et avec un remplaçant actif, ce n'est PAS un vol. */
    const race = await app.request("/auth/refresh", {
      method: "POST",
      headers: { cookie: `cc_rt=${rt0}; cc_csrf=${csrf}`, "x-csrf-token": csrf },
    });
    assert.equal(race.status, 401, "la course renvoie un échec ordinaire");
    assert.equal(
      race.headers.getSetCookie().length,
      0,
      "la course ne doit pas purger les cookies — le jar porte déjà le jeton valide",
    );

    const [raceAudit] = await sqlClient<{ n: string }[]>`
      select count(*)::text as n from audit_log
      where school_id = ${schoolId} and type = 'refresh_reuse_detected'
    `;
    assert.equal(raceAudit?.n, "0", "une course ne doit pas produire d'événement de vol");

    // La famille est intacte : le jeton légitime (rt1) tourne toujours.
    const refresh2 = await app.request("/auth/refresh", {
      method: "POST",
      headers: { cookie: cookieHeader(jarAfterRefresh), "x-csrf-token": csrf1 },
    });
    assert.equal(refresh2.status, 200, "la famille doit survivre à une course inter-onglets");
    const jarAfterRefresh2 = { ...jarAfterRefresh };
    mergeCookies(jarAfterRefresh2, refresh2);
    const rt2 = jarAfterRefresh2.cc_rt;
    const csrf2 = jarAfterRefresh2.cc_csrf;
    assert.ok(rt2 && rt2 !== rt1);
    assert.ok(csrf2);

    /* (b) Hors fenêtre de grâce : le MÊME rejeu redevient le signal de vol. On
       antidate la rotation de rt1 (un voleur rejoue forcément bien après). */
    const { hashRefreshToken } = await import("../../../src/lib/tokens");
    await sqlClient`
      update refresh_sessions set revoked_at = now() - interval '60 seconds'
      where token_hash = ${hashRefreshToken(rt1)}
    `;
    const replay = await app.request("/auth/refresh", {
      method: "POST",
      headers: { cookie: `cc_rt=${rt1}; cc_csrf=${csrf1}`, "x-csrf-token": csrf1 },
    });
    assert.equal(replay.status, 401);

    // A durable audit trail records the detection.
    const [auditRow] = await sqlClient<{ type: string }[]>`
      select type from audit_log
      where school_id = ${schoolId} and type = 'refresh_reuse_detected'
      limit 1
    `;
    assert.ok(auditRow, "un événement refresh_reuse_detected doit être journalisé");

    // Containment revokes the WHOLE family: rt2 (legitimate a moment ago) must
    // now fail too — not just the replayed rt1.
    const afterTheft = await app.request("/auth/refresh", {
      method: "POST",
      headers: { cookie: `cc_rt=${rt2}; cc_csrf=${csrf2}`, "x-csrf-token": csrf2 },
    });
    assert.equal(afterTheft.status, 401);

    const [row] = await sqlClient<{ activeCount: string }[]>`
      select count(*)::text as "activeCount" from refresh_sessions
      where subject_id = ${adminId} and revoked_at is null
    `;
    assert.equal(row?.activeCount, "0", "every session in the family must end up revoked");
  },
);

test("élève : OTP verify — mauvais code, bon code, puis rejeu (code déjà consommé)", async (t) => {
  if (!requireIntegration(t)) return;
  const { hashOtp } = await import("../../../src/lib/otp");
  const code = "482913";
  await sqlClient`
    insert into otp_codes (email, purpose, code_hash, expires_at)
    values (${STUDENT_EMAIL}, 'student_login', ${hashOtp(code)}, now() + interval '10 minutes')
  `;

  const wrong = await app.request("/auth/student/otp/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: STUDENT_EMAIL, code: "000000" }),
  });
  assert.equal(wrong.status, 401);

  const ok = await app.request("/auth/student/otp/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: STUDENT_EMAIL, code }),
  });
  assert.equal(ok.status, 200);
  const session = await json<{ role: string; email: string }>(ok);
  assert.equal(session.role, "student");
  assert.equal(session.email, STUDENT_EMAIL);

  // The code was consumed by the successful verify above — replaying it fails.
  const replay = await app.request("/auth/student/otp/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: STUDENT_EMAIL, code }),
  });
  assert.equal(replay.status, 401);
});

test(
  "vérification publique : divulgation sélective, anti-rejeu de nonce, révocation",
  async (t) => {
    if (!requireIntegration(t)) return;
    assert.ok(issuedDiplomaId, "le diplôme émis par le test précédent doit exister");

    const { shareLinks } = await import("../../../src/db/schema");
    await db.insert(shareLinks).values({
      diplomaId: issuedDiplomaId,
      token: shareToken,
      disclosedFields: ["programTitle"],
    });

    const challenge = await app.request(`/verify/${shareToken}/challenge`, { method: "POST" });
    assert.equal(challenge.status, 200);
    const { nonce } = await json<{ nonce: string }>(challenge);

    const proofRes = await app.request(`/verify/${shareToken}/proof`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nonce }),
    });
    assert.equal(proofRes.status, 200);
    const bodyText = await proofRes.text();
    const proof = JSON.parse(bodyText) as {
      result: string;
      proofBundle: { disclosures: string[] } | null;
    };
    assert.equal(proof.result, "verified");
    assert.ok(proof.proofBundle);
    // Only the ONE chosen field was disclosed.
    assert.equal(proof.proofBundle.disclosures.length, 1);
    // Leak check (v2.md piège #4): fields NOT disclosed must not appear anywhere
    // in the serialized response, not even as a raw substring.
    assert.ok(!bodyText.includes(HOLDER_NAME));
    assert.ok(!bodyText.includes(HOLDER_EMAIL));

    // Anti-replay: the SAME nonce cannot be consumed twice.
    const replayRes = await app.request(`/verify/${shareToken}/proof`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nonce }),
    });
    const replay = await json<{ result: string }>(replayRes);
    assert.equal(replay.result, "invalid");

    // Anti-enumeration: an unknown share token still mints a challenge (no
    // existence leak at that step) but its proof resolves to "not_found".
    const unknownToken = randomUUID();
    const unknownChallenge = await app.request(`/verify/${unknownToken}/challenge`, {
      method: "POST",
    });
    assert.equal(unknownChallenge.status, 200);
    const { nonce: unknownNonce } = await json<{ nonce: string }>(unknownChallenge);
    const unknownProofRes = await app.request(`/verify/${unknownToken}/proof`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nonce: unknownNonce }),
    });
    const unknownProof = await json<{ result: string }>(unknownProofRes);
    assert.equal(unknownProof.result, "not_found");

    // Revocation: the crypto still verifies (it's a fact about the past), but
    // the reported status flips — never a silent "invalid" for a revoked diploma.
    await sqlClient`update diplomas set status = 'revoked', revoked_at = now() where id = ${issuedDiplomaId}`;
    const challengeAfterRevoke = await app.request(`/verify/${shareToken}/challenge`, {
      method: "POST",
    });
    const { nonce: nonceAfterRevoke } = await json<{ nonce: string }>(challengeAfterRevoke);
    const proofAfterRevokeRes = await app.request(`/verify/${shareToken}/proof`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nonce: nonceAfterRevoke }),
    });
    const proofAfterRevoke = await json<{
      result: string;
      proofBundle: { revocation: { status: string } } | null;
    }>(proofAfterRevokeRes);
    assert.equal(proofAfterRevoke.result, "revoked");
    assert.equal(proofAfterRevoke.proofBundle?.revocation.status, "revoked");
  },
);

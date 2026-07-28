/**
 * E2E smoke test — drives the REAL composed stack over HTTP, end to end.
 *
 * Prerequisites (dev overlay: published DB + Mailpit + http cookies):
 *   docker compose -f docker-compose.yml -f docker-compose-dev.yml up -d --build
 *   pnpm --filter @certifychain/server db:seed
 *   pnpm --filter @certifychain/server smoke
 *
 * Covers the three actors of the product:
 *   • Recruiter : public verify protocol (challenge → proof → verified),
 *                 anti-replay, unknown/revoked links, front pages up.
 *   • School    : password + TOTP login, session, issuance (→ claim invite
 *                 email), list, revocation.
 *   • Student   : claim flow (landing → OTP → session), wallet list, share
 *                 link create/verify/revoke, OTP login, logout.
 *   • Admin     : password + TOTP (enroll-or-verify) login, stats, schools.
 *
 * Needs host access to the DB (decrypt seeded TOTP secrets via the KeyVault —
 * same trick as the seed) and to Mailpit's REST API (capture OTP/claim mails).
 * Exit code 0 = every check passed.
 */
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  SignJWT,
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
  type JWK,
} from "jose";
import type {
  LogConsistencyDTO,
  ProofBundleDTO,
  TransparencyProofDTO,
} from "@certifychain/contract/dto";
import { verifyProofBundle, type TrustedRoots } from "@certifychain/shared/crypto/verify-bundle";
import { verifyConsistency, verifyInclusion } from "@certifychain/shared/crypto/merkle";
import { verifyTransparency } from "@certifychain/shared/crypto/verify-transparency";
import { env } from "../config/env";
import { certifychainRootPqPublicKeyB64, certifychainRootPublicKeyPem } from "../crypto";
import { keyVault } from "../crypto/envelope";
import { db, sqlClient } from "../db/client";
import {
  cdcExportItems,
  diplomas,
  otpCodes,
  platformAdmins,
  schoolAdmins,
  schools,
  shareLinks,
} from "../db/schema";
import { generateTotp } from "../lib/totp";
import { verifySdJwtVc } from "../modules/vc/sd-jwt";
import { verifyStatusListToken } from "../modules/vc/status-list";

/* ── Config (overridable via env) ───────────────────────────────────────── */

const API = process.env.SMOKE_API_URL ?? "http://127.0.0.1:4000";
const WEB = process.env.SMOKE_WEB_URL ?? "http://127.0.0.1:3000";
const WALLET = process.env.SMOKE_WALLET_URL ?? "http://127.0.0.1:3001";
const ADMIN = process.env.SMOKE_ADMIN_URL ?? "http://127.0.0.1:3002";
const MAILPIT = process.env.SMOKE_MAILPIT_URL ?? "http://127.0.0.1:8025";

// This script runs on the SAME host as the server (it decrypts seeded TOTP
// secrets straight out of the DB via the KeyVault) so it has direct access to
// the real root — root pinning (audit 2026-07-27) means `verifyProofBundle`/
// `verifyTransparency` no longer accept a bundle's own `root.publicKey` as
// ground truth; the smoke suite must supply the anchor explicitly, exactly
// like the server route it is exercising over HTTP.
const TRUSTED_ROOTS: TrustedRoots = {
  ed25519: [certifychainRootPublicKeyPem()],
  mlDsa65: env.pqEnabled ? [certifychainRootPqPublicKeyB64()] : [],
};

const SCHOOL_NAME = "École Démo CertifyChain";
const SCHOOL_ADMIN_EMAIL = "admin@ecole-demo.fr";
const SCHOOL_ADMIN_PASSWORD = "DemoPassw0rd!24";
const DEMO_STUDENT_EMAIL = "alex.dubois@example.com";
const ADMIN_CANDIDATES: { email: string; password: string }[] = [
  {
    email: (process.env.ADMIN_BOOTSTRAP_EMAIL ?? "admin@certifychain.local").toLowerCase(),
    password: process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "",
  },
  { email: "admin@certifychain.local", password: "AdminPassw0rd!24" }, // seed fallback
];

/**
 * Moteur de divulgation sélective attendu pour un diplôme émis MAINTENANT, par
 * cette stack. Il découle de la politique post-quantique active : `PQ_POLICY`
 * vaut "require" par défaut depuis 2026-07-28, donc l'émission produit du v3
 * hybride (`ed25519-sd-v3`) ; un opérateur ayant explicitement opté pour
 * `PQ_POLICY=off` reste sur `ed25519-sd-v2`. Figer le littéral ici ferait
 * échouer le Gate C sur la politique par défaut — et, pire, laisserait passer
 * un serveur qui rapporterait « v2 » sur une preuve réellement hybride.
 * L'assertion reste donc EXACTE (égalité stricte), simplement paramétrée par la
 * politique, jamais relâchée en « v2 ou v3 ».
 */
const EXPECTED_SD_ENGINE = env.pqEnabled ? "ed25519-sd-v3" : "ed25519-sd-v2";

/** Unique per run so re-runs never trip OTP cooldowns or alias reuse. */
const RUN_ID = Date.now().toString(36);
const CLAIM_SCHOOL_EMAIL = `promo2026.${RUN_ID}@ecole-demo.fr`;
const CLAIM_PERSONAL_EMAIL = `perso.${RUN_ID}@example.com`;

/* ── Tiny check harness ─────────────────────────────────────────────────── */

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string): boolean {
  if (ok) {
    passed += 1;
    console.log(`  ✔ ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.error(`  ✘ ${name}${detail ? ` — ${detail}` : ""}`);
  }
  return ok;
}

function section(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(Math.max(2, 60 - title.length))}`);
}

/* ── Minimal browser: cookie jar + CSRF double-submit ───────────────────── */

interface Reply {
  status: number;
  headers: Headers;
  text: string;
  json<T>(): T;
}

class Browser {
  private jar = new Map<string, string>();

  constructor(
    private readonly base: string,
    private readonly csrfCookie: string = "cc_csrf",
  ) {}

  cookie(name: string): string | undefined {
    return this.jar.get(name);
  }

  private storeCookies(headers: Headers): void {
    for (const line of headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      if (!pair) continue;
      const idx = pair.indexOf("=");
      if (idx <= 0) continue;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      const gone = value === "" || attrs.some((a) => a.trim().toLowerCase() === "max-age=0");
      if (gone) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  async req(path: string, init?: { method?: string; json?: unknown }): Promise<Reply> {
    const method = init?.method ?? (init?.json !== undefined ? "POST" : "GET");
    const headers = new Headers();
    if (this.jar.size > 0) {
      headers.set("cookie", [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "));
    }
    const csrf = this.jar.get(this.csrfCookie);
    if (csrf && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      headers.set("x-csrf-token", csrf);
    }
    let body: string | undefined;
    if (init?.json !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(init.json);
    }
    const res = await fetch(`${this.base}${path}`, { method, headers, body, redirect: "manual" });
    this.storeCookies(res.headers);
    const text = await res.text();
    return {
      status: res.status,
      headers: res.headers,
      text,
      json<T>(): T {
        return JSON.parse(text) as T;
      },
    };
  }
}

/* ── Mailpit helpers ────────────────────────────────────────────────────── */

interface MailpitList {
  messages: { ID: string }[];
}

/** Newest message body sent to `to`, retrying while delivery is in flight. */
async function latestMailTo(to: string, mustMatch: RegExp, tries = 20): Promise<string | null> {
  for (let i = 0; i < tries; i += 1) {
    const q = encodeURIComponent(`to:"${to}"`);
    const listRes = await fetch(`${MAILPIT}/api/v1/search?query=${q}&limit=5`);
    if (listRes.ok) {
      const list = (await listRes.json()) as MailpitList;
      for (const m of list.messages ?? []) {
        const msgRes = await fetch(`${MAILPIT}/api/v1/message/${m.ID}`);
        if (!msgRes.ok) continue;
        const msg = (await msgRes.json()) as { Text?: string };
        const text = msg.Text ?? "";
        if (mustMatch.test(text)) return text;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

const OTP_RE = /(\d{6})/;
const CLAIM_URL_RE = /\/claim\/([A-Za-z0-9_-]+)/;

/* ── Seeded fixtures (DB reads, exactly like the seed script) ───────────── */

async function loadFixtures() {
  const [school] = await db.select().from(schools).where(eq(schools.name, SCHOOL_NAME)).limit(1);
  if (!school) {
    throw new Error(
      "École de démo absente — lancer d'abord : pnpm --filter @certifychain/server db:seed",
    );
  }
  const [admin] = await db
    .select()
    .from(schoolAdmins)
    .where(eq(schoolAdmins.schoolId, school.id))
    .limit(1);
  const [demoDiploma] = await db
    .select()
    .from(diplomas)
    .where(and(eq(diplomas.schoolId, school.id), eq(diplomas.externalId, "DEMO-001")))
    .limit(1);
  if (!admin || !demoDiploma) throw new Error("Seed incomplet (admin école ou diplôme démo manquant)");
  const [demoLink] = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.diplomaId, demoDiploma.id))
    .limit(1);
  if (!demoLink) throw new Error("Seed incomplet (lien de partage démo manquant)");
  return { school, admin, demoDiploma, demoLink };
}

/* ── Reusable flows ─────────────────────────────────────────────────────── */

interface MfaChallenge {
  mfaStage: "enroll" | "verify";
  secret?: string;
}

/**
 * Two-step password + TOTP login. On "verify" the secret comes from the DB
 * (decrypted with the KeyVault); on first-ever login ("enroll") the API hands
 * the fresh secret back in the challenge itself.
 */
async function loginWithTotp(opts: {
  browser: Browser;
  loginPath: string;
  totpPath: string;
  email: string;
  password: string;
  storedSecret: () => Promise<string | null>;
  label: string;
}): Promise<boolean> {
  const step1 = await opts.browser.req(opts.loginPath, {
    json: { email: opts.email, password: opts.password },
  });
  if (!check(`${opts.label} : étape 1 (mot de passe)`, step1.status === 200, `HTTP ${step1.status} ${step1.text.slice(0, 200)}`)) {
    return false;
  }
  const challenge = step1.json<MfaChallenge>();
  const secret =
    challenge.mfaStage === "enroll" && challenge.secret
      ? challenge.secret
      : await opts.storedSecret();
  if (!check(`${opts.label} : secret TOTP disponible (${challenge.mfaStage})`, Boolean(secret))) {
    return false;
  }
  const step2 = await opts.browser.req(opts.totpPath, { json: { code: generateTotp(secret!) } });
  return check(
    `${opts.label} : étape 2 (TOTP) → session`,
    step2.status === 200,
    `HTTP ${step2.status} ${step2.text.slice(0, 200)}`,
  );
}

interface VerifyOutcome {
  result: string;
  holderName?: string;
  status: number;
}

/** Runs the public challenge → proof protocol against a share token. */
async function runVerify(token: string, reuseNonce?: string): Promise<VerifyOutcome & { nonce: string }> {
  const anon = new Browser(API);
  let nonce = reuseNonce;
  if (!nonce) {
    const challenge = await anon.req(`/verify/${token}/challenge`, { json: {} });
    if (challenge.status !== 200) return { result: `challenge HTTP ${challenge.status}`, status: challenge.status, nonce: "" };
    nonce = challenge.json<{ nonce: string }>().nonce;
  }
  const proof = await anon.req(`/verify/${token}/proof`, { json: { nonce } });
  if (proof.status !== 200) return { result: `proof HTTP ${proof.status}`, status: proof.status, nonce };
  const body = proof.json<{ result: string; diploma?: { holderName: string } }>();
  return { result: body.result, holderName: body.diploma?.holderName, status: proof.status, nonce };
}

/** Comme runVerify, mais rend le corps brut (inspection du bundle + test de fuite). */
async function runVerifyRaw(
  token: string,
): Promise<{ status: number; text: string; parsed: unknown }> {
  const anon = new Browser(API);
  const challenge = await anon.req(`/verify/${token}/challenge`, { json: {} });
  if (challenge.status !== 200) {
    return { status: challenge.status, text: challenge.text, parsed: null };
  }
  const { nonce } = challenge.json<{ nonce: string }>();
  const proof = await anon.req(`/verify/${token}/proof`, { json: { nonce } });
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(proof.text);
  } catch {
    /* corps non-JSON : parsed reste null */
  }
  return { status: proof.status, text: proof.text, parsed };
}

interface EudiStatusProbe {
  uri: string;
  index: number;
  issuer: string;
}

async function fetchIssuerJwk(issuer: string, kid: string): Promise<JWK | null> {
  const response = await fetch(`${issuer}/.well-known/jwt-vc-issuer`);
  if (!response.ok) return null;
  const body = (await response.json()) as { jwks?: { keys?: JWK[] } };
  return body.jwks?.keys?.find((key) => key.kid === kid) ?? null;
}

async function statusBit(probe: EudiStatusProbe): Promise<number | null> {
  const response = await fetch(probe.uri, {
    headers: { accept: "application/statuslist+jwt" },
  });
  if (!response.ok) return null;
  const token = await response.text();
  const header = decodeProtectedHeader(token);
  const key = typeof header.kid === "string" ? await fetchIssuerJwk(probe.issuer, header.kid) : null;
  if (!key) return null;
  const verified = await verifyStatusListToken(token, {
    issuerPublicKey: key,
    issuer: probe.issuer,
    uri: probe.uri,
  });
  return verified.statuses[probe.index] ?? null;
}

/** Complete pre-authorized OpenID4VCI flow against the real composed API. */
async function runEudiFlow(
  browser: Browser,
  diplomaId: string,
): Promise<EudiStatusProbe | null> {
  const created = await browser.req(`/wallet/diplomas/${diplomaId}/eudi-offer`, { json: {} });
  const createdBody =
    created.status === 201
      ? created.json<{ offerDeepLink: string; txCode: string; expiresAt: string }>()
      : null;
  const createdOk = check(
    "EUDI : offre interne + tx_code → 201",
    Boolean(
      createdBody &&
        createdBody.offerDeepLink.startsWith("openid-credential-offer://") &&
        /^\d{5}$/.test(createdBody.txCode),
    ),
    `HTTP ${created.status} ${created.text.slice(0, 160)}`,
  );
  if (!createdOk || !createdBody) return null;

  const offerUri = new URL(createdBody.offerDeepLink).searchParams.get("credential_offer_uri");
  const offerResponse = offerUri ? await fetch(offerUri) : null;
  const offer =
    offerResponse?.ok
      ? ((await offerResponse.json()) as {
          credential_issuer: string;
          credential_configuration_ids: string[];
          grants: Record<string, { "pre-authorized_code": string }>;
        })
      : null;
  const grant = offer?.grants["urn:ietf:params:oauth:grant-type:pre-authorized_code"];
  const authorizationMetadataResponse = offer
    ? await fetch(`${offer.credential_issuer}/.well-known/oauth-authorization-server`)
    : null;
  const authorizationMetadata = authorizationMetadataResponse?.ok
    ? ((await authorizationMetadataResponse.json()) as {
        "pre-authorized_grant_anonymous_access_supported"?: boolean;
      })
    : null;
  const offerOk = check(
    "EUDI : credential_offer_uri retourne l’offre standard",
    Boolean(
      offer &&
        offer.credential_configuration_ids.includes("certifychain-diploma") &&
        grant?.["pre-authorized_code"] &&
        authorizationMetadata?.["pre-authorized_grant_anonymous_access_supported"] === true,
    ),
    offerResponse
      ? `offer ${offerResponse.status} · metadata ${authorizationMetadataResponse?.status ?? "absente"}`
      : "URI absente",
  );
  if (!offerOk || !offer || !grant) return null;

  const nonceResponse = await fetch(`${offer.credential_issuer}/vc/nonce`, { method: "POST" });
  const nonce = nonceResponse.ok
    ? ((await nonceResponse.json()) as { c_nonce?: string }).c_nonce
    : undefined;
  if (!check("EUDI : nonce endpoint retourne c_nonce", Boolean(nonce), `HTTP ${nonceResponse.status}`) || !nonce) {
    return null;
  }

  const tokenForm = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:pre-authorized_code",
    "pre-authorized_code": grant["pre-authorized_code"],
    tx_code: createdBody.txCode,
  });
  const tokenResponse = await fetch(`${offer.credential_issuer}/vc/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: tokenForm,
  });
  const tokenBody = tokenResponse.ok
    ? ((await tokenResponse.json()) as { access_token?: string; token_type?: string })
    : null;
  if (
    !check(
      "EUDI : échange pre-authorized code → Bearer",
      Boolean(tokenBody?.access_token && tokenBody.token_type === "Bearer"),
      `HTTP ${tokenResponse.status}`,
    ) ||
    !tokenBody?.access_token
  ) {
    return null;
  }

  const replayResponse = await fetch(`${offer.credential_issuer}/vc/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: tokenForm,
  });
  const replayBody = (await replayResponse.json()) as { error?: string };
  check(
    "EUDI : rejeu du pre-authorized code → invalid_grant",
    replayResponse.status === 400 && replayBody.error === "invalid_grant",
    `HTTP ${replayResponse.status} ${JSON.stringify(replayBody)}`,
  );

  const holder = await generateKeyPair("ES256", { extractable: true });
  const holderJwk = await exportJWK(holder.publicKey);
  const proof = await new SignJWT({ nonce })
    .setProtectedHeader({ alg: "ES256", typ: "openid4vci-proof+jwt", jwk: holderJwk })
    .setAudience(offer.credential_issuer)
    .setIssuedAt()
    .sign(holder.privateKey);
  const credentialResponse = await fetch(`${offer.credential_issuer}/vc/credential`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${tokenBody.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      credential_configuration_id: "certifychain-diploma",
      proofs: { jwt: [proof] },
    }),
  });
  const credentialBody = credentialResponse.ok
    ? ((await credentialResponse.json()) as { credentials?: Array<{ credential?: string }> })
    : null;
  const credential = credentialBody?.credentials?.[0]?.credential;
  let probe: EudiStatusProbe | null = null;
  let credentialValid = false;
  if (credential) {
    const issuerJwt = credential.split("~")[0];
    if (issuerJwt) {
      const header = decodeProtectedHeader(issuerJwt);
      const kid = typeof header.kid === "string" ? header.kid : null;
      const key = kid
        ? await fetchIssuerJwk(offer.credential_issuer, kid)
        : null;
      if (key && kid) {
        const verified = await verifySdJwtVc(credential, {
          issuerPublicKey: key,
          issuer: offer.credential_issuer,
          issuerKid: kid,
        });
        const reference = verified.payload.status as
          | { status_list?: { idx?: number; uri?: string } }
          | undefined;
        if (
          verified.disclosedClaims.diploma_id === diplomaId &&
          typeof reference?.status_list?.idx === "number" &&
          typeof reference.status_list.uri === "string"
        ) {
          credentialValid = true;
          probe = {
            uri: reference.status_list.uri,
            index: reference.status_list.idx,
            issuer: offer.credential_issuer,
          };
        }
      }
    }
  }
  check(
    "EUDI : Credential Response contient un dc+sd-jwt vérifiable et ses disclosures",
    credentialResponse.status === 200 && Boolean(credential?.includes("~")) && credentialValid,
    `HTTP ${credentialResponse.status}`,
  );
  if (!probe) return null;

  check(
    "EUDI : status list initiale = valide (bit 0)",
    (await statusBit(probe)) === 0,
  );
  return probe;
}

function syntheticNir(offset = 0): string {
  // Unique, fabricated stem: it is never sourced from or tied to a real person.
  const stem = `1${(Date.now() + offset).toString().padStart(12, "0").slice(-12)}`;
  const modulus = BigInt(97);
  const key = Number(modulus - (BigInt(stem) % modulus));
  return `${stem}${key.toString().padStart(2, "0")}`;
}

async function resolveUnfinishedCdcBatches(browser: Browser): Promise<void> {
  const response = await browser.req("/cdc/exports?page=1&pageSize=100");
  if (response.status !== 200) return;
  const batches = response.json<{ items: Array<{ id: string; status: string }> }>().items;
  for (const batch of batches) {
    if (batch.status === "generated") {
      await browser.req(`/cdc/exports/${batch.id}/cancel`, { json: {} });
    } else if (batch.status === "submitted") {
      const items = await db
        .select({ id: cdcExportItems.id })
        .from(cdcExportItems)
        .where(eq(cdcExportItems.exportId, batch.id));
      const content = `<compteRendu><passagesOK>${items
        .map((item) => `<passage><idTechnique>${item.id}</idTechnique></passage>`)
        .join("")}</passagesOK></compteRendu>`;
      await browser.req(`/cdc/exports/${batch.id}/crt`, { json: { content } });
    }
  }
}

async function runCdcFlow(
  adminBrowser: Browser,
  schoolBrowser: Browser,
  schoolId: string,
): Promise<void> {
  const activation = await adminBrowser.req(`/admin/schools/${schoolId}/cdc`, {
    json: { enabled: true },
  });
  check(
    "CDC : activation plateforme → module actif",
    activation.status === 200 && activation.json<{ cdcEnabled?: boolean }>().cdcEnabled === true,
    `HTTP ${activation.status} ${activation.text.slice(0, 140)}`,
  );

  await resolveUnfinishedCdcBatches(schoolBrowser);
  const settings = await schoolBrowser.req("/cdc/settings", {
    method: "PUT",
    json: {
      certificateurSiret: "12345678901234",
      contactEmail: "cdc-smoke@ecole-demo.fr",
      emitterIdClient: "EMET0001",
      certificateurIdClient: "CERT0001",
      contractId: "SMOKE-CDC",
    },
  });
  check(
    "CDC : configuration officielle enregistrée",
    settings.status === 200 && settings.json<{ emitterIdClient?: string }>().emitterIdClient === "EMET0001",
    `HTTP ${settings.status} ${settings.text.slice(0, 140)}`,
  );

  const issueOne = await schoolBrowser.req("/diplomas", {
    json: {
      holderName: "Titulaire CDC Smoke A",
      holderEmail: `cdc.a.${RUN_ID}@ecole-demo.fr`,
      programTitle: "Certification CDC E2E",
      mention: "Admis",
      rncp: "RNCP99998",
      issuedAt: "2026-07-02",
      externalId: `CDC-SMOKE-A-${RUN_ID}`,
    },
  });
  const issueTwo = await schoolBrowser.req("/diplomas", {
    json: {
      holderName: "Titulaire CDC Smoke B",
      holderEmail: `cdc.b.${RUN_ID}@ecole-demo.fr`,
      programTitle: "Certification CDC E2E",
      mention: "Admis",
      rncp: "RNCP99998",
      issuedAt: "2026-07-03",
      externalId: `CDC-SMOKE-B-${RUN_ID}`,
    },
  });
  const diplomaIds = [issueOne, issueTwo]
    .map((response) => response.status === 201 ? response.json<{ id: string }>().id : null)
    .filter((id): id is string => id !== null);
  const eligible = await schoolBrowser.req("/cdc/eligible");
  const eligibleRows = eligible.status === 200
    ? eligible.json<Array<{ id: string; identityComplete: boolean }>>()
    : [];
  check(
    "CDC : 2 diplômes RNCP actifs éligibles, identités initialement absentes",
    diplomaIds.length === 2 && diplomaIds.every((id) =>
      eligibleRows.some((row) => row.id === id && row.identityComplete === false)),
    `issues ${issueOne.status}/${issueTwo.status} · eligible ${eligible.status}`,
  );
  const diplomaIdOne = diplomaIds[0];
  const diplomaIdTwo = diplomaIds[1];
  if (!diplomaIdOne || !diplomaIdTwo) return;

  const nirs = [syntheticNir(0), syntheticNir(1)];
  const identityOne = await schoolBrowser.req("/cdc/identities", {
    json: {
      diplomaId: diplomaIdOne,
      nir: nirs[0],
      birthLastName: "NOM-FABRIQUE-SMOKE-A",
      obtentionMethod: "PAR_ADMISSION",
    },
  });
  const identityTwo = await schoolBrowser.req("/cdc/identities", {
    json: {
      diplomaId: diplomaIdTwo,
      nir: nirs[1],
      birthLastName: "NOM-FABRIQUE-SMOKE-B",
      obtentionMethod: "PAR_ADMISSION",
    },
  });

  const generated = await schoolBrowser.req("/cdc/exports", {
    json: { diplomaIds },
  });
  const generatedBody = generated.status === 201
    ? generated.json<{ id: string; fileSha256: string; counts: { total: number } }>()
    : null;
  const exportId = generatedBody?.id ?? null;
  const file = exportId ? await schoolBrowser.req(`/cdc/exports/${exportId}/file`) : null;
  const itemIds = file
    ? Array.from(file.text.matchAll(/<cpf:idTechnique>([^<]+)<\/cpf:idTechnique>/g), (match) => match[1])
        .filter((id): id is string => id !== undefined)
    : [];
  const downloadedSha256 = file
    ? createHash("sha256").update(file.text, "utf8").digest("hex")
    : null;
  check(
    "CDC : lot de 2 généré, XML téléchargeable et SHA-256 identique au DTO",
    generated.status === 201 &&
      generatedBody?.counts.total === 2 &&
      file?.status === 200 &&
      file.headers.get("content-type")?.startsWith("application/xml") === true &&
      generatedBody.fileSha256 === file.headers.get("x-content-sha256") &&
      generatedBody.fileSha256 === downloadedSha256 &&
      itemIds.length === 2,
    `generate ${generated.status} · file ${file?.status ?? "absent"}`,
  );
  if (!exportId || itemIds.length !== 2) return;

  const submitted = await schoolBrowser.req(`/cdc/exports/${exportId}/submitted`, { json: {} });
  const crt = await schoolBrowser.req(`/cdc/exports/${exportId}/crt`, {
    json: {
      content: `<compteRendu><passagesOK>${itemIds
        .map((itemId) => `<passage><idTechnique>${itemId}</idTechnique></passage>`)
        .join("")}</passagesOK></compteRendu>`,
    },
  });
  const crtBody = crt.status === 200
    ? crt.json<{ status?: string; counts?: { accepted?: number; pending?: number } }>()
    : null;
  check(
    "CDC : dépôt puis CRT accepté résolvent atomiquement le lot",
    submitted.status === 200 &&
      crt.status === 200 &&
      crtBody?.status === "accepted" &&
      crtBody.counts?.accepted === 2 &&
      crtBody.counts.pending === 0,
    `submitted ${submitted.status} · crt ${crt.status} ${crt.text.slice(0, 140)}`,
  );

  const changedSettings = await schoolBrowser.req("/cdc/settings", {
    method: "PUT",
    json: {
      certificateurSiret: "12345678901234",
      contactEmail: "cdc-smoke@ecole-demo.fr",
      emitterIdClient: "EMET0002",
      certificateurIdClient: "CERT0002",
      contractId: "SMOKE-CDC-V2",
    },
  });
  const historicalFile = await schoolBrowser.req(`/cdc/exports/${exportId}/file`);
  check(
    "CDC : un lot résolu reste byte-identique après changement de configuration",
    changedSettings.status === 200 &&
      historicalFile.status === 200 &&
      historicalFile.text === file?.text &&
      historicalFile.headers.get("x-content-sha256") === file?.headers.get("x-content-sha256"),
    `settings ${changedSettings.status} · file ${historicalFile.status}`,
  );

  const jsonResponses = [
    activation,
    settings,
    issueOne,
    issueTwo,
    eligible,
    identityOne,
    identityTwo,
    generated,
    submitted,
    crt,
    changedSettings,
  ];
  const leakedNir = jsonResponses.some((response) =>
    /"nir"\s*:/i.test(response.text) || nirs.some((nir) => response.text.includes(nir)),
  );
  check(
    "CDC : 2 identités chiffrées, aucun NIR dans aucune réponse JSON",
    identityOne.status === 201 &&
      identityTwo.status === 201 &&
      identityOne.json<{ identityComplete?: boolean }>().identityComplete === true &&
      identityTwo.json<{ identityComplete?: boolean }>().identityComplete === true &&
      !leakedNir,
    `identities ${identityOne.status}/${identityTwo.status}`,
  );
}

/* ── Main ───────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log(`Smoke E2E — API ${API} · web ${WEB} · wallet ${WALLET} · admin ${ADMIN}`);
  const { school, admin, demoLink } = await loadFixtures();

  /* 1 ─ Liveness + front pages */
  section("Santé & pages");
  const anon = new Browser(API);
  const health = await anon.req("/health");
  check("API /health = 200 ok", health.status === 200 && health.json<{ status: string }>().status === "ok");
  check(
    "API : en-têtes durcis (nosniff)",
    health.headers.get("x-content-type-options") === "nosniff",
  );
  for (const [label, url] of [
    ["web /", `${WEB}/`],
    [`web /verify/:token`, `${WEB}/verify/${demoLink.token}`],
    ["wallet /login", `${WALLET}/login`],
    ["admin /login", `${ADMIN}/login`],
  ] as const) {
    const res = await fetch(url, { redirect: "manual" });
    check(`${label} répond 200`, res.status === 200, `HTTP ${res.status}`);
    await res.arrayBuffer(); // drain
  }

  /* 2 ─ Recruiter: public verification protocol */
  section("Vérification publique (recruteur)");
  const v1 = await runVerify(demoLink.token);
  check("lien seedé → verified", v1.result === "verified", v1.result);
  check("divulgation minimale : holderName présent", v1.holderName === "Alex Dubois", String(v1.holderName));
  const replay = await runVerify(demoLink.token, v1.nonce);
  check("anti-rejeu : même nonce → invalid", replay.result === "invalid", replay.result);
  const forged = await runVerify(demoLink.token, "forged-nonce-0123456789");
  check("nonce forgé → invalid", forged.result === "invalid", forged.result);
  const unknown = await runVerify("jeton-inconnu-000000000000");
  check("token inconnu → not_found", unknown.result === "not_found", unknown.result);

  /* 3 ─ School admin: login (password + TOTP), list, wrong-password path */
  section("Portail école (login MFA, liste)");
  const schoolBrowser = new Browser(API);
  const wrong = await schoolBrowser.req("/auth/school/login", {
    json: { email: SCHOOL_ADMIN_EMAIL, password: "MauvaisMotDePasse!1" },
  });
  check(
    "mauvais mot de passe → 401 invalid_credentials",
    wrong.status === 401 && wrong.json<{ error: { code: string } }>().error.code === "invalid_credentials",
    `HTTP ${wrong.status} ${wrong.text.slice(0, 120)}`,
  );
  const schoolOk = await loginWithTotp({
    browser: schoolBrowser,
    loginPath: "/auth/school/login",
    totpPath: "/auth/school/login/totp",
    email: SCHOOL_ADMIN_EMAIL,
    password: SCHOOL_ADMIN_PASSWORD,
    storedSecret: async () =>
      admin.totpSecret ? keyVault.decryptToString(admin.totpSecret) : null,
    label: "login école",
  });
  if (schoolOk) {
    const me = await schoolBrowser.req("/auth/me");
    check(
      "GET /auth/me → school_admin",
      me.status === 200 && me.json<{ role: string }>().role === "school_admin",
    );
    const list = await schoolBrowser.req("/diplomas?page=1&pageSize=50");
    const listBody = list.status === 200 ? list.json<{ items: { externalId: string | null }[] }>() : { items: [] };
    check(
      "GET /diplomas contient DEMO-001",
      listBody.items.some((d) => d.externalId === "DEMO-001"),
      `HTTP ${list.status}`,
    );
  }

  /* 4 ─ Issuance → claim invite → student claims → wallet + share + verify */
  section("Émission → claim élève → partage → vérification");
  let claimToken: string | null = null;
  let issuedId: string | null = null;
  if (schoolOk) {
    const issue = await schoolBrowser.req("/diplomas", {
      json: {
        holderName: "Étudiant Smoke",
        holderEmail: CLAIM_SCHOOL_EMAIL,
        programTitle: "Licence Test E2E",
        mention: "Bien",
        rncp: "RNCP99999",
        // Date distinctive : le test de fuite par sous-chaîne (V1 SD) cherche cette
        // valeur dans la réponse — elle ne doit pouvoir venir d'aucun autre champ.
        issuedAt: "2019-03-27",
        externalId: `SMOKE-${RUN_ID}`,
      },
    });
    check("POST /diplomas (émission) → 201", issue.status === 201, `HTTP ${issue.status} ${issue.text.slice(0, 200)}`);
    issuedId = issue.status === 201 ? issue.json<{ id: string }>().id : null;

    const claimMail = await latestMailTo(CLAIM_SCHOOL_EMAIL, CLAIM_URL_RE);
    claimToken = claimMail?.match(CLAIM_URL_RE)?.[1] ?? null;
    check("invitation claim reçue (Mailpit) avec lien /claim/:token", Boolean(claimToken));
  }

  const studentBrowser = new Browser(API);
  if (claimToken) {
    const landing = await fetch(`${WALLET}/claim/${claimToken}`, { redirect: "manual" });
    check("wallet /claim/:token répond 200", landing.status === 200, `HTTP ${landing.status}`);
    await landing.arrayBuffer();

    const info = await studentBrowser.req(`/auth/student/claim/${claimToken}`);
    const infoBody = info.json<{ status: string; maskedEmail: string | null; schoolName: string | null }>();
    check("claim info → pending + école", infoBody.status === "pending" && infoBody.schoolName === school.name, info.text.slice(0, 160));
    check(
      "claim info : email masqué (pas de fuite)",
      Boolean(infoBody.maskedEmail) && !infoBody.maskedEmail!.includes(CLAIM_SCHOOL_EMAIL.split("@")[0] ?? "§"),
      String(infoBody.maskedEmail),
    );
    const badInfo = await studentBrowser.req(`/auth/student/claim/jeton-bidon-000`);
    check("claim info token bidon → not_found", badInfo.json<{ status: string }>().status === "not_found");

    const reqOtp = await studentBrowser.req(`/auth/student/claim/${claimToken}/otp/request`, {
      json: { email: CLAIM_PERSONAL_EMAIL },
    });
    check("claim : demande OTP → ok", reqOtp.status === 200, `HTTP ${reqOtp.status}`);
    const otpMail = await latestMailTo(CLAIM_PERSONAL_EMAIL, OTP_RE);
    const code = otpMail?.match(OTP_RE)?.[1] ?? null;
    check("claim : OTP reçu (Mailpit)", Boolean(code));
    if (code) {
      const verify = await studentBrowser.req(`/auth/student/claim/${claimToken}/otp/verify`, {
        json: { email: CLAIM_PERSONAL_EMAIL, code },
      });
      check(
        "claim : vérif OTP → session élève",
        verify.status === 200 && verify.json<{ role: string }>().role === "student",
        `HTTP ${verify.status} ${verify.text.slice(0, 160)}`,
      );

      const walletList = await studentBrowser.req("/wallet/diplomas");
      const owned = walletList.status === 200 ? walletList.json<{ id: string }[]>() : [];
      check("wallet : le diplôme émis est visible", owned.some((d) => d.id === issuedId), `HTTP ${walletList.status}`);

      if (issuedId) {
        const share = await studentBrowser.req(`/wallet/diplomas/${issuedId}/share`, {
          json: { expiresInDays: 30 },
        });
        check("wallet : création lien de partage → 201", share.status === 201, `HTTP ${share.status} ${share.text.slice(0, 160)}`);
        const shareToken = share.status === 201 ? share.json<{ token: string }>().token : null;

        if (shareToken) {
          const vNew = await runVerify(shareToken);
          check("nouveau lien → verified", vNew.result === "verified", vNew.result);

          const revoke = await studentBrowser.req(`/wallet/shares/${shareToken}/revoke`, { json: {} });
          check("wallet : révocation du lien → ok", revoke.status === 200, `HTTP ${revoke.status}`);
          const vRevokedLink = await runVerify(shareToken);
          check("lien révoqué → not_found", vRevokedLink.result === "not_found", vRevokedLink.result);
        }

        // P6 (PLAN.md, audit R1) : la fusion publique des 5 états en
        // « Vérifié / Introuvable » (v4-front §2.2) est une couche de
        // PRÉSENTATION uniquement — le serveur doit continuer à distinguer
        // "expired" en interne (API/audit), jamais le confondre avec
        // "not_found"/"invalid" côté contrat, même si le front leur donne
        // désormais le même rendu (`FailedCard`). Un lien fraîchement créé
        // dont l'expiration est forcée dans le passé (le schéma refuse
        // `expiresInDays <= 0`, d'où la manipulation directe en base, comme
        // pour les autres scénarios de ce script qui lisent/écrivent la DB).
        const shareExp = await studentBrowser.req(`/wallet/diplomas/${issuedId}/share`, {
          json: { expiresInDays: 1 },
        });
        const shareExpToken =
          shareExp.status === 201 ? shareExp.json<{ token: string }>().token : null;
        if (shareExpToken) {
          await db
            .update(shareLinks)
            .set({ expiresAt: new Date(Date.now() - 60_000) })
            .where(eq(shareLinks.token, shareExpToken));
          const vExpired = await runVerify(shareExpToken);
          check(
            'P6 : lien expiré → "expired" toujours distinct en interne (5 états API préservés)',
            vExpired.result === "expired",
            vExpired.result,
          );
        } else {
          check(
            'P6 : lien expiré → "expired" toujours distinct en interne (5 états API préservés)',
            false,
            `share HTTP ${shareExp.status}`,
          );
        }

        /* V1 — divulgation sélective native (ed25519-sd-v2 / -v3 selon PQ_POLICY) */
        section(`Divulgation sélective (${EXPECTED_SD_ENGINE})`);
        // Oracle de révocation AVANT révocation (comparé plus bas au 404 d'après).
        const oracleBefore = await fetch(`${API}/verify/revocation/${issuedId}`);
        const oracleBeforeBody = oracleBefore.ok
          ? ((await oracleBefore.json()) as { status?: string })
          : null;
        if (!oracleBefore.ok) await oracleBefore.arrayBuffer().catch(() => undefined);

        const shareSel = await studentBrowser.req(`/wallet/diplomas/${issuedId}/share`, {
          json: { expiresInDays: 7, disclosedFields: ["holderName", "programTitle"] },
        });
        const shareSelToken =
          shareSel.status === 201 ? shareSel.json<{ token: string }>().token : null;
        let selBundle: ProofBundleDTO | null = null;
        let selText = "";
        if (shareSelToken) {
          const sel = await runVerifyRaw(shareSelToken);
          selText = sel.text;
          const selBody = sel.parsed as {
            result?: string;
            engine?: string;
            proofBundle?: ProofBundleDTO | null;
            hiddenCount?: number;
          } | null;
          selBundle = selBody?.proofBundle ?? null;
          check(
            `V1 SD : partage à 2 champs → verified, bundle ${EXPECTED_SD_ENGINE} à 2 disclosures`,
            sel.status === 200 &&
              selBody?.result === "verified" &&
              // Le moteur RAPPORTÉ (réponse + audit) et celui PORTÉ par le bundle
              // doivent coïncider, et tous deux correspondre à la version réelle
              // de la preuve : annoncer "v2" sur une preuve hybride sous-déclare
              // à vie la nature de ce qui a été vérifié.
              selBody.engine === EXPECTED_SD_ENGINE &&
              selBundle?.engine === EXPECTED_SD_ENGINE &&
              selBundle.disclosures.length === 2 &&
              selBody.hiddenCount === 5,
            `HTTP ${sel.status} ${sel.text.slice(0, 160)}`,
          );
        } else {
          check(
            `V1 SD : partage à 2 champs → verified, bundle ${EXPECTED_SD_ENGINE} à 2 disclosures`,
            false,
            `share HTTP ${shareSel.status} ${shareSel.text.slice(0, 160)}`,
          );
        }

        const selLocal = selBundle ? await verifyProofBundle(selBundle, TRUSTED_ROOTS) : null;
        const selLocalOk = selLocal !== null && selLocal.ok ? selLocal : null;
        check(
          "V1 SD : vérification LOCALE du bundle (verifyProofBundle) → ok, 5 champs masqués",
          selLocalOk !== null &&
            selLocalOk.hidden === 5 &&
            selLocalOk.disclosed.holderName === "Étudiant Smoke",
          selLocal ? JSON.stringify(selLocal).slice(0, 160) : "bundle absent",
        );

        // Fuite par sous-chaîne : les 5 valeurs non divulguées ne doivent apparaître
        // NULLE PART dans la réponse sérialisée (v2.md §V1-7.6).
        const hiddenValues = [CLAIM_SCHOOL_EMAIL, '"Bien"', "RNCP99999", "2019-03-27", `SMOKE-${RUN_ID}`];
        check(
          "V1 SD : aucune valeur non divulguée dans le JSON de réponse",
          selText.length > 0 && hiddenValues.every((v) => !selText.includes(v)),
          hiddenValues.filter((v) => selText.includes(v)).join(", ") || "réponse vide",
        );

        /* V3 — Journal de transparence (registre public horodaté) */
        section("Journal de transparence (V3)");

        // 1) Preuve d'inclusion publique, vérifiée LOCALEMENT (merkle partagé) contre
        //    la racine du checkpoint signé — le recruteur ne fait confiance à personne.
        const inclusionRes = await fetch(`${API}/log/inclusion/${issuedId}`);
        const inclusion = inclusionRes.ok
          ? ((await inclusionRes.json()) as TransparencyProofDTO)
          : null;
        if (!inclusionRes.ok) await inclusionRes.arrayBuffer().catch(() => undefined);
        const inclusionLocalOk =
          inclusion !== null &&
          verifyInclusion({
            leafHashHex: inclusion.leafHash,
            leafIndex: inclusion.leafIndex,
            treeSize: inclusion.checkpoint.treeSize,
            auditPathHex: inclusion.auditPath,
            rootHashHex: inclusion.checkpoint.rootHash,
          });
        check(
          "V3 : /log/inclusion → inclusion RFC 6962 vérifiée localement contre la racine",
          inclusionRes.status === 200 && inclusionLocalOk,
          `HTTP ${inclusionRes.status}`,
        );

        // 2) Un partage v2 par défaut (issuedAt divulgué) porte `transparency` non nul,
        //    validé par le vérificateur partagé — binding "full" + signature checkpoint.
        const shareTp = await studentBrowser.req(`/wallet/diplomas/${issuedId}/share`, {
          json: { expiresInDays: 7 },
        });
        const shareTpToken =
          shareTp.status === 201 ? shareTp.json<{ token: string }>().token : null;
        let tpBundle: ProofBundleDTO | null = null;
        if (shareTpToken) {
          const raw = await runVerifyRaw(shareTpToken);
          tpBundle =
            (raw.parsed as { proofBundle?: ProofBundleDTO | null } | null)?.proofBundle ?? null;
        }
        const tpOutcome = tpBundle ? await verifyTransparency(tpBundle, TRUSTED_ROOTS) : null;
        check(
          'V3 : bundle v2 porte `transparency`, verifyTransparency locale ok, binding "full"',
          tpBundle?.transparency != null &&
            tpOutcome !== null &&
            tpOutcome.ok &&
            tpOutcome.binding === "full",
          tpOutcome ? JSON.stringify(tpOutcome).slice(0, 160) : "bundle transparency absent",
        );

        // 3) Consistance append-only entre deux tailles, vérifiée localement. On force
        //    une 2ᵉ feuille puis on compare le checkpoint avant/après.
        const issue2 = await schoolBrowser.req("/diplomas", {
          json: {
            holderName: "Témoin Consistance V3",
            holderEmail: `v3.consistency.${RUN_ID}@ecole-demo.fr`,
            programTitle: "Diplôme témoin V3",
            issuedAt: "2026-07-15",
            externalId: `V3-CONS-${RUN_ID}`,
          },
        });
        const issue2Id = issue2.status === 201 ? issue2.json<{ id: string }>().id : null;
        let consistencyLocalOk = false;
        let consistencyStatus = 0;
        let consText = "";
        if (inclusion && issue2Id) {
          const inc2Res = await fetch(`${API}/log/inclusion/${issue2Id}`);
          const inc2 = inc2Res.ok ? ((await inc2Res.json()) as TransparencyProofDTO) : null;
          if (!inc2Res.ok) await inc2Res.arrayBuffer().catch(() => undefined);
          const from = inclusion.checkpoint.treeSize;
          const to = inc2?.checkpoint.treeSize ?? from;
          if (inc2 && to > from) {
            const consRes = await fetch(`${API}/log/consistency?from=${from}&to=${to}`);
            consistencyStatus = consRes.status;
            consText = consRes.ok ? await consRes.text() : "";
            if (!consRes.ok) await consRes.arrayBuffer().catch(() => undefined);
            const cons = consText ? (JSON.parse(consText) as LogConsistencyDTO) : null;
            consistencyLocalOk =
              cons !== null &&
              cons.fromRoot === inclusion.checkpoint.rootHash &&
              cons.toRoot === inc2.checkpoint.rootHash &&
              verifyConsistency({
                fromSize: cons.fromSize,
                toSize: cons.toSize,
                fromRootHex: cons.fromRoot,
                toRootHex: cons.toRoot,
                proofHex: cons.proof,
              });
          }
        }
        // Assert gratuit : aucune PII de diplôme dans les OBJETS transparency (seule la
        // feuille HACHÉE) — le test de fuite reste vert même quand issuedAt est masqué.
        const transparencyBlobs = [
          inclusion ? JSON.stringify(inclusion) : "",
          tpBundle?.transparency ? JSON.stringify(tpBundle.transparency) : "",
          consText,
        ].join(" ");
        const piiNeedles = ["Étudiant Smoke", CLAIM_SCHOOL_EMAIL, "Licence Test E2E", "2019-03-27"];
        const noPii = piiNeedles.every((n) => !transparencyBlobs.includes(n));
        check(
          "V3 : /log/consistency vérifiée localement (append-only) + zéro PII transparency",
          consistencyLocalOk && noPii,
          consistencyLocalOk ? `PII fuite: ${piiNeedles.filter((n) => transparencyBlobs.includes(n)).join(", ")}` : `consistency HTTP ${consistencyStatus}`,
        );

        /* V4-b — Post-quantique hybride, couche présentation (v2.md §V4-1) */
        section("Post-quantique hybride — présentation (V4-b)");

        // `PQ_POLICY` defaults to "require" since 2026-07-28 (config/env.ts) —
        // so in a STANDARD deployment `env.pqEnabled` is true and this check
        // trivially passes via the `env.pqEnabled ||` short-circuit: its real
        // assertion (a plain v2 bundle carries NO PQ field at all) is only
        // exercised when an operator has explicitly opted OUT with
        // `PQ_POLICY=off` (dev/demo only — see .env.example). Kept as its own
        // `check()` either way so the running total below stays meaningful
        // (it always contributes one line to "N vérifications"): a half-hybrid
        // bundle — PQ fields present on something the front doesn't badge, or
        // absent from something it does — is exactly the shape a forger would
        // exploit, so this stays asserted whichever policy is active.
        check(
          "PQ_POLICY=off (opt-out explicite) : bundle v2 sans aucun champ PQ (signaturePq/publicKeyPq/certificatePq)",
          env.pqEnabled ||
            (tpBundle?.engine === "ed25519-sd-v2" &&
              !tpBundle.signaturePq &&
              !tpBundle.school.publicKeyPq &&
              !tpBundle.school.certificatePq &&
              !tpBundle.root.publicKeyPq),
          tpBundle
            ? JSON.stringify({ engine: tpBundle.engine, hasPq: Boolean(tpBundle.signaturePq) })
            : "bundle absent",
        );

        // Exercised whenever `PQ_POLICY` != "off" — i.e. on EVERY standard
        // Gate C run now that "require" is the default (only skipped if an
        // operator explicitly set `PQ_POLICY=off`). When it runs, the bundle
        // must be hybrid "AND": BOTH signatures present, and
        // `verifyProofBundle` (the SAME function the recruiter's browser
        // runs) must validate BOTH locally — never "OR". These 2 checks used
        // to be the rare/conditional branch when the default was "off"; they
        // are now the common case, which is WHY the total check count moved
        // from 64 to 66 (see CLAUDE.md §6).
        if (env.pqEnabled) {
          const tpLocalOutcome = tpBundle ? await verifyProofBundle(tpBundle, TRUSTED_ROOTS) : null;
          check(
            "PQ_POLICY≠off : bundle v3 (ed25519-sd-v3) porte signaturePq + certificats PQ école/racine",
            tpBundle?.engine === "ed25519-sd-v3" &&
              Boolean(tpBundle.signaturePq) &&
              Boolean(tpBundle.school.publicKeyPq) &&
              Boolean(tpBundle.school.certificatePq) &&
              Boolean(tpBundle.root.publicKeyPq),
            tpBundle ? JSON.stringify({ engine: tpBundle.engine }) : "bundle absent",
          );
          check(
            "PQ_POLICY≠off : verifyProofBundle valide LOCALEMENT les DEUX signatures (hybride ET, jamais OU)",
            tpLocalOutcome !== null && tpLocalOutcome.ok === true,
            tpLocalOutcome ? JSON.stringify(tpLocalOutcome).slice(0, 160) : "bundle absent",
          );
        }

        const eudiProbe = await runEudiFlow(studentBrowser, issuedId);

        const revokeDiploma = await schoolBrowser.req(`/diplomas/${issuedId}/revoke`, {
          json: { reason: "Révocation test E2E" },
        });
        check("école : révocation du diplôme → 200", revokeDiploma.status === 200, `HTTP ${revokeDiploma.status}`);
        if (eudiProbe) {
          check(
            "EUDI : révocation produit dérivée dans la status list (bit 1)",
            (await statusBit(eudiProbe)) === 1,
          );
        }
        const share2 = await studentBrowser.req(`/wallet/diplomas/${issuedId}/share`, {
          json: { expiresInDays: 7 },
        });
        const share2Token = share2.status === 201 ? share2.json<{ token: string }>().token : null;
        if (share2Token) {
          const vRevoked = await runVerify(share2Token);
          check("diplôme révoqué → revoked", vRevoked.result === "revoked", vRevoked.result);

          // V1 SD : la crypto tient toujours (la preuve est autonome), mais le
          // statut réseau dit « révoqué » — c'est exactement la promesse honnête.
          const revokedRaw = await runVerifyRaw(share2Token);
          const revokedBody = revokedRaw.parsed as {
            result?: string;
            proofBundle?: ProofBundleDTO | null;
          } | null;
          const revokedBundle = revokedBody?.proofBundle ?? null;
          const revokedLocal = revokedBundle ? await verifyProofBundle(revokedBundle, TRUSTED_ROOTS) : null;
          check(
            "V1 SD : après révocation, bundle crypto valide mais revocation.status=revoked",
            revokedBody?.result === "revoked" &&
              revokedBundle?.revocation.status === "revoked" &&
              revokedLocal !== null &&
              revokedLocal.ok,
            `HTTP ${revokedRaw.status} ${revokedRaw.text.slice(0, 160)}`,
          );
        }

        // Oracle de révocation : 200 actif avant, 404 UNIFORME après (anti-énumération —
        // indistinguable d'un id inconnu, aucune donnée du diplôme).
        const oracleAfter = await fetch(`${API}/verify/revocation/${issuedId}`);
        await oracleAfter.arrayBuffer().catch(() => undefined);
        check(
          "V1 SD : oracle de révocation — 200 actif avant, 404 uniforme après",
          oracleBefore.status === 200 &&
            oracleBeforeBody?.status === "active" &&
            oracleAfter.status === 404,
          `avant ${oracleBefore.status} · après ${oracleAfter.status}`,
        );
      }

      const logout = await studentBrowser.req("/auth/logout", { json: {} });
      check("élève : logout (CSRF) → ok", logout.status === 200, `HTTP ${logout.status}`);
    }
  }

  /* 5 ─ Student OTP login on the seeded wallet */
  section("Login OTP élève (wallet seedé)");
  // Deterministic re-runs: drop previous codes so the 30 s resend cooldown
  // can't swallow the send (the old code is already consumed).
  await db.delete(otpCodes).where(sql`lower(${otpCodes.email}) = ${DEMO_STUDENT_EMAIL}`);
  const otpBrowser = new Browser(API);
  const unknownReq = await otpBrowser.req("/auth/student/otp/request", {
    json: { email: `inconnu.${RUN_ID}@example.com` },
  });
  check(
    "anti-énumération : email inconnu → ok:true quand même",
    unknownReq.status === 200 && unknownReq.json<{ ok: boolean }>().ok === true,
  );
  const reqLogin = await otpBrowser.req("/auth/student/otp/request", { json: { email: DEMO_STUDENT_EMAIL } });
  check("demande OTP élève → ok", reqLogin.status === 200);
  const loginMail = await latestMailTo(DEMO_STUDENT_EMAIL, OTP_RE);
  const loginCode = loginMail?.match(OTP_RE)?.[1] ?? null;
  check("OTP login reçu (Mailpit)", Boolean(loginCode));
  if (loginCode) {
    const bad = await otpBrowser.req("/auth/student/otp/verify", {
      json: { email: DEMO_STUDENT_EMAIL, code: loginCode === "000000" ? "111111" : "000000" },
    });
    check("mauvais code OTP → 401", bad.status === 401, `HTTP ${bad.status}`);
    const good = await otpBrowser.req("/auth/student/otp/verify", {
      json: { email: DEMO_STUDENT_EMAIL, code: loginCode },
    });
    check("bon code OTP → session élève", good.status === 200, `HTTP ${good.status} ${good.text.slice(0, 160)}`);
    const list = await otpBrowser.req("/wallet/diplomas");
    check(
      "wallet seedé : ≥ 1 diplôme listé",
      list.status === 200 && list.json<unknown[]>().length >= 1,
      `HTTP ${list.status}`,
    );
  }

  /* 6 ─ Platform admin (realm cc_admin_*) */
  section("Portail admin plateforme");
  const adminBrowser = new Browser(API, "cc_admin_csrf");
  let adminOk = false;
  for (const cand of ADMIN_CANDIDATES) {
    if (!cand.password) continue;
    const probe = await adminBrowser.req("/auth/admin/login", {
      json: { email: cand.email, password: cand.password },
    });
    if (probe.status !== 200) continue;
    const challenge = probe.json<MfaChallenge>();
    const secret =
      challenge.mfaStage === "enroll" && challenge.secret
        ? challenge.secret
        : await (async () => {
            const [row] = await db
              .select()
              .from(platformAdmins)
              .where(sql`lower(${platformAdmins.email}) = ${cand.email}`)
              .limit(1);
            return row?.totpSecret ? keyVault.decryptToString(row.totpSecret) : null;
          })();
    if (!secret) continue;
    const step2 = await adminBrowser.req("/auth/admin/login/totp", { json: { code: generateTotp(secret) } });
    if (step2.status === 200) {
      adminOk = true;
      break;
    }
  }
  check("login admin (mdp + TOTP) → session", adminOk);
  if (adminOk) {
    const meAdmin = await adminBrowser.req("/auth/admin/me");
    check("GET /auth/admin/me → admin", meAdmin.status === 200 && meAdmin.json<{ role: string }>().role === "admin");
    const stats = await adminBrowser.req("/admin/stats");
    const statsBody = stats.status === 200 ? stats.json<{ schools: { approved: number } }>() : null;
    check("GET /admin/stats : ≥ 1 école approuvée", (statsBody?.schools.approved ?? 0) >= 1, `HTTP ${stats.status}`);
    if (schoolOk) {
      section("Accrochage CDC (admin → école → CRT)");
      await runCdcFlow(adminBrowser, schoolBrowser, school.id);
    }
    const adminLogout = await adminBrowser.req("/auth/admin/logout", { json: {} });
    check("admin : logout (CSRF realm admin) → ok", adminLogout.status === 200, `HTTP ${adminLogout.status}`);
  }

  /* ── Summary ── */
  console.log(`\n${"═".repeat(64)}`);
  if (failures.length === 0) {
    console.log(`SMOKE OK — ${passed} vérifications, 0 échec`);
  } else {
    console.error(`SMOKE ÉCHEC — ${passed} ok, ${failures.length} échec(s) :`);
    for (const f of failures) console.error(`  ✘ ${f}`);
  }
  process.exitCode = failures.length === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(`SMOKE ÉCHEC (exception) : ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => void sqlClient.end({ timeout: 5 }));

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
import { and, eq, sql } from "drizzle-orm";
import { keyVault } from "../crypto/envelope";
import { db, sqlClient } from "../db/client";
import { diplomas, otpCodes, platformAdmins, schoolAdmins, schools, shareLinks } from "../db/schema";
import { generateTotp } from "../lib/totp";

/* ── Config (overridable via env) ───────────────────────────────────────── */

const API = process.env.SMOKE_API_URL ?? "http://127.0.0.1:4000";
const WEB = process.env.SMOKE_WEB_URL ?? "http://127.0.0.1:3000";
const WALLET = process.env.SMOKE_WALLET_URL ?? "http://127.0.0.1:3001";
const ADMIN = process.env.SMOKE_ADMIN_URL ?? "http://127.0.0.1:3002";
const MAILPIT = process.env.SMOKE_MAILPIT_URL ?? "http://127.0.0.1:8025";

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
        issuedAt: "2026-07-01",
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

        const revokeDiploma = await schoolBrowser.req(`/diplomas/${issuedId}/revoke`, {
          json: { reason: "Révocation test E2E" },
        });
        check("école : révocation du diplôme → 200", revokeDiploma.status === 200, `HTTP ${revokeDiploma.status}`);
        const share2 = await studentBrowser.req(`/wallet/diplomas/${issuedId}/share`, {
          json: { expiresInDays: 7 },
        });
        const share2Token = share2.status === 201 ? share2.json<{ token: string }>().token : null;
        if (share2Token) {
          const vRevoked = await runVerify(share2Token);
          check("diplôme révoqué → revoked", vRevoked.result === "revoked", vRevoked.result);
        }
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

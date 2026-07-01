import { promises as dnsp } from "node:dns";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { OWNERSHIP_VERIFICATION } from "../../config/constants";
import { env } from "../../config/env";
import type {
  CurrentVerificationDTO,
  VerificationMethodInfo,
  VerificationStateDTO,
} from "../../contract/dto";
import type { VerificationMethod } from "../../contract/enums";
import { keyVault } from "../../crypto";
import { db } from "../../db/client";
import {
  type School,
  type SchoolVerification,
  schoolVerifications,
  schools,
} from "../../db/schema";
import { fail } from "../../lib/http-error";
import { numericCode, urlToken, uuid } from "../../lib/ids";
import { lookupSiret } from "../../lib/insee";
import { logger } from "../../lib/logger";
import {
  sendOwnershipVerificationInvite,
  sendPostalDispatchOrder,
} from "../../lib/mailer";
import { hashOtp, verifyOtp } from "../../lib/otp";
import { buildAuthorizeUrl, exchangeAndVerify, normalizeSiret } from "../../lib/proconnect";
import { createCheckoutSession } from "../../lib/stripe";
import { recordAudit } from "../audit/audit.service";
import { approveSchool, getSchoolById } from "../schools/schools.service";

/* ── Pure helpers (unit-tested) ───────────────────────────────────────────── */

/** Domain derived from an email's host part (DNS-proof anchor). */
export function domainFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const d = email.slice(at + 1).trim().toLowerCase();
  return d.includes(".") ? d : null;
}

/** The exact DNS TXT value the school must publish. */
export function dnsRecordValue(token: string): string {
  return `certifychain-verify=${token}`;
}

/** True if any resolved TXT record carries our verification token. */
export function dnsTxtMatches(records: string[][], token: string): boolean {
  const needle = dnsRecordValue(token);
  return records.some((chunks) => chunks.join("").includes(needle));
}

/** Human price label for the postal dispatch fee, e.g. "5,00 EUR". */
export function postalPriceLabel(): string {
  const amount = (env.POSTAL_VERIFICATION_PRICE_CENTS / 100).toFixed(2).replace(".", ",");
  return `${amount} ${env.POSTAL_VERIFICATION_CURRENCY.toUpperCase()}`;
}

/**
 * The proof method's effective domain for a school: the AI-CONFIRMED official
 * domain first (live web-search grounding — genuine certainty), falling back to
 * an already-anchored domain from a prior DNS attempt, then the raw email-derived
 * guess. Only the confirmed domain unlocks `computeMethods()`'s "dns" — the
 * fallbacks here only serve to keep an in-progress/completed proof consistent.
 */
export function effectiveDomain(school: School): string | null {
  return school.verifiedOfficialDomain ?? school.domain ?? domainFromEmail(school.contactEmail);
}

/* ── Row helpers ──────────────────────────────────────────────────────────── */

/** Latest verification row that has not been cancelled (the "current" attempt). */
async function getCurrentRow(schoolId: string): Promise<SchoolVerification | null> {
  const [row] = await db
    .select()
    .from(schoolVerifications)
    .where(and(eq(schoolVerifications.schoolId, schoolId), ne(schoolVerifications.status, "cancelled")))
    .orderBy(desc(schoolVerifications.createdAt))
    .limit(1);
  return row ?? null;
}

const IN_PROGRESS = new Set(["pending", "awaiting_payment", "code_sent"]);

function toCurrentDTO(row: SchoolVerification, school: School): CurrentVerificationDTO {
  const domain = effectiveDomain(school);
  const meta = (row.metadata as Record<string, unknown> | null) ?? {};
  const dns =
    row.method === "dns" && row.dnsToken && domain
      ? { recordName: `_certifychain.${domain}`, recordType: "TXT" as const, recordValue: dnsRecordValue(row.dnsToken) }
      : null;
  const postal =
    row.method === "postal"
      ? {
          streetNo: row.postalStreetNo,
          postalCode: row.postalPostalCode,
          city: row.postalCity,
          paymentStatus: row.paymentStatus === "paid" ? ("paid" as const) : ("unpaid" as const),
          priceLabel: postalPriceLabel(),
          maxDeliveryDays: env.POSTAL_MAX_DELIVERY_DAYS,
          checkoutUrl:
            row.paymentStatus === "paid" ? null : typeof meta.checkoutUrl === "string" ? meta.checkoutUrl : null,
        }
      : null;
  return {
    method: row.method,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    dns,
    postal,
  };
}

/** Which proof methods are offerable to this school, and why not (verify.md). */
export function computeMethods(school: School): VerificationMethodInfo[] {
  const hasSiret = Boolean(school.siret);
  // The postal proof mails a letter to the establishment's REAL address — only
  // offer it once SIRENE (INSEE, the SIRET-keyed official registry) has actually
  // confirmed one for this school (set by computeSchoolValidation at
  // register/revalidate time), not merely "SIRET present + INSEE configured".
  const sireneAddressConfirmed = Boolean(school.sirenePostalCode || school.sireneCity);
  // The DNS proof requires publishing a TXT record on the school's REAL domain —
  // only offer it once a live web-search-grounded AI check is CERTAIN of that
  // domain (not merely "a domain is deducible from the contact email").
  const domainConfirmed = Boolean(school.verifiedOfficialDomain);
  return [
    {
      method: "dns",
      available: domainConfirmed,
      reason: domainConfirmed
        ? null
        : "Domaine officiel non trouvé.",
    },
    {
      method: "postal",
      available: env.stripeConfigured && env.inseeConfigured && hasSiret && sireneAddressConfirmed,
      reason: !hasSiret
        ? "SIRET requis pour retrouver l'adresse officielle."
        : !env.inseeConfigured
          ? "Annuaire officiel (SIRENE) non configuré."
          : !sireneAddressConfirmed
            ? "Adresse officielle non confirmée (SIRENE) — relancez une validation IA."
            : !env.stripeConfigured
              ? "Paiement en ligne non configuré."
              : null,
    },
    {
      method: "proconnect",
      available: env.proconnectConfigured,
      reason: env.proconnectConfigured ? null : "ProConnect non configuré.",
    },
  ];
}

/* ── Public read state ────────────────────────────────────────────────────── */

export async function getVerificationState(school: School): Promise<VerificationStateDTO> {
  const current = await getCurrentRow(school.id);
  return {
    schoolStatus: school.status,
    needsOwnershipProof: school.status === "provisional",
    methods: computeMethods(school),
    current: current ? toCurrentDTO(current, school) : null,
  };
}

/** Guards that a school is at the ownership-proof stage. */
function assertProvisional(school: School): void {
  if (school.status !== "provisional") {
    throw fail.verificationUnavailable(
      school.status === "approved"
        ? "Établissement déjà vérifié."
        : "La vérification de propriété n'est pas encore disponible pour cet établissement.",
    );
  }
}

/* ── Choose a method ──────────────────────────────────────────────────────── */

export async function chooseMethod(school: School, method: VerificationMethod): Promise<VerificationStateDTO> {
  assertProvisional(school);

  const current = await getCurrentRow(school.id);
  if (current && IN_PROGRESS.has(current.status)) {
    // Already in progress: same method → idempotent (no relaunch). Different
    // method → must explicitly switch first (so a stray click changes nothing).
    if (current.method === method) return getVerificationState(school);
    throw fail.verificationInProgress(
      "Une autre méthode est déjà en cours. Choisissez « Changer de méthode » pour en démarrer une nouvelle.",
    );
  }
  // Supersede any visible-but-finished (failed) row, then start fresh.
  if (current) {
    await db.update(schoolVerifications).set({ status: "cancelled" }).where(eq(schoolVerifications.id, current.id));
  }

  if (method === "dns") await startDns(school);
  else if (method === "postal") await startPostal(school);
  else await startProconnectRow(school);

  await recordAudit({ type: "verification_method_chosen", schoolId: school.id, metadata: { method } });
  return getVerificationState(school);
}

async function startDns(school: School): Promise<void> {
  // Server-side enforcement (not just the `computeMethods()` display hint): a
  // domain "deducible from the email" is NOT enough — only a live web-search-
  // grounded AI confirmation unlocks DNS as a proof method (verify.md).
  if (!school.verifiedOfficialDomain) {
    throw fail.verificationUnavailable(
      "Domaine officiel non trouvé.",
    );
  }
  const domain = school.verifiedOfficialDomain;
  await db.insert(schoolVerifications).values({
    schoolId: school.id,
    method: "dns",
    status: "pending",
    dnsToken: urlToken(24),
    expiresAt: new Date(Date.now() + OWNERSHIP_VERIFICATION.DNS_TOKEN_TTL_SECONDS * 1000),
  });
  // Anchor the domain so later proofs/UI are consistent.
  if (!school.domain) await db.update(schools).set({ domain }).where(eq(schools.id, school.id));
}

async function startPostal(school: School): Promise<void> {
  if (!env.stripeConfigured) throw fail.paymentUnavailable("Paiement en ligne non configuré.");
  if (!school.siret) throw fail.verificationUnavailable("SIRET requis pour la vérification postale.");

  const sirene = await lookupSiret(school.siret);
  const addr = sirene?.address ?? null;
  if (!addr || (!addr.postalCode && !addr.city)) {
    throw fail.verificationUnavailable("Adresse postale officielle introuvable pour cet établissement.");
  }

  const id = uuid();
  await db.insert(schoolVerifications).values({
    id,
    schoolId: school.id,
    method: "postal",
    status: "awaiting_payment",
    paymentStatus: "unpaid",
    // Full address envelope-encrypted at rest; only partial fields are displayable.
    postalAddressEnc: keyVault.encrypt(addr.oneLine),
    postalStreetNo: addr.streetNo,
    postalPostalCode: addr.postalCode,
    postalCity: addr.city,
  });

  const base = env.WEB_ORIGIN.replace(/\/$/, "");
  const session = await createCheckoutSession({
    verificationId: id,
    schoolName: school.name,
    successUrl: `${base}/ecole/verification?paid=1`,
    cancelUrl: `${base}/ecole/verification?canceled=1`,
  });
  await db
    .update(schoolVerifications)
    .set({ stripeSessionId: session.id, metadata: { checkoutUrl: session.url } })
    .where(eq(schoolVerifications.id, id));
}

async function startProconnectRow(school: School): Promise<void> {
  if (!env.proconnectConfigured) throw fail.verificationUnavailable("ProConnect non configuré.");
  await db.insert(schoolVerifications).values({
    schoolId: school.id,
    method: "proconnect",
    status: "pending",
    expiresAt: new Date(Date.now() + OWNERSHIP_VERIFICATION.OIDC_STATE_TTL_SECONDS * 1000),
  });
}

/* ── DNS proof ────────────────────────────────────────────────────────────── */

export async function verifyDns(school: School): Promise<VerificationStateDTO> {
  assertProvisional(school);
  const row = await getCurrentRow(school.id);
  if (!row || row.method !== "dns" || row.status !== "pending" || !row.dnsToken) {
    throw fail.verificationUnavailable("Aucune vérification DNS en cours.");
  }
  const domain = effectiveDomain(school);
  if (!domain) throw fail.verificationUnavailable("Domaine indéterminé.");

  let records: string[][] = [];
  try {
    records = await dnsp.resolveTxt(`_certifychain.${domain}`);
  } catch (e) {
    logger.info("verification.dns_lookup_failed", { error: String(e) });
  }

  if (!dnsTxtMatches(records, row.dnsToken)) {
    await db
      .update(schoolVerifications)
      .set({ attempts: row.attempts + 1 })
      .where(eq(schoolVerifications.id, row.id));
    await recordAudit({ type: "verification_failed", schoolId: school.id, metadata: { method: "dns" } });
    throw fail.verificationFailed(
      "Enregistrement DNS introuvable. La propagation peut prendre quelques minutes — réessayez.",
    );
  }

  await approveOwnership(school, row, { method: "dns", domain });
  return getVerificationState({ ...school, status: "approved" });
}

/* ── Postal proof ─────────────────────────────────────────────────────────── */

/** Returns the (already-created) Stripe Checkout URL for the current postal attempt. */
export async function getPostalCheckoutUrl(school: School): Promise<string> {
  assertProvisional(school);
  const row = await getCurrentRow(school.id);
  if (!row || row.method !== "postal") throw fail.verificationUnavailable("Aucune vérification postale en cours.");
  const meta = (row.metadata as Record<string, unknown> | null) ?? {};
  if (typeof meta.checkoutUrl === "string" && row.paymentStatus !== "paid") return meta.checkoutUrl;
  throw fail.verificationUnavailable("Lien de paiement indisponible.");
}

/**
 * Invoked from the verified Stripe webhook: marks the attempt paid, mints the
 * one-time postal code (hashed at rest) and dispatches the letter order.
 * Idempotent — a duplicate `checkout.session.completed` is a no-op.
 */
export async function handlePostalPaid(verificationId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(schoolVerifications)
    .where(eq(schoolVerifications.id, verificationId))
    .limit(1);
  if (!row || row.method !== "postal") return;
  if (row.paymentStatus === "paid") return; // already processed

  const code = numericCode(OWNERSHIP_VERIFICATION.POSTAL_CODE_LENGTH);
  await db
    .update(schoolVerifications)
    .set({
      paymentStatus: "paid",
      status: "code_sent",
      postalCodeHash: hashOtp(code),
      attempts: 0,
      expiresAt: new Date(Date.now() + OWNERSHIP_VERIFICATION.POSTAL_CODE_TTL_SECONDS * 1000),
    })
    .where(eq(schoolVerifications.id, row.id));

  const [school] = await db.select().from(schools).where(eq(schools.id, row.schoolId)).limit(1);
  const address = row.postalAddressEnc ? keyVault.decryptToString(row.postalAddressEnc) : "(adresse indisponible)";
  void sendPostalDispatchOrder(env.POSTAL_DISPATCH_EMAIL, {
    schoolName: school?.name ?? "École",
    address,
    code,
    submitUrl: `${env.WEB_ORIGIN.replace(/\/$/, "")}/ecole/verification`,
    maxDeliveryDays: env.POSTAL_MAX_DELIVERY_DAYS,
  }).catch((e) => logger.error("verification.postal_dispatch_failed", { error: String(e) }));
}

export async function submitPostalCode(school: School, code: string): Promise<VerificationStateDTO> {
  assertProvisional(school);
  const row = await getCurrentRow(school.id);
  if (!row || row.method !== "postal" || row.status !== "code_sent" || !row.postalCodeHash) {
    throw fail.verificationUnavailable("Aucun code postal en attente de saisie.");
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    await db.update(schoolVerifications).set({ status: "failed" }).where(eq(schoolVerifications.id, row.id));
    throw fail.verificationFailed("Code expiré. Vous pouvez commander un nouvel envoi.");
  }
  if (row.attempts >= OWNERSHIP_VERIFICATION.POSTAL_MAX_ATTEMPTS) {
    await db.update(schoolVerifications).set({ status: "failed" }).where(eq(schoolVerifications.id, row.id));
    throw fail.verificationFailed("Trop de tentatives. Commandez un nouvel envoi.");
  }

  if (!verifyOtp(code, row.postalCodeHash)) {
    const attempts = row.attempts + 1;
    const locked = attempts >= OWNERSHIP_VERIFICATION.POSTAL_MAX_ATTEMPTS;
    await db
      .update(schoolVerifications)
      .set({ attempts, status: locked ? "failed" : row.status })
      .where(eq(schoolVerifications.id, row.id));
    await recordAudit({ type: "verification_failed", schoolId: school.id, metadata: { method: "postal" } });
    throw fail.verificationFailed("Code incorrect.");
  }

  await approveOwnership(school, row, { method: "postal" });
  return getVerificationState({ ...school, status: "approved" });
}

/* ── ProConnect proof ─────────────────────────────────────────────────────── */

/** Builds the ProConnect /authorize URL for the current attempt (anti-CSRF state). */
export async function startProConnect(school: School): Promise<string> {
  assertProvisional(school);
  if (!env.proconnectConfigured) throw fail.verificationUnavailable("ProConnect non configuré.");
  let row = await getCurrentRow(school.id);
  if (!row || row.method !== "proconnect" || !IN_PROGRESS.has(row.status)) {
    // Auto-(re)create the proconnect attempt so /start is self-sufficient.
    if (row && IN_PROGRESS.has(row.status)) {
      throw fail.verificationInProgress("Une autre méthode est déjà en cours.");
    }
    await startProconnectRow(school);
    row = await getCurrentRow(school.id);
  }
  if (!row) throw fail.internal();

  const state = urlToken(24);
  const nonce = urlToken(24);
  await db
    .update(schoolVerifications)
    .set({
      metadata: { state, nonce },
      expiresAt: new Date(Date.now() + OWNERSHIP_VERIFICATION.OIDC_STATE_TTL_SECONDS * 1000),
    })
    .where(eq(schoolVerifications.id, row.id));

  try {
    return await buildAuthorizeUrl(state, nonce);
  } catch (e) {
    logger.error("verification.proconnect_authorize_failed", { error: String(e) });
    throw fail.serviceUnavailable("ProConnect momentanément indisponible.");
  }
}

/**
 * Handles the ProConnect callback (public, no cookie — anti-CSRF via `state`).
 * Returns the schoolId on success so the route can redirect the browser.
 * Throws on any mismatch (state unknown, expired, nonce/siret mismatch).
 */
export async function handleProConnectCallback(code: string, state: string): Promise<string> {
  const [row] = await db
    .select()
    .from(schoolVerifications)
    .where(sql`${schoolVerifications.metadata} ->> 'state' = ${state}`)
    .orderBy(desc(schoolVerifications.createdAt))
    .limit(1);
  if (!row || row.method !== "proconnect" || !IN_PROGRESS.has(row.status)) {
    throw fail.verificationFailed("État ProConnect inconnu ou expiré.");
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    await db.update(schoolVerifications).set({ status: "failed" }).where(eq(schoolVerifications.id, row.id));
    throw fail.verificationFailed("Session ProConnect expirée.");
  }

  const school = await getSchoolById(row.schoolId);
  if (!school) throw fail.notFound("Établissement introuvable");
  const meta = (row.metadata as Record<string, unknown> | null) ?? {};
  const nonce = typeof meta.nonce === "string" ? meta.nonce : "";

  let identity;
  try {
    identity = await exchangeAndVerify(code, nonce);
  } catch (e) {
    logger.error("verification.proconnect_exchange_failed", { error: String(e) });
    await db.update(schoolVerifications).set({ status: "failed" }).where(eq(schoolVerifications.id, row.id));
    await recordAudit({ type: "verification_failed", schoolId: school.id, metadata: { method: "proconnect" } });
    throw fail.verificationFailed("Authentification ProConnect invalide.");
  }

  if (normalizeSiret(identity.siret) !== normalizeSiret(school.siret)) {
    await db.update(schoolVerifications).set({ status: "failed" }).where(eq(schoolVerifications.id, row.id));
    await recordAudit({ type: "verification_failed", schoolId: school.id, metadata: { method: "proconnect", reason: "siret_mismatch" } });
    throw fail.verificationFailed("Le SIRET ProConnect ne correspond pas à l'établissement déclaré.");
  }

  await approveOwnership(school, row, { method: "proconnect", proconnectSub: identity.sub });
  return school.id;
}

/* ── Switch method ────────────────────────────────────────────────────────── */

/** Cancels the current attempt so the school can pick a different method. */
export async function switchMethod(school: School): Promise<VerificationStateDTO> {
  assertProvisional(school);
  const current = await getCurrentRow(school.id);
  if (current) {
    await db.update(schoolVerifications).set({ status: "cancelled" }).where(eq(schoolVerifications.id, current.id));
  }
  return getVerificationState(school);
}

/* ── Shared success path ──────────────────────────────────────────────────── */

async function approveOwnership(
  school: School,
  row: SchoolVerification,
  opts: { method: VerificationMethod; domain?: string; proconnectSub?: string },
): Promise<void> {
  await db
    .update(schoolVerifications)
    .set({ status: "verified", verifiedAt: new Date() })
    .where(eq(schoolVerifications.id, row.id));

  // Provisions the Ed25519 key pair + root certificate and flips to `approved`.
  await approveSchool(school.id);

  await db
    .update(schools)
    .set({
      controlProofMethod: opts.method,
      controlProofAt: new Date(),
      domain: opts.domain ?? school.domain,
      proconnectSub: opts.proconnectSub ?? school.proconnectSub,
    })
    .where(eq(schools.id, school.id));

  await recordAudit({ type: "ownership_verified", schoolId: school.id, metadata: { method: opts.method } });
}

/* ── Provisional invite (called from the registration flow) ───────────────── */

/** Sends the "validez la propriété" email to a freshly-provisional school. */
export async function sendProvisionalInvite(school: School): Promise<void> {
  const to = school.contactEmail;
  if (!to) return;
  await sendOwnershipVerificationInvite(to, {
    schoolName: school.name,
    verificationUrl: `${env.WEB_ORIGIN.replace(/\/$/, "")}/ecole/verification`,
  });
}

import type { ValidationSignal } from "../../contract/dto";
import type { School } from "../../db/schema";
import { evaluateSchoolLegitimacy, verifyOfficialDomain, verifySchoolAgainstSirene } from "../../lib/gemini";
import { lookupSiret } from "../../lib/insee";
import { getPlatformSettings } from "../admin/settings.service";
import { recordAudit } from "../audit/audit.service";
import { domainFromEmail } from "../verification/verification.service";
import { markSchoolProvisional, siretLuhnValid } from "./schools.service";

/** Declared fields a school validation runs against. */
export interface SchoolValidationFields {
  name: string;
  siret: string | null;
  uai: string | null;
  city: string | null;
  contactEmail: string | null;
  adminEmail?: string | null;
}

/** Everything the register/revalidate flows persist after a validation run. */
export interface SchoolValidationOutcome {
  score: number | null;
  reasoning: string;
  model: string | null;
  sireneVerified: boolean | null;
  sireneLegalName: string | null;
  /** SIRENE establishment address — non-sensitive fields only (postal code +
      city). Set only when SIRENE actually returned an address; gates the
      "postal" ownership-proof method (verify.md) on a CONFIRMED address. */
  sirenePostalCode: string | null;
  sireneCity: string | null;
  /** Official domain CONFIRMED by a live web-search-grounded AI check — gates
      the "dns" ownership-proof method (verify.md) on genuine certainty. */
  verifiedOfficialDomain: string | null;
  /** Concise per-check breakdown (green/amber/red chips) shown in the admin. */
  signals: ValidationSignal[];
}

const good = (label: string): ValidationSignal => ({ label, status: "good" });
const warn = (label: string): ValidationSignal => ({ label, status: "warn" });
const bad = (label: string): ValidationSignal => ({ label, status: "bad" });

/**
 * Runs school-legitimacy validation and returns both the score/reasoning AND a
 * concise, at-a-glance breakdown of what checks out and what doesn't.
 *
 * Order matches the platform doctrine: SIRENE (INSEE) is the source of truth;
 * Gemini is only called to cross-check once SIRENE confirms existence (so a
 * bogus/closed SIRET costs zero AI calls). Falls back to AI plausibility scoring
 * when there's no SIRET or INSEE is unavailable. Never throws — a failed lookup
 * simply yields fewer signals / a null score (caller decides how to surface it).
 */
export async function computeSchoolValidation(
  f: SchoolValidationFields,
): Promise<SchoolValidationOutcome> {
  const signals: ValidationSignal[] = [];
  let score: number | null = null;
  let reasoning = "";
  let model: string | null = null;
  let sireneVerified: boolean | null = null;
  let sireneLegalName: string | null = null;
  let sirenePostalCode: string | null = null;
  let sireneCity: string | null = null;
  let verifiedOfficialDomain: string | null = null;

  const luhn = siretLuhnValid(f.siret);
  const sirene = f.siret ? await lookupSiret(f.siret) : null;

  if (sirene === null) {
    // No SIRET or INSEE unavailable → AI plausibility fallback (no source of truth).
    const evaluation = await evaluateSchoolLegitimacy({
      name: f.name,
      siret: f.siret,
      uai: f.uai,
      city: f.city,
      contactEmail: f.contactEmail ?? "",
      adminEmail: f.adminEmail ?? null,
      siretLuhnValid: luhn,
    });
    if (evaluation) {
      score = evaluation.score;
      reasoning = evaluation.summary;
      model = evaluation.model;
      for (const flag of evaluation.flags.slice(0, 3)) signals.push(warn(flag));
    }
    if (!f.siret) signals.push(warn("SIRET non fourni"));
    else signals.push(luhn ? good("SIRET bien formé") : bad("SIRET invalide (clé Luhn)"));
    signals.push(warn("SIRENE non vérifié"));
    if (f.uai) signals.push(good("Code UAI fourni"));
  } else if (!sirene.found) {
    sireneVerified = false;
    score = 5;
    model = "sirene";
    reasoning = "SIRET introuvable au registre SIRENE (INSEE).";
    signals.push(bad("SIRET introuvable (SIRENE)"));
  } else if (!sirene.active) {
    sireneVerified = false;
    sireneLegalName = sirene.legalName;
    score = 10;
    model = "sirene";
    reasoning = `SIRENE : « ${sirene.legalName ?? "?"} » — établissement fermé/inactif.`;
    signals.push(bad("Établissement fermé (SIRENE)"));
  } else {
    // Existence confirmed by SIRENE → one short AI cross-check.
    sireneVerified = true;
    sireneLegalName = sirene.legalName;
    // Non-sensitive only (postal code + city) — same partial disclosure already
    // shown for the postal proof. Only set when SIRENE actually has an address.
    if (sirene.address?.postalCode || sirene.address?.city) {
      sirenePostalCode = sirene.address.postalCode;
      sireneCity = sirene.address.city;
    }
    const nafPart = sirene.nafCode ? `, NAF ${sirene.nafCode}` : "";
    const locPart = sirene.address?.city ? `, ${sirene.address.city}` : "";
    // Both are independent AI calls with no data dependency — run them
    // concurrently so the added latency is max(), not sum().
    const candidateDomain = domainFromEmail(f.contactEmail);
    const [cross, domainResult] = await Promise.all([
      verifySchoolAgainstSirene({
        declaredName: f.name,
        officialName: sirene.legalName,
        nafCode: sirene.nafCode,
        active: true,
        declaredCity: f.city,
        officialCity: sirene.address?.city ?? null,
        officialPostalCode: sirene.address?.postalCode ?? null,
      }),
      verifyOfficialDomain({ schoolName: f.name, city: f.city, candidateDomain }),
    ]);

    signals.push(good("SIRENE vérifié"));
    const isEducationNaf = (sirene.nafCode ?? "").startsWith("85");
    signals.push(
      isEducationNaf ? good("Activité enseignement") : warn("Activité hors enseignement"),
    );

    if (domainResult) {
      verifiedOfficialDomain = domainResult.domain;
      signals.push(good("Domaine officiel confirmé (recherche web)"));
    } else if (candidateDomain) {
      // A domain was deducible but the AI couldn't confirm it with certainty —
      // surfaced so an admin knows DNS stays locked and why.
      signals.push(warn("Domaine non confirmé (recherche web)"));
    }

    if (cross) {
      score = cross.score;
      model = `sirene+${cross.model}`;
      reasoning = `SIRENE : « ${sirene.legalName ?? "?"} » (actif${nafPart}${locPart}). ${cross.summary}`;
      signals.push(cross.nameMatch ? good("Nom concordant") : bad("Nom divergent"));
      // City is optional → only rate it when the applicant actually declared one.
      if (f.city && sirene.address?.city)
        signals.push(cross.cityMatch ? good("Ville concordante") : bad("Ville différente"));
    } else {
      score = 80;
      model = "sirene";
      reasoning = `SIRENE : « ${sirene.legalName ?? "?"} » (actif${nafPart}${locPart}). Vérification IA indisponible.`;
      signals.push(warn("Vérification IA indisponible"));
    }
    if (f.uai) signals.push(good("Code UAI fourni"));
  }

  return {
    score,
    reasoning,
    model,
    sireneVerified,
    sireneLegalName,
    sirenePostalCode,
    sireneCity,
    verifiedOfficialDomain,
    signals,
  };
}

/**
 * Applies the AI auto-validation gate after a fresh validation run. When the
 * platform setting is enabled and this outcome qualifies a still-`pending` school
 * (SIRENE-verified AND score ≥ the configured threshold), it flips the school to
 * `provisional` (existence confirmed; it still needs a control proof — DNS/postal/
 * ProConnect — before any PKI keys are issued) and records the audit. Returns the
 * updated school when it auto-validated, else null.
 *
 * Only ever acts on a `pending` school, so re-scoring never overrides an admin's
 * explicit approve/reject/revoke and never re-fires once provisional. Shared by
 * BOTH registration and the admin "re-evaluate" action so the rule cannot drift.
 */
export async function maybeAutoValidate(
  school: Pick<School, "id" | "status">,
  outcome: SchoolValidationOutcome,
): Promise<School | null> {
  if (school.status !== "pending") return null;

  const settings = await getPlatformSettings();
  const qualifies =
    settings.autoValidateEnabled &&
    outcome.sireneVerified === true &&
    outcome.score !== null &&
    outcome.score >= settings.autoValidateMinScore;
  if (!qualifies) return null;

  const provisional = await markSchoolProvisional(school.id, { autoValidated: true });
  await recordAudit({
    type: "school_auto_approved",
    schoolId: school.id,
    metadata: { score: outcome.score },
  });
  return provisional;
}

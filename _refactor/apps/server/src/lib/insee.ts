import { OUTBOUND_RATE_LIMIT } from "../config/constants";
import { env } from "../config/env";
import { logger } from "./logger";
import { createTokenBucket } from "./token-bucket";

/**
 * INSEE Sirene API client (authoritative French business/establishment registry).
 * This is the PRIMARY source of truth for school legitimacy: it deterministically
 * confirms whether a SIRET exists, is active, and to whom it belongs.
 *
 * Configurable (base URL + auth header) so it survives INSEE portal changes.
 * Returns `null` when the check could not be performed (no key / network / error)
 * so the caller degrades to the AI plausibility check or manual review.
 *
 * A module-scoped token bucket (`config/constants.ts#OUTBOUND_RATE_LIMIT.INSEE`)
 * caps our OUTBOUND call rate to SIRENE — protecting our own API quota with
 * INSEE, never the inbound request: an exhausted bucket degrades EXACTLY like
 * a missing `INSEE_API_KEY` (`lookupSiret` returns `null`, the caller falls
 * back to the AI plausibility check), never a thrown error.
 */
const inseeBucket = createTokenBucket(OUTBOUND_RATE_LIMIT.INSEE);

/** Structured postal address of an establishment (verify.md postal proof). */
export interface SireneAddress {
  /** Street number (+ repetition index, e.g. "12 B") — safe to display. */
  streetNo: string | null;
  /** Street type + name (e.g. "RUE DE LA PAIX") — NOT shown to the school. */
  street: string | null;
  postalCode: string | null;
  city: string | null;
  /** Single-line address for the mailer (envelope-encrypted at rest). */
  oneLine: string;
}

export interface SireneLookup {
  /** True if the SIRET exists in the registry (false on a 404). */
  found: boolean;
  /** True if the establishment is administratively active (état "A"). */
  active: boolean;
  /** Official legal name (denomination, or person name for sole traders). */
  legalName: string | null;
  /** Principal activity NAF/APE code (e.g. "85.42Z" = higher education). */
  nafCode: string | null;
  /** Establishment postal address, when present in the registry. */
  address: SireneAddress | null;
  siret: string;
}

function isValidSiret(siret: string): boolean {
  return /^\d{14}$/.test(siret);
}

/** Builds a structured address from a Sirene `adresseEtablissement` block. */
function extractAddress(adr: Record<string, unknown> | undefined): SireneAddress | null {
  if (!adr) return null;
  const s = (k: string): string | null => {
    const v = adr[k];
    return typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
  };
  const streetNo = [s("numeroVoieEtablissement"), s("indiceRepetitionEtablissement")]
    .filter(Boolean)
    .join(" ") || null;
  const street = [s("typeVoieEtablissement"), s("libelleVoieEtablissement")]
    .filter(Boolean)
    .join(" ") || null;
  const postalCode = s("codePostalEtablissement");
  const city = s("libelleCommuneEtablissement") ?? s("libelleCedexEtablissement");
  if (!postalCode && !city && !street) return null;
  const oneLine = [streetNo, street, [postalCode, city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return { streetNo, street, postalCode, city, oneLine };
}

/** Best-effort legal name from a Sirene `uniteLegale` block. */
function extractLegalName(ul: Record<string, unknown> | undefined): string | null {
  if (!ul) return null;
  const s = (k: string): string | null => (typeof ul[k] === "string" ? (ul[k] as string) : null);
  const denom = s("denominationUniteLegale") ?? s("denominationUsuelle1UniteLegale");
  if (denom) return denom;
  // Sole trader: surname + given name.
  const nom = s("nomUniteLegale");
  const prenom = s("prenomUsuelUniteLegale") ?? s("prenom1UniteLegale");
  if (nom) return [prenom, nom].filter(Boolean).join(" ");
  return null;
}

/**
 * Looks up a single establishment by SIRET.
 * - `null`  → check not performed (no key, bad format, network/error) → degrade.
 * - `{found:false}` → registry checked, SIRET unknown (a strong negative signal).
 */
export async function lookupSiret(siret: string): Promise<SireneLookup | null> {
  if (!env.INSEE_API_KEY || !isValidSiret(siret)) return null;
  if (!inseeBucket.tryConsume()) {
    // Never fail the caller's request over OUR outbound quota — degrade
    // exactly like "no key configured" (falls back to the AI plausibility
    // check / manual review).
    logger.warn("insee.outbound_rate_limited", { siret });
    return null;
  }

  const url = `${env.INSEE_API_BASE.replace(/\/$/, "")}/siret/${siret}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        [env.INSEE_API_KEY_HEADER]: env.INSEE_API_KEY,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (res.status === 404)
      return { found: false, active: false, legalName: null, nafCode: null, address: null, siret };
    if (!res.ok) {
      logger.error("insee.http_error", { status: res.status });
      return null;
    }

    const json = (await res.json()) as { etablissement?: Record<string, unknown> };
    const etab = json.etablissement;
    if (!etab)
      return { found: false, active: false, legalName: null, nafCode: null, address: null, siret };

    const ul = etab.uniteLegale as Record<string, unknown> | undefined;
    const periods = etab.periodesEtablissement as Array<Record<string, unknown>> | undefined;
    const current = periods?.[0]; // most recent period first
    const active = (current?.etatAdministratifEtablissement ?? null) === "A";
    const nafCode =
      (typeof ul?.activitePrincipaleUniteLegale === "string"
        ? (ul.activitePrincipaleUniteLegale as string)
        : null) ??
      (typeof current?.activitePrincipaleEtablissement === "string"
        ? (current.activitePrincipaleEtablissement as string)
        : null);
    const address = extractAddress(etab.adresseEtablissement as Record<string, unknown> | undefined);

    return { found: true, active, legalName: extractLegalName(ul), nafCode, address, siret };
  } catch (e) {
    logger.error("insee.failed", { error: String(e) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normalizes a French social-security identifier before validation/storage.
 * Only presentation separators are removed; every other character remains so
 * validation can reject it explicitly.
 */
export function normalizeNir(raw: string): string {
  return raw.replace(/[\s.-]/g, "").toUpperCase();
}

export type NirValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Validates a normalized 15-character NIR, including its two-digit key.
 *
 * Deliberately does not impose calendar/business rules on sex, month or
 * department digits: provisional and foreign-issued NIRs use legitimate
 * exceptional values. The only structural exception is Corsica (`2A`/`2B`),
 * whose letters are accepted solely in the department position so the
 * checksum stem remains unambiguous.
 *
 * Call {@link normalizeNir} first when accepting human-formatted input.
 */
export function validateNir(nir: string): NirValidationResult {
  if (nir.length !== 15) {
    return { ok: false, reason: "Le NIR doit contenir exactement 15 caractères" };
  }

  // 13-character stem + 2-digit key. Digits are intentionally permissive;
  // letters are legal only for the Corsican department codes 2A and 2B.
  if (!/^\d{5}(?:\d{2}|2[AB])\d{6}\d{2}$/.test(nir)) {
    return { ok: false, reason: "Le format du NIR est invalide" };
  }

  const stem = nir.slice(0, 13);
  const providedKey = Number(nir.slice(13));
  const numericStem = stem.replace("2A", "19").replace("2B", "18");

  // BigInt is mandatory here: the 13-digit value is not a 32-bit integer and
  // checksum arithmetic must remain exact on every supported JS runtime.
  // Constructor form (instead of a `97n` literal) keeps the server's exported
  // RPC type consumable by the Next.js clients, whose TS target is ES2017.
  const modulus = BigInt(97);
  const expectedKey = Number(modulus - (BigInt(numericStem) % modulus));
  if (providedKey !== expectedKey) {
    return { ok: false, reason: "La clé de contrôle du NIR est invalide" };
  }

  return { ok: true };
}

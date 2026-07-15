/**
 * Contrat d'erreur API — chaque helper `fail.*` doit garder son couple
 * status/code stable : les 3 clients routent leurs messages sur `code`
 * (unwrap → ApiClientError), une dérive casserait l'affichage des erreurs.
 */
import { AppError, fail } from "../../../apps/server/src/lib/http-error";

type FailName = keyof typeof fail;

/** Table (helper, status HTTP, code machine) — miroir exact de http-error.ts. */
const CONTRACT: [FailName, number, string][] = [
  ["unauthorized", 401, "unauthorized"],
  ["forbidden", 403, "forbidden"],
  ["notFound", 404, "not_found"],
  ["validation", 422, "validation_error"],
  ["conflict", 409, "conflict"],
  ["rateLimited", 429, "rate_limited"],
  ["csrf", 403, "csrf_failed"],
  ["invalidCredentials", 401, "invalid_credentials"],
  ["otpInvalid", 401, "otp_invalid"],
  ["otpExpired", 401, "otp_expired"],
  ["otpLocked", 429, "otp_locked"],
  ["schoolNotApproved", 403, "school_not_approved"],
  ["issuanceFrozen", 403, "issuance_frozen"],
  ["verificationUnavailable", 409, "verification_unavailable"],
  ["verificationInProgress", 409, "verification_in_progress"],
  ["verificationFailed", 422, "verification_failed"],
  ["paymentUnavailable", 503, "payment_unavailable"],
  ["mfaRequired", 401, "mfa_required"],
  ["mfaInvalid", 401, "mfa_invalid"],
  ["payloadTooLarge", 413, "payload_too_large"],
  ["serviceUnavailable", 503, "service_unavailable"],
  ["internal", 500, "internal_error"],
];

describe("fail.* — contrat status/code", () => {
  it("couvre tous les helpers exposés (pas de helper non testé)", () => {
    expect(CONTRACT.map(([name]) => name).sort()).toEqual(
      (Object.keys(fail) as FailName[]).sort(),
    );
  });

  it.each(CONTRACT)("%s → %i %s", (name, status, code) => {
    const err = fail[name]();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AppError");
    expect(err.status).toBe(status);
    expect(err.code).toBe(code);
    // Message par défaut : jamais vide (affiché tel quel côté client).
    expect(err.message.length).toBeGreaterThan(0);
  });

  it("conserve un message personnalisé", () => {
    expect(fail.conflict("Un compte existe déjà pour cet e-mail").message).toBe(
      "Un compte existe déjà pour cet e-mail",
    );
  });

  it("fail.validation transporte les details (fieldErrors zod)", () => {
    const details = { fieldErrors: { email: ["Adresse invalide"] } };
    const err = fail.validation("Données invalides", details);
    expect(err.details).toEqual(details);
  });

  it("les helpers sans details laissent details undefined", () => {
    expect(fail.unauthorized().details).toBeUndefined();
    expect(fail.internal().details).toBeUndefined();
  });
});

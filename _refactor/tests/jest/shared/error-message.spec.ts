/**
 * `apiErrorMessage` — conversion d'une erreur API en message court, sûr pour
 * l'utilisateur, utilisé par les 3 apps clientes dans chaque toast d'erreur.
 * Couvre audit R3 (retour générique et non technique sur exception inattendue)
 * et R6 (bandeau « réessayez dans Xs » sur 429).
 */
import { ApiClientError } from "../../../packages/shared/src/api/client";
import {
  GENERIC_API_ERROR_MESSAGE,
  apiErrorMessage,
} from "../../../packages/shared/src/api/error-message";

describe("apiErrorMessage", () => {
  it("surface le message d'une ApiClientError classique inchangé", () => {
    const err = new ApiClientError("Établissement non approuvé", {
      code: "school_not_approved",
      status: 403,
    });
    expect(apiErrorMessage(err)).toBe("Établissement non approuvé");
  });

  it("retombe sur le message générique (jamais brut) pour une exception inattendue", () => {
    expect(apiErrorMessage(new TypeError("Cannot read properties of undefined"))).toBe(
      GENERIC_API_ERROR_MESSAGE,
    );
    expect(apiErrorMessage("une chaîne quelconque")).toBe(GENERIC_API_ERROR_MESSAGE);
    expect(apiErrorMessage(undefined)).toBe(GENERIC_API_ERROR_MESSAGE);
  });

  it("accepte un message de repli personnalisé pour le cas non-ApiClientError", () => {
    expect(apiErrorMessage(new Error("boom"), "Impossible de charger ce lien.")).toBe(
      "Impossible de charger ce lien.",
    );
  });

  it("jamais de fuite de la stack ou du message brut d'une exception inconnue", () => {
    const leaky = new Error("ECONNREFUSED 127.0.0.1:5432 at Socket._destroy (node:net:...)");
    const message = apiErrorMessage(leaky);
    expect(message).toBe(GENERIC_API_ERROR_MESSAGE);
    expect(message).not.toContain("ECONNREFUSED");
    expect(message).not.toContain("node:net");
  });

  describe("rate-limit (429) avec délai connu — R6", () => {
    it("remplace le texte générique par un délai concret en secondes", () => {
      const err = new ApiClientError("Trop de requêtes, réessayez plus tard", {
        code: "rate_limited",
        status: 429,
        retryAfterSeconds: 42,
      });
      expect(apiErrorMessage(err)).toBe("Trop de requêtes. Réessayez dans 42 s.");
    });

    it("affiche le délai en minutes au-delà de 60 s", () => {
      const err = new ApiClientError("Trop de requêtes, réessayez plus tard", {
        code: "rate_limited",
        status: 429,
        retryAfterSeconds: 600,
      });
      expect(apiErrorMessage(err)).toBe("Trop de requêtes. Réessayez dans 10 min.");
    });

    it("affiche le délai en heures au-delà de 60 min", () => {
      const err = new ApiClientError("Trop de requêtes, réessayez plus tard", {
        code: "rate_limited",
        status: 429,
        retryAfterSeconds: 3600,
      });
      expect(apiErrorMessage(err)).toBe("Trop de requêtes. Réessayez dans 1 h.");
    });

    it("sans délai connu (ex. verrouillage de compte), le message serveur porte déjà l'info : inchangé", () => {
      const err = new ApiClientError("Compte temporairement verrouillé. Réessayez dans 5 min.", {
        code: "rate_limited",
        status: 429,
        // Pas de `retryAfterSeconds` — aucun en-tête exploitable côté serveur
        // pour ce 429 précis (voir `unwrap.spec.ts`) : ne jamais inventer un délai.
      });
      expect(apiErrorMessage(err)).toBe("Compte temporairement verrouillé. Réessayez dans 5 min.");
    });
  });
});

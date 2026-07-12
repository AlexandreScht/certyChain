/** `unwrap` — toute erreur affichée par les 3 apps passe par ce mapping. */
import {
  ApiClientError,
  unwrap,
  type JsonResponseLike,
} from "../../../packages/shared/src/api/client";

function res(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}): JsonResponseLike {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "",
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

describe("unwrap", () => {
  it("retourne le corps JSON d'un 2xx", async () => {
    await expect(unwrap(res({ ok: true, id: 7 }))).resolves.toEqual({ ok: true, id: 7 });
  });

  it("retourne undefined sur un 204 sans corps", async () => {
    await expect(unwrap(res("", { status: 204 }))).resolves.toBeUndefined();
  });

  it("mappe une erreur du contrat en ApiClientError (code + status + message)", async () => {
    const p = unwrap(
      res(
        { error: { code: "school_not_approved", message: "Établissement non approuvé" } },
        { ok: false, status: 403 },
      ),
    );
    await expect(p).rejects.toMatchObject({
      name: "ApiClientError",
      code: "school_not_approved",
      status: 403,
      message: "Établissement non approuvé",
    });
  });

  it("préfère le premier message de champ Zod au message générique", async () => {
    const p = unwrap(
      res(
        {
          error: {
            code: "validation_error",
            message: "Données invalides",
            details: { fieldErrors: { siret: ["SIRET = 14 chiffres"] }, formErrors: [] },
          },
        },
        { ok: false, status: 422 },
      ),
    );
    await expect(p).rejects.toMatchObject({ message: "SIRET = 14 chiffres" });
  });

  it("retombe sur formErrors quand fieldErrors est vide", async () => {
    const p = unwrap(
      res(
        {
          error: {
            code: "validation_error",
            message: "Données invalides",
            details: { fieldErrors: {}, formErrors: ["Formulaire incomplet"] },
          },
        },
        { ok: false, status: 422 },
      ),
    );
    await expect(p).rejects.toMatchObject({ message: "Formulaire incomplet" });
  });

  it("extrait le message d'un corps zod-validator brut (défense en profondeur)", async () => {
    const p = unwrap(
      res(
        { success: false, error: { issues: [{ message: "Code à 6 chiffres" }] } },
        { ok: false, status: 400 },
      ),
    );
    await expect(p).rejects.toMatchObject({ message: "Code à 6 chiffres" });
  });

  it("retombe sur statusText pour un corps non-JSON", async () => {
    const p = unwrap(res("<html>Bad gateway</html>", { ok: false, status: 502, statusText: "Bad Gateway" }));
    await expect(p).rejects.toMatchObject({ status: 502, message: "Bad Gateway" });
  });

  it("l'erreur est bien une instance d'ApiClientError", async () => {
    await expect(unwrap(res("", { ok: false, status: 500 }))).rejects.toBeInstanceOf(ApiClientError);
  });
});

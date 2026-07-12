/** `toQueryRecord` — sérialisation des filtres/pagination pour le client RPC. */
import { toQueryRecord } from "../../../packages/shared/src/lib/query";

describe("toQueryRecord", () => {
  it("stringifie nombres et booléens", () => {
    expect(toQueryRecord({ page: 2, active: true })).toEqual({ page: "2", active: "true" });
  });

  it("supprime undefined et null (jamais la string littérale 'undefined')", () => {
    expect(toQueryRecord({ q: undefined, year: null, status: "active" })).toEqual({
      status: "active",
    });
  });

  it("conserve les chaînes vides (filtre explicite)", () => {
    expect(toQueryRecord({ q: "" })).toEqual({ q: "" });
  });

  it("objet vide → enregistrement vide", () => {
    expect(toQueryRecord({})).toEqual({});
  });
});

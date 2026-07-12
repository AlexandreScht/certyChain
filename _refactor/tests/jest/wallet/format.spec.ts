/** Wallet élève — formatage des dates et méta de statut. */
import {
  diplomaStatusMeta,
  formatDate,
  formatYear,
} from "../../../apps/client/wallet/src/components/wallet/format";

describe("formatDate", () => {
  it("formate une date ISO en français long", () => {
    expect(formatDate("2026-07-01")).toMatch(/1(er)?\s|01 /); // jour
    expect(formatDate("2026-07-01")).toContain("juillet");
    expect(formatDate("2026-07-01")).toContain("2026");
  });

  it("retourne un tiret sur null / invalide", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("pas-une-date")).toBe("—");
  });
});

describe("formatYear", () => {
  it("extrait l'année de promotion", () => {
    expect(formatYear("2025-06-30")).toBe("2025");
  });

  it("retourne un tiret sur une date invalide", () => {
    expect(formatYear("n/a")).toBe("—");
  });
});

describe("diplomaStatusMeta", () => {
  it("active → Valide (success, pulsé côté carte)", () => {
    expect(diplomaStatusMeta("active")).toEqual({ label: "Valide", tone: "success" });
  });

  it("revoked → Révoqué (danger)", () => {
    expect(diplomaStatusMeta("revoked")).toEqual({ label: "Révoqué", tone: "danger" });
  });
});

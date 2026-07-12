/**
 * Helpers purs du module de preuve de propriété (verify.md) — assertions
 * volontairement indépendantes des clés externes configurées (Stripe/INSEE/
 * ProConnect varient selon l'environnement).
 */
import type { School } from "../../../apps/server/src/db/schema";
import {
  computeMethods,
  dnsRecordValue,
  dnsTxtMatches,
  domainFromEmail,
  effectiveDomain,
  postalPriceLabel,
} from "../../../apps/server/src/modules/verification/verification.service";

/** School minimal pour les helpers (seuls les champs lus importent). */
function fakeSchool(overrides: Partial<School> = {}): School {
  return {
    id: "11112222-3333-4444-5555-666677778888",
    name: "École Test",
    siret: "73282932000074",
    contactEmail: "contact@ecole-test.fr",
    status: "provisional",
    verifiedOfficialDomain: null,
    domain: null,
    sirenePostalCode: null,
    sireneCity: null,
    ...overrides,
  } as School;
}

describe("domainFromEmail", () => {
  it("extrait et minusculise le domaine", () => {
    expect(domainFromEmail("Contact@Ecole-Test.FR")).toBe("ecole-test.fr");
  });

  it("rejette null / sans @ / hôte sans point", () => {
    expect(domainFromEmail(null)).toBeNull();
    expect(domainFromEmail("pas-un-email")).toBeNull();
    expect(domainFromEmail("a@localhost")).toBeNull();
  });
});

describe("dnsRecordValue / dnsTxtMatches", () => {
  it("formate la valeur TXT attendue", () => {
    expect(dnsRecordValue("tok123")).toBe("certifychain-verify=tok123");
  });

  it("retrouve le token, y compris sur des TXT en morceaux", () => {
    expect(dnsTxtMatches([["certifychain-verify=tok123"]], "tok123")).toBe(true);
    expect(dnsTxtMatches([["certifychain-", "verify=tok123"]], "tok123")).toBe(true);
    expect(dnsTxtMatches([["v=spf1 -all"], ["certifychain-verify=tok123"]], "tok123")).toBe(true);
  });

  it("ne matche pas un autre token / une zone vide", () => {
    expect(dnsTxtMatches([["certifychain-verify=autre"]], "tok123")).toBe(false);
    expect(dnsTxtMatches([], "tok123")).toBe(false);
  });
});

describe("effectiveDomain", () => {
  it("priorise le domaine confirmé par IA, puis l'ancré, puis l'e-mail", () => {
    expect(
      effectiveDomain(fakeSchool({ verifiedOfficialDomain: "officiel.fr", domain: "ancre.fr" })),
    ).toBe("officiel.fr");
    expect(effectiveDomain(fakeSchool({ domain: "ancre.fr" }))).toBe("ancre.fr");
    expect(effectiveDomain(fakeSchool())).toBe("ecole-test.fr");
  });
});

describe("postalPriceLabel", () => {
  it("rend un prix lisible (virgule décimale + devise en capitales)", () => {
    expect(postalPriceLabel()).toMatch(/^\d+,\d{2} [A-Z]{3}$/);
  });
});

describe("computeMethods (gating des preuves)", () => {
  it("expose exactement les 3 méthodes", () => {
    const methods = computeMethods(fakeSchool());
    expect(methods.map((m) => m.method)).toEqual(["dns", "postal", "proconnect"]);
  });

  it("DNS verrouillé tant qu'aucun domaine officiel n'est CONFIRMÉ", () => {
    const locked = computeMethods(fakeSchool())[0]!;
    expect(locked.available).toBe(false);
    expect(locked.reason).toMatch(/domaine/i);
  });

  it("DNS déverrouillé par un domaine officiel confirmé (recherche web)", () => {
    const open = computeMethods(fakeSchool({ verifiedOfficialDomain: "ecole-test.fr" }))[0]!;
    expect(open.available).toBe(true);
    expect(open.reason).toBeNull();
  });

  it("postal indisponible sans SIRET, avec la raison dédiée", () => {
    const postal = computeMethods(fakeSchool({ siret: null }))[1]!;
    expect(postal.available).toBe(false);
    expect(postal.reason).toMatch(/SIRET/);
  });

  it("chaque méthode indisponible porte une raison lisible", () => {
    for (const m of computeMethods(fakeSchool({ siret: null }))) {
      if (!m.available) expect(typeof m.reason).toBe("string");
    }
  });
});

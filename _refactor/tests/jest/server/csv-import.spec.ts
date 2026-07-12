/**
 * Import CSV — régression audit S3 : l'en-tête doit correspondre à l'ordre
 * documenté (mapping positionnel), sinon rejet explicite au lieu d'un import
 * silencieusement faux dans des diplômes signés.
 */
import { parseCsv } from "../../../apps/server/src/modules/diplomas/diplomas.routes";

const HEADER = "holderName,holderEmail,programTitle,mention,issuedAt,externalId,rncp";

describe("parseCsv — validation d'en-tête (régression S3)", () => {
  it("accepte l'en-tête documenté complet", () => {
    const rows = parseCsv(`${HEADER}\nAlex Dubois,alex@x.fr,Master Data,TB,2026-07-01,REF-1,RNCP35900\n`);
    expect(rows).toEqual([
      {
        holderName: "Alex Dubois",
        holderEmail: "alex@x.fr",
        programTitle: "Master Data",
        mention: "TB",
        issuedAt: "2026-07-01",
        externalId: "REF-1",
        rncp: "RNCP35900",
      },
    ]);
  });

  it("accepte le format legacy 6 colonnes (préfixe exact sans rncp)", () => {
    const rows = parseCsv(
      "holderName,holderEmail,programTitle,mention,issuedAt,externalId\nA B,a@x.fr,BTS,,2026-01-01,\n",
    );
    expect(rows[0]).toEqual({
      holderName: "A B",
      holderEmail: "a@x.fr",
      programTitle: "BTS",
      issuedAt: "2026-01-01",
    });
  });

  it("est insensible à la casse et aux espaces autour des en-têtes", () => {
    const rows = parseCsv(
      "HolderName , HOLDEREMAIL ,programtitle,mention,issuedat,externalid,rncp\nA B,a@x.fr,BTS,,2026-01-01,,\n",
    );
    expect(rows).toHaveLength(1);
  });

  it("REJETTE des colonnes réordonnées (mention ↔ externalId, deux textes libres)", () => {
    expect(() =>
      parseCsv("holderName,holderEmail,programTitle,externalId,issuedAt,mention,rncp\nA,a@x.fr,B,R,2026-01-01,TB,\n"),
    ).toThrow(/En-têtes CSV invalides/);
  });

  it("REJETTE un en-tête tronqué sous les 5 colonnes requises", () => {
    expect(() => parseCsv("holderName,holderEmail\nA,a@x.fr\n")).toThrow(/En-têtes CSV invalides/);
  });

  it("REJETTE des colonnes inconnues en plus", () => {
    expect(() => parseCsv(`${HEADER},extra\nA,a@x.fr,B,,2026-01-01,,,x\n`)).toThrow(
      /En-têtes CSV invalides/,
    );
  });
});

describe("parseCsv — tokenisation RFC-4180 (sous-ensemble)", () => {
  it("gère les champs quotés avec virgules et quotes échappées", () => {
    const rows = parseCsv(
      `${HEADER}\n"Dubois, Alex",a@x.fr,"Master ""IA""",TB,2026-07-01,,\n`,
    );
    expect(rows[0]?.holderName).toBe("Dubois, Alex");
    expect(rows[0]?.programTitle).toBe('Master "IA"');
  });

  it("gère CRLF et l'absence de saut de ligne final", () => {
    const rows = parseCsv(`${HEADER}\r\nA B,a@x.fr,BTS,,2026-01-01,,`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.holderName).toBe("A B");
  });

  it("ignore les lignes vides et retourne [] sans données", () => {
    expect(parseCsv(`${HEADER}\n\n\n`)).toEqual([]);
    expect(parseCsv("")).toEqual([]);
  });

  it("les champs vides sont omis (optionnels non envoyés)", () => {
    const rows = parseCsv(`${HEADER}\nA B,a@x.fr,BTS,,2026-01-01,,\n`);
    expect(rows[0]).not.toHaveProperty("mention");
    expect(rows[0]).not.toHaveProperty("rncp");
  });
});

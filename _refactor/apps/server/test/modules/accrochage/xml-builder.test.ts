import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildCdcCreationXml,
  CdcBatchSchema,
  formatCdcTimestamp,
  serializeXmlDocument,
  type CdcBatch,
} from "../../../src/modules/accrochage/xml-builder";

function syntheticNir(stem: string): string {
  const numericStem = stem.replace("2A", "19").replace("2B", "18");
  const key = Number(97n - (BigInt(numericStem) % 97n));
  return stem + String(key).padStart(2, "0");
}

const BASE_ITEM: CdcBatch["items"][number] = {
  itemId: "22222222-2222-4222-8222-222222222222",
  diplomaId: "33333333-3333-4333-8333-333333333333",
  rncp: "RNCP11556",
  issuedAt: "2026-06-30",
  nir: syntheticNir("180012A123456"),
  birthLastName: "DUPONT",
  obtentionMethod: "PAR_ADMISSION",
};

function batch(overrides: Partial<CdcBatch> = {}): CdcBatch {
  return {
    exportId: "11111111-1111-4111-8111-111111111111",
    generatedAt: new Date("2026-07-12T13:14:15.999Z"),
    emitterIdClient: "04VHF013",
    certificateurIdClient: "04VHF013",
    contractId: "MCFCER091220241",
    items: [BASE_ITEM],
    ...overrides,
  };
}

const GOLDEN_URL = new URL("./fixtures/creation.expected.xml", import.meta.url);

describe("CDC XML builder — XSD 1.1.5 product subset", () => {
  it("matches the pinned golden CREATION document byte for byte", () => {
    const expected = readFileSync(GOLDEN_URL, "utf8");
    assert.equal(buildCdcCreationXml(batch()), expected);
  });

  it("keeps the golden fixture in LF on disk (checkout hygiene, not a tolerance)", () => {
    // The comparison above is byte-exact ON PURPOSE (XSD 1.1.5 determinism), so
    // it must never be relaxed to absorb a CRLF checkout. This assertion just
    // turns the resulting failure into its actual diagnosis: a Windows checkout
    // with `core.autocrlf=true` rewrote the fixture. The cure is `.gitattributes`
    // (`* text=auto eol=lf` + `apps/server/test/**/fixtures/**`), never a
    // normalization in the builder or in the assertion.
    assert.ok(
      !readFileSync(GOLDEN_URL, "utf8").includes("\r"),
      "creation.expected.xml must be stored with LF endings — see .gitattributes",
    );
  });

  it("formats the frozen generation time with an explicit +00:00 offset", () => {
    assert.equal(formatCdcTimestamp(new Date("2026-07-12T13:14:15.999Z")), "2026-07-12T13:14:15+00:00");
  });

  it("groups RNCP codes and passages in stable ascending order without mutating input", () => {
    const items: CdcBatch["items"] = [
      {
        ...BASE_ITEM,
        itemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        diplomaId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        rncp: "RNCP20000",
      },
      {
        ...BASE_ITEM,
        itemId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        diplomaId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        rncp: "RNCP10000",
      },
      {
        ...BASE_ITEM,
        itemId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        diplomaId: "11111111-2222-4333-8444-555555555555",
        rncp: "RNCP20000",
      },
    ];
    const originalOrder = items.map((item) => item.itemId);
    const input = batch({ items });
    const first = buildCdcCreationXml(input);
    const second = buildCdcCreationXml(input);

    assert.equal(first, second);
    assert.deepEqual(items.map((item) => item.itemId), originalOrder);
    assert.ok(first.indexOf("RNCP10000") < first.indexOf("RNCP20000"));
    assert.ok(
      first.indexOf("cccccccc-cccc-4ccc-8ccc-cccccccccccc") <
        first.indexOf("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    );
  });

  it("emits only the 13-character NIR stem, never its checksum", () => {
    const fullNir = BASE_ITEM.nir;
    const xml = buildCdcCreationXml(batch());
    assert.match(xml, new RegExp(`<cpf:nir>${fullNir.slice(0, 13)}</cpf:nir>`));
    assert.ok(!xml.includes(fullNir));
  });

  it("escapes hostile holder and contract text through the central serializer", () => {
    const hostileName = `DU&<PONT>"'`;
    const xml = buildCdcCreationXml(
      batch({
        contractId: `A<&>"'`,
        items: [{ ...BASE_ITEM, birthLastName: hostileName }],
      }),
    );
    assert.ok(!xml.includes(hostileName));
    assert.ok(!xml.includes("<PONT>"));
    assert.match(xml, /DU&amp;&lt;PONT&gt;&quot;&apos;/);
    assert.match(xml, /A&lt;&amp;&gt;&quot;&apos;/);
  });

  it("rejects values outside the emitted XSD/product subset before serialization", () => {
    assert.equal(CdcBatchSchema.safeParse(batch({ emitterIdClient: "SHORT" })).success, false);
    assert.equal(
      CdcBatchSchema.safeParse(batch({ items: [{ ...BASE_ITEM, issuedAt: "2026-02-30" }] }))
        .success,
      false,
    );
    assert.equal(
      CdcBatchSchema.safeParse(
        batch({ items: [{ ...BASE_ITEM, nir: syntheticNir("7809912123456") }] }),
      ).success,
      false,
      "the CDC identifiantNational XSD accepts only sex digits 1/2",
    );
    assert.equal(
      CdcBatchSchema.safeParse(batch({ items: [BASE_ITEM, { ...BASE_ITEM }] })).success,
      false,
      "duplicate item and diploma ids must be rejected",
    );
    assert.equal(
      CdcBatchSchema.safeParse(
        batch({ items: [{ ...BASE_ITEM, birthLastName: "DUPONT\u0000" }] }),
      ).success,
      false,
      "invalid XML 1.0 control characters must be rejected",
    );
  });
});

describe("strict generic XML AST serializer", () => {
  it("sorts and escapes attributes deterministically", () => {
    assert.equal(
      serializeXmlDocument({
        name: "root",
        attributes: { z: `&"`, a: "<" },
        children: [{ name: "value", text: `<&>"'` }],
      }),
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<root a="&lt;" z="&amp;&quot;">\n' +
        '  <value>&lt;&amp;&gt;&quot;&apos;</value>\n' +
        "</root>\n",
    );
  });

  it("rejects injected names and mixed content", () => {
    assert.throws(
      () => serializeXmlDocument({ name: "root><evil", text: "x" }),
      /Invalid XML name/,
    );
    assert.throws(
      () => serializeXmlDocument({ name: "root", text: "x", children: [] }),
      /Mixed XML content/,
    );
    assert.throws(
      () => serializeXmlDocument({ name: "root", text: "bad\u0000value" }),
      /Invalid XML 1\.0 character/,
    );
    assert.throws(
      () => serializeXmlDocument({ name: "root", text: "lone\ud800surrogate" }),
      /Invalid XML 1\.0 character/,
    );
  });
});

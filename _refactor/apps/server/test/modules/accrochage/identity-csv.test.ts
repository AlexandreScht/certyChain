import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CDC_IDENTITY_CSV_HEADERS,
  parseCdcIdentityCsv,
} from "../../../src/modules/accrochage/identity-csv";

describe("CDC identity CSV", () => {
  it("parses the exact documented header and quoted fields", () => {
    const source = [
      CDC_IDENTITY_CSV_HEADERS.join(","),
      '550e8400-e29b-41d4-a716-446655440000,,"1 84 12 2A 123 456 10","DUPONT, MARTIN",PAR_ADMISSION',
    ].join("\r\n");
    assert.deepEqual(parseCdcIdentityCsv(source), [
      {
        diplomaId: "550e8400-e29b-41d4-a716-446655440000",
        nir: "1 84 12 2A 123 456 10",
        birthLastName: "DUPONT, MARTIN",
        obtentionMethod: "PAR_ADMISSION",
      },
    ]);
  });

  it("accepts a UTF-8 BOM and an external id", () => {
    const source = `\uFEFF${CDC_IDENTITY_CSV_HEADERS.join(",")}\n,EXT-42,synthetic,DUPONT,PAR_SCORING`;
    assert.equal(parseCdcIdentityCsv(source)[0]?.externalId, "EXT-42");
  });

  it("rejects reordered, missing and extra headers", () => {
    assert.throws(() => parseCdcIdentityCsv("external_id,diploma_id,nir,nom_naissance,obtention_certification\n"));
    assert.throws(() => parseCdcIdentityCsv("diploma_id,external_id,nir,nom_naissance\n"));
    assert.throws(() =>
      parseCdcIdentityCsv(`${CDC_IDENTITY_CSV_HEADERS.join(",")},unexpected\n`),
    );
  });

  it("rejects malformed quotes and extra data columns", () => {
    assert.throws(() =>
      parseCdcIdentityCsv(`${CDC_IDENTITY_CSV_HEADERS.join(",")}\n,,"unterminated`),
    );
    assert.throws(() =>
      parseCdcIdentityCsv(
        `${CDC_IDENTITY_CSV_HEADERS.join(",")}\n,,value,name,PAR_ADMISSION,extra`,
      ),
    );
  });
});


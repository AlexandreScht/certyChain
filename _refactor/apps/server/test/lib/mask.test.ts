import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSensitiveLogKey,
  maskEmail,
  redactCdcRejectReason,
} from "../../src/lib/mask";

describe("maskEmail (PII redaction shown on the claim page & in logs)", () => {
  it("keeps only the first 2 local characters and the domain", () => {
    assert.equal(maskEmail("alex.dubois@example.com"), "al•••••••••@example.com");
  });

  it("never reveals fewer than 2 mask characters, even for short locals", () => {
    assert.equal(maskEmail("a@ecole.fr"), "a••@ecole.fr");
    assert.equal(maskEmail("ab@ecole.fr"), "ab••@ecole.fr");
  });

  it("degrades to an opaque placeholder when the input is not an email", () => {
    assert.equal(maskEmail("not-an-email"), "••••");
    assert.equal(maskEmail(""), "••••");
    assert.equal(maskEmail("@nodomain"), "••••");
  });

  it("does not leak the local part beyond its first 2 characters", () => {
    const masked = maskEmail("prenom.nom.tres.long@ecole-demo.fr");
    assert.ok(!masked.includes("prenom.nom"), masked);
    assert.ok(masked.startsWith("pr"), masked);
    assert.ok(masked.endsWith("@ecole-demo.fr"), masked);
  });
});

describe("structured PII masking", () => {
  it("recognizes CDC identity keys across naming conventions", () => {
    for (const key of [
      "nir",
      "nir_encrypted",
      "birthLastName",
      "birth_last_name",
      "firstNames",
      "first_names",
      "birthDate",
      "birth_date",
    ]) {
      assert.equal(isSensitiveLogKey(key), true, key);
    }
    assert.equal(isSensitiveLogKey("rejectCode"), false);
  });

  it("redacts a fabricated complete 15-character NIR from a rejection reason", () => {
    // Deliberately fabricated and checksum-invalid: never use a real identifier
    // in source fixtures.
    const fabricated = "1 00 00 00 000 000 00";
    const masked = redactCdcRejectReason(`NIR ${fabricated} incohérent`);
    assert.equal(masked, "NIR [identifiant CDC masqué] incohérent");
    assert.ok(!masked.includes(fabricated));
  });

  it("redacts the fabricated 13-character NIR stem emitted in CDC XML", () => {
    const fabricatedStem = "1-00-00-00-000-000";
    const masked = redactCdcRejectReason(`Titulaire ${fabricatedStem} non reconnu`);
    assert.equal(masked, "Titulaire [identifiant CDC masqué] non reconnu");
    assert.ok(!masked.includes(fabricatedStem));
  });

  it("keeps non-sensitive CDC diagnostics intact", () => {
    assert.equal(
      redactCdcRejectReason("CDC.42: code RNCP inconnu"),
      "CDC.42: code RNCP inconnu",
    );
  });
});

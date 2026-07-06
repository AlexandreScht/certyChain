import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maskEmail } from "../../src/lib/mask";

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

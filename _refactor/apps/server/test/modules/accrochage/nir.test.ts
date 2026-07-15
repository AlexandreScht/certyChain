import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeNir, validateNir } from "../../../src/modules/accrochage/nir";

/** Creates synthetic test data; no fixture is copied from a real person. */
function syntheticNir(stem: string): string {
  const numericStem = stem.replace("2A", "19").replace("2B", "18");
  const key = Number(97n - (BigInt(numericStem) % 97n));
  return stem + String(key).padStart(2, "0");
}

describe("CDC NIR normalization", () => {
  it("removes presentation separators and uppercases Corsican departments", () => {
    assert.equal(normalizeNir("1 80.01-2a-123 456-20"), "180012A12345620");
  });

  it("does not silently remove unsupported characters", () => {
    assert.equal(normalizeNir("18001/2A12345620"), "18001/2A12345620");
  });
});

describe("CDC NIR checksum validation", () => {
  it("accepts synthetic numeric, 2A and 2B stems", () => {
    for (const stem of ["1800175123456", "180012A123456", "299992B123456"]) {
      assert.deepEqual(validateNir(syntheticNir(stem)), { ok: true });
    }
  });

  it("remains permissive for provisional sex and exceptional month values", () => {
    assert.deepEqual(validateNir(syntheticNir("7809912123456")), { ok: true });
  });

  it("rejects length, alphabet and misplaced Corsican letters", () => {
    assert.equal(validateNir("123").ok, false);
    assert.equal(validateNir("180012C12345600").ok, false);
    assert.equal(validateNir("1A0017512345600").ok, false);
    assert.equal(validateNir("180012a12345620").ok, false, "normalizeNir must run first");
  });

  it("rejects an incorrect two-digit key", () => {
    const valid = syntheticNir("1800175123456");
    const wrongKey = valid.endsWith("00") ? "01" : "00";
    const result = validateNir(valid.slice(0, 13) + wrongKey);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /clé de contrôle/i);
  });

  it("rejects a mutation at each of the 13 stem positions", () => {
    const valid = syntheticNir("1800175123456");
    for (let index = 0; index < 13; index += 1) {
      const digit = valid[index];
      assert.ok(digit !== undefined);
      const mutatedDigit = String((Number(digit) + 1) % 10);
      const mutated = valid.slice(0, index) + mutatedDigit + valid.slice(index + 1);
      assert.equal(validateNir(mutated).ok, false, `mutation at stem position ${index}`);
    }
  });
});

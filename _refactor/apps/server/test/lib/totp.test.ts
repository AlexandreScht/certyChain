import assert from "node:assert/strict";
import { test } from "node:test";
import { generateTotp, generateTotpSecret, verifyTotp } from "../../src/lib/totp";

// RFC 6238 Appendix B seed (ASCII "12345678901234567890") in base32, SHA1.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("totp: matches RFC 6238 SHA-1 test vectors (6-digit truncation)", () => {
  assert.equal(generateTotp(RFC_SECRET, 59_000), "287082");
  assert.equal(generateTotp(RFC_SECRET, 1_111_111_109_000), "081804");
});

test("totp: generate → verify roundtrip", () => {
  const secret = generateTotpSecret();
  const t = 1_700_000_000_000;
  assert.equal(verifyTotp(generateTotp(secret, t), secret, t), true);
});

test("totp: rejects a wrong code", () => {
  const secret = generateTotpSecret();
  const t = 1_700_000_000_000;
  const code = generateTotp(secret, t);
  const wrong = code === "000000" ? "111111" : "000000";
  assert.equal(verifyTotp(wrong, secret, t), false);
});

test("totp: accepts ±1 step drift but not beyond", () => {
  const secret = generateTotpSecret();
  const t = 1_700_000_000_000;
  // Previous and next 30s window are accepted (clock drift tolerance).
  assert.equal(verifyTotp(generateTotp(secret, t - 30_000), secret, t), true);
  assert.equal(verifyTotp(generateTotp(secret, t + 30_000), secret, t), true);
  // Two steps away is rejected.
  assert.equal(verifyTotp(generateTotp(secret, t - 90_000), secret, t), false);
});

test("totp: rejects malformed input", () => {
  const secret = generateTotpSecret();
  assert.equal(verifyTotp("12345", secret), false); // too short
  assert.equal(verifyTotp("abcdef", secret), false); // non-numeric
});

test("totp: secret is non-trivial base32", () => {
  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]+$/);
  assert.ok(secret.length >= 16);
});

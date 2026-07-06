import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OTP } from "../../src/config/constants";
import { generateOtp, hashOtp, verifyOtp } from "../../src/lib/otp";

describe("otp (student login codes)", () => {
  it("generates numeric codes of the configured length", () => {
    for (let i = 0; i < 20; i += 1) {
      const code = generateOtp();
      assert.match(code, new RegExp(`^\\d{${OTP.LENGTH}}$`), code);
    }
  });

  it("hash → verify round-trips for the right code", () => {
    const code = generateOtp();
    assert.equal(verifyOtp(code, hashOtp(code)), true);
  });

  it("rejects a wrong code", () => {
    const code = "123456";
    const other = "654321";
    assert.equal(verifyOtp(other, hashOtp(code)), false);
  });

  it("never stores the plaintext: the hash is a 64-char hex HMAC digest", () => {
    const code = generateOtp();
    const hash = hashOtp(code);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.ok(!hash.includes(code));
  });

  it("rejects safely on a corrupted/foreign hash instead of throwing", () => {
    assert.equal(verifyOtp("123456", "not-a-real-hash"), false);
    assert.equal(verifyOtp("123456", ""), false);
  });
});

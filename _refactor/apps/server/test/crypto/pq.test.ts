/**
 * ML-DSA-65 (FIPS 204) — round-trip sign/verify on the SHARED primitive
 * (v2.md §V4-1/§V4-3). This is the ONLY implementation either the server or
 * the browser calls into `@noble/post-quantum` through — testing it here
 * (from node:test, exercising the real production module) is what proves the
 * server side of the hybrid signature actually works end to end.
 *
 * `@noble/post-quantum` (0.6.1) does not ship a `test/` directory in its
 * published npm package (its `files` field is `*.js`/`*.d.ts`/`src` only), so
 * no FIPS 204 known-answer vectors are available to import here — the
 * round-trip + tamper properties below are what this suite covers instead.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ML_DSA_PUBLIC_KEY_BYTES,
  ML_DSA_SECRET_KEY_BYTES,
  ML_DSA_SIGNATURE_BYTES,
  mlDsaKeygen,
  mlDsaSign,
  mlDsaVerify,
} from "@certifychain/shared/crypto/ml-dsa";

describe("mlDsaKeygen / mlDsaSign / mlDsaVerify — round trip", () => {
  it("produces keys and a signature of the documented FIPS 204 category-3 lengths", () => {
    const { publicKey, secretKey } = mlDsaKeygen();
    assert.equal(publicKey.length, ML_DSA_PUBLIC_KEY_BYTES);
    assert.equal(secretKey.length, ML_DSA_SECRET_KEY_BYTES);
    const sig = mlDsaSign(secretKey, new TextEncoder().encode("hello certifychain"));
    assert.equal(sig.length, ML_DSA_SIGNATURE_BYTES);
  });

  it("a genuine signature verifies under the matching public key", () => {
    const { publicKey, secretKey } = mlDsaKeygen();
    const msg = new TextEncoder().encode("payloadHash-like-32-byte-message");
    const sig = mlDsaSign(secretKey, msg);
    assert.equal(mlDsaVerify(publicKey, msg, sig), true);
  });

  it("rejects a signature under a DIFFERENT key pair's public key", () => {
    const a = mlDsaKeygen();
    const b = mlDsaKeygen();
    const msg = new TextEncoder().encode("same message, different signer");
    const sig = mlDsaSign(a.secretKey, msg);
    assert.equal(mlDsaVerify(b.publicKey, msg, sig), false);
  });

  it("rejects when the message is altered after signing", () => {
    const { publicKey, secretKey } = mlDsaKeygen();
    const sig = mlDsaSign(secretKey, new TextEncoder().encode("original message"));
    assert.equal(mlDsaVerify(publicKey, new TextEncoder().encode("tampered message"), sig), false);
  });

  it("rejects a bit-flipped signature", () => {
    const { publicKey, secretKey } = mlDsaKeygen();
    const msg = new TextEncoder().encode("flip one byte of the signature");
    const sig = mlDsaSign(secretKey, msg);
    const tampered = new Uint8Array(sig);
    const lastIdx = tampered.length - 1;
    tampered[lastIdx] = ((tampered[lastIdx] as number) ^ 0xff) & 0xff;
    assert.equal(mlDsaVerify(publicKey, msg, tampered), false);
  });

  it("never throws on garbage/malformed input — always returns a boolean", () => {
    assert.equal(mlDsaVerify(new Uint8Array(3), new Uint8Array(3), new Uint8Array(3)), false);
    assert.equal(mlDsaVerify(new Uint8Array(0), new Uint8Array(0), new Uint8Array(0)), false);
  });

  it("keygen is randomized: two calls never produce the same key pair", () => {
    const a = mlDsaKeygen();
    const b = mlDsaKeygen();
    assert.notDeepEqual(Buffer.from(a.secretKey), Buffer.from(b.secretKey));
    assert.notDeepEqual(Buffer.from(a.publicKey), Buffer.from(b.publicKey));
  });
});

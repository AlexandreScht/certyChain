import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactLogValue } from "../../src/lib/logger";

const REDACTED = "[redacted]";

describe("redactLogValue", () => {
  it("redacts CDC identity fields in camelCase and snake_case recursively", () => {
    const input = {
      nested: {
        // Redaction does not need a structurally valid NIR: never put a plausible
        // real-world identifier in a source fixture.
        nir: "synthetic-nir-value",
        nirEncrypted: "v1.camel",
        nir_encrypted: "v1.snake",
        birthLastName: "DUPONT",
        birth_last_name: "MARTIN",
        firstNames: "Alice Jeanne",
        first_names: "Bob Jules",
        birthDate: "1984-12-01",
        birth_date: "1985-01-02",
      },
    };

    const output = redactLogValue(input) as {
      nested: Record<string, unknown>;
    };

    for (const key of Object.keys(input.nested)) {
      assert.equal(output.nested[key], REDACTED, key);
    }
    // Redaction returns a copy and never overwrites application data.
    assert.equal(input.nested.nir, "synthetic-nir-value");
  });

  it("redacts OAuth/OID4VCI secrets for protocol, camel and snake spellings", () => {
    const output = redactLogValue({
      "pre-authorized_code": "protocol-code",
      preAuthCode: "camel-code",
      pre_auth_code_hash: "hash",
      txCode: "12345",
      tx_code: "67890",
      accessToken: "jwt.camel",
      access_token: "jwt.snake",
      proof: "proof.jwt",
      proofs: { jwt: ["proof.jwt.2"] },
      offerPayload: { grants: "secret" },
      offer_payload_encrypted: "v1.offer",
    }) as Record<string, unknown>;

    for (const key of Object.keys(output)) {
      assert.equal(output[key], REDACTED, key);
    }
  });

  it("redacts private key/JWK variants while preserving safe public fields", () => {
    const output = redactLogValue({
      privateKey: "pem",
      private_key_encrypted: "v1.key",
      encryptedPrivateKey: "v1.legacy",
      privateJwk: { d: "secret" },
      private_jwk: { d: "secret-2" },
      publicJwk: { kty: "EC", crv: "P-256", x: "public-x", y: "public-y" },
      count: 2,
    }) as Record<string, unknown>;

    assert.equal(output.privateKey, REDACTED);
    assert.equal(output.private_key_encrypted, REDACTED);
    assert.equal(output.encryptedPrivateKey, REDACTED);
    assert.equal(output.privateJwk, REDACTED);
    assert.equal(output.private_jwk, REDACTED);
    assert.deepEqual(output.publicJwk, {
      kty: "EC",
      crv: "P-256",
      x: "public-x",
      y: "public-y",
    });
    assert.equal(output.count, 2);
  });

  it("handles arrays, cycles and excessive depth without exposing raw objects", () => {
    const circular: Record<string, unknown> = { safe: true };
    circular.self = circular;

    let deep: Record<string, unknown> = { nir: "must-not-leak" };
    for (let i = 0; i < 12; i += 1) deep = { child: deep };

    const output = redactLogValue({ items: [{ tx_code: "12345" }], circular, deep });
    const serialized = JSON.stringify(output);

    assert.doesNotMatch(serialized, /12345|must-not-leak/);
    assert.match(serialized, /\[redacted\]/);
    assert.match(serialized, /\[circular\]/);
    assert.match(serialized, /\[truncated\]/);
  });
});

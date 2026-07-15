import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { VC_ISSUER } from "../../../src/modules/vc/issuer";
import {
  authorizationServerMetadata,
  credentialIssuerMetadata,
} from "../../../src/modules/vc/metadata";
import { verifyHolderProof } from "../../../src/modules/vc/proof";
import {
  normalizeVcProtocolError,
  VcProtocolError,
} from "../../../src/modules/vc/protocol";
import { signVcNonce } from "../../../src/modules/vc/tokens";

async function holderProof(overrides: {
  audience?: string | string[];
  nonce?: string;
  typ?: string;
  iat?: number;
  issuer?: string;
  kid?: string;
  jwkAlg?: string;
} = {}): Promise<string> {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  let proof = new SignJWT({ nonce: overrides.nonce ?? (await signVcNonce()) })
    .setProtectedHeader({
      alg: "ES256",
      typ: overrides.typ ?? "openid4vci-proof+jwt",
      jwk: overrides.jwkAlg ? { ...publicJwk, alg: overrides.jwkAlg } : publicJwk,
      ...(overrides.kid ? { kid: overrides.kid } : {}),
    })
    .setAudience(overrides.audience ?? VC_ISSUER)
    .setIssuedAt(overrides.iat ?? Math.floor(Date.now() / 1000));
  if (overrides.issuer) proof = proof.setIssuer(overrides.issuer);
  return proof.sign(privateKey);
}

async function expectProtocolError(
  promise: Promise<unknown>,
  expected: VcProtocolError["error"],
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof VcProtocolError);
    assert.equal(error.error, expected);
    return true;
  });
}

describe("OpenID4VCI holder proof", () => {
  it("accepts an ES256 P-256 proof bound to issuer and stateless nonce", async () => {
    const verified = await verifyHolderProof(await holderProof());
    assert.equal(verified.holderJwk.kty, "EC");
    assert.equal(verified.holderJwk.crv, "P-256");
    assert.match(verified.jkt, /^[A-Za-z0-9_-]{43}$/);
  });

  it("separates an invalid nonce from a structurally invalid proof", async () => {
    await expectProtocolError(verifyHolderProof(await holderProof({ nonce: "not-a-jwt" })), "invalid_nonce");
    await expectProtocolError(verifyHolderProof(await holderProof({ typ: "JWT" })), "invalid_proof");
    await expectProtocolError(
      verifyHolderProof(await holderProof({ audience: "https://other-issuer.invalid" })),
      "invalid_proof",
    );
  });

  it("rejects stale proofs even when their nonce remains cryptographically valid", async () => {
    await expectProtocolError(
      verifyHolderProof(await holderProof({ iat: Math.floor(Date.now() / 1000) - 301 })),
      "invalid_proof",
    );
  });

  it("enforces the anonymous pre-authorized proof profile exactly", async () => {
    await expectProtocolError(
      verifyHolderProof(await holderProof({ audience: [VC_ISSUER] })),
      "invalid_proof",
    );
    await expectProtocolError(
      verifyHolderProof(await holderProof({ issuer: "anonymous-client" })),
      "invalid_proof",
    );
    await expectProtocolError(
      verifyHolderProof(await holderProof({ kid: "must-not-accompany-jwk" })),
      "invalid_proof",
    );
    await expectProtocolError(
      verifyHolderProof(await holderProof({ jwkAlg: "ES384" })),
      "invalid_proof",
    );
  });
});

describe("OpenID4VCI final protocol profile", () => {
  it("advertises final metadata and normalizes unexpected outages", () => {
    const metadata = credentialIssuerMetadata();
    const configuration =
      metadata.credential_configurations_supported["certifychain-diploma"];
    assert.equal(configuration.format, "dc+sd-jwt");
    assert.equal(configuration.vct, "urn:certifychain:diploma:1");
    assert.deepEqual(configuration.cryptographic_binding_methods_supported, ["jwk"]);
    assert.ok(
      configuration.credential_metadata.claims.every(
        (claim) => Array.isArray(claim.path) && claim.path.length === 1,
      ),
    );
    const authorizationServer = authorizationServerMetadata();
    assert.equal(
      authorizationServer["pre-authorized_grant_anonymous_access_supported"],
      true,
    );
    assert.deepEqual(authorizationServer.token_endpoint_auth_methods_supported, ["none"]);

    const expected = new VcProtocolError("invalid_grant");
    assert.equal(normalizeVcProtocolError(expected), expected);
    const outage = normalizeVcProtocolError(new Error("database unavailable"));
    assert.equal(outage.error, "temporarily_unavailable");
    assert.equal(outage.status, 503);
  });
});

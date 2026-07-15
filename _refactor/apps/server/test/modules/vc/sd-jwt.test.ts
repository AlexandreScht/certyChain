import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SignJWT,
  decodeJwt,
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";

import {
  CERTIFYCHAIN_DIPLOMA_VCT,
  DIPLOMA_DISCLOSABLE_CLAIMS,
  SD_JWT_VC_FORMAT,
  buildSdJwtVc,
  selectSdJwtDisclosures,
  verifySdJwtVc,
  type BuildSdJwtVcInput,
  type DiplomaDisclosableClaims,
} from "../../../src/modules/vc/sd-jwt";

const issuer = "https://issuer.certifychain.test";
const issuerKid = "vc-es256-2026-01";
const issuedAt = 1_783_814_400;
const status = {
  status_list: { idx: 42, uri: `${issuer}/vc/status/1` },
};
const claims: DiplomaDisclosableClaims = {
  holder_name: "Alex Dubois",
  program_title: "Master Data Science",
  mention: "Très Bien",
  rncp: "RNCP34031",
  issued_at: "2026-07-03",
  school_name: "École Démonstration",
  school_siret: "12345678901234",
  diploma_id: "22222222-2222-4222-8222-222222222222",
};

interface TestKeys {
  issuerPrivateKey: KeyLike;
  issuerPublicJwk: JWK;
  holderPublicJwk: JWK;
  holderPrivateJwk: JWK;
}

async function generateTestKeys(): Promise<TestKeys> {
  const issuerPair = await generateKeyPair("ES256", { extractable: true });
  const holderPair = await generateKeyPair("ES256", { extractable: true });
  return {
    issuerPrivateKey: issuerPair.privateKey,
    issuerPublicJwk: await exportJWK(issuerPair.publicKey),
    holderPublicJwk: await exportJWK(holderPair.publicKey),
    holderPrivateJwk: await exportJWK(holderPair.privateKey),
  };
}

function buildInput(keys: TestKeys): BuildSdJwtVcInput {
  return {
    issuer,
    issuerKid,
    issuerPrivateKey: keys.issuerPrivateKey,
    holderJwk: keys.holderPublicJwk,
    status,
    claims,
    issuedAt,
  };
}

describe("SD-JWT VC diploma profile", () => {
  it("builds and verifies an ES256 dc+sd-jwt credential with all business claims disclosed", async () => {
    const keys = await generateTestKeys();
    const credential = await buildSdJwtVc(buildInput(keys));
    const parts = credential.split("~");
    const issuerSignedJwt = parts[0];
    assert.ok(issuerSignedJwt);
    assert.equal(parts.at(-1), "", "an issued SD-JWT ends with a tilde and has no KB-JWT");

    const header = decodeProtectedHeader(issuerSignedJwt);
    const rawPayload = decodeJwt(issuerSignedJwt);
    assert.deepEqual(header, { alg: "ES256", typ: SD_JWT_VC_FORMAT, kid: issuerKid });
    assert.equal(rawPayload.exp, undefined, "a diploma has no expiry claim");
    assert.equal(rawPayload._sd_alg, "sha-256");
    assert.ok(Array.isArray(rawPayload._sd));
    assert.equal(rawPayload._sd.length, DIPLOMA_DISCLOSABLE_CLAIMS.length + 2);
    for (const name of DIPLOMA_DISCLOSABLE_CLAIMS) assert.equal(rawPayload[name], undefined);

    const result = await verifySdJwtVc(credential, {
      issuerPublicKey: keys.issuerPublicJwk,
      issuer,
      issuerKid,
      vct: CERTIFYCHAIN_DIPLOMA_VCT,
    });
    assert.deepEqual(result.disclosedClaims, claims);
    assert.deepEqual(result.payload.cnf, {
      jwk: {
        kty: "EC",
        crv: "P-256",
        x: keys.holderPublicJwk.x,
        y: keys.holderPublicJwk.y,
      },
    });
    assert.deepEqual(result.payload.status, status);
    assert.equal(result.payload.iss, issuer);
    assert.equal(result.payload.iat, issuedAt);
    assert.equal(result.payload.vct, CERTIFYCHAIN_DIPLOMA_VCT);
    assert.equal(Object.hasOwn(result.payload, "_sd"), false);

    const salts = parts.slice(1, -1).map((disclosure) => {
      const decoded = JSON.parse(Buffer.from(disclosure, "base64url").toString("utf8")) as unknown[];
      assert.equal(decoded.length, 3);
      assert.equal(typeof decoded[0], "string");
      assert.ok(Buffer.from(decoded[0] as string, "base64url").byteLength >= 16);
      return decoded[0] as string;
    });
    assert.equal(new Set(salts).size, salts.length, "every Disclosure uses a unique salt");
  });

  it("creates a partial presentation containing only selected claims", async () => {
    const keys = await generateTestKeys();
    const credential = await buildSdJwtVc(buildInput(keys));
    const presentation = selectSdJwtDisclosures(credential, ["holder_name", "rncp"]);
    const result = await verifySdJwtVc(presentation, {
      issuerPublicKey: keys.issuerPublicJwk,
      issuer,
    });

    assert.deepEqual(result.disclosedClaims, {
      holder_name: claims.holder_name,
      rncp: claims.rncp,
    });
    assert.equal(result.payload.program_title, undefined);
    assert.equal(result.payload.school_name, undefined);
    assert.deepEqual(result.payload.status, status, "status remains permanently visible");
  });

  it("rejects a modified Disclosure and a signature from another issuer", async () => {
    const keys = await generateTestKeys();
    const credential = await buildSdJwtVc(buildInput(keys));
    const parts = credential.split("~");
    const firstDisclosure = parts[1];
    assert.ok(firstDisclosure);
    const decoded = JSON.parse(Buffer.from(firstDisclosure, "base64url").toString("utf8")) as unknown[];
    decoded[2] = "Valeur falsifiée";
    parts[1] = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
    await assert.rejects(
      verifySdJwtVc(parts.join("~"), { issuerPublicKey: keys.issuerPublicJwk, issuer }),
      /digest is not present/,
    );

    const foreign = await generateKeyPair("ES256", { extractable: true });
    await assert.rejects(
      verifySdJwtVc(credential, {
        issuerPublicKey: await exportJWK(foreign.publicKey),
        issuer,
      }),
    );
  });

  it("never embeds a holder private key", async () => {
    const keys = await generateTestKeys();
    await assert.rejects(
      buildSdJwtVc({ ...buildInput(keys), holderJwk: keys.holderPrivateJwk }),
      /public P-256 JWK/,
    );
  });

  it("rejects business claims made permanently visible by a non-conforming issuer", async () => {
    const keys = await generateTestKeys();
    const digest = Buffer.alloc(32, 7).toString("base64url");
    const jwt = await new SignJWT({
      iss: issuer,
      iat: issuedAt,
      vct: CERTIFYCHAIN_DIPLOMA_VCT,
      cnf: { jwk: keys.holderPublicJwk },
      status,
      _sd_alg: "sha-256",
      _sd: [digest],
      holder_name: claims.holder_name,
    })
      .setProtectedHeader({ alg: "ES256", typ: SD_JWT_VC_FORMAT, kid: issuerKid })
      .sign(keys.issuerPrivateKey);

    await assert.rejects(
      verifySdJwtVc(`${jwt}~`, { issuerPublicKey: keys.issuerPublicJwk, issuer }),
      /must be selectively disclosable/,
    );
  });

  it("omits null or empty optional mention and RNCP claims", async () => {
    const keys = await generateTestKeys();
    for (const optionalValue of [null, ""] as const) {
      const credential = await buildSdJwtVc({
        ...buildInput(keys),
        claims: { ...claims, mention: optionalValue, rncp: optionalValue },
      });
      const result = await verifySdJwtVc(credential, {
        issuerPublicKey: keys.issuerPublicJwk,
        issuer,
      });
      assert.equal(result.disclosedClaims.mention, undefined);
      assert.equal(result.disclosedClaims.rncp, undefined);
      assert.equal(Object.keys(result.disclosedClaims).length, 6);
    }
  });
});

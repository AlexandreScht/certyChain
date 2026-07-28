/**
 * `verifyProofBundle` — hybrid post-quantum ("sd-v3") in jsdom (v2.md §V4-1/
 * §V4-3): the proof that ML-DSA-65 (`@noble/post-quantum`, pure JS) actually
 * RUNS in a browser environment, not just under Node. Mirrors
 * `verify-bundle.spec.ts`'s fixture style (node:crypto for the classical
 * Ed25519 half) but adds the ML-DSA-65 half through the SAME shared
 * `ml-dsa.ts` wrapper the server uses — one implementation, no divergence.
 */
import { createHash, generateKeyPairSync, sign as nodeSign } from "node:crypto";
import type { ProofBundleDTO } from "@certifychain/contract/dto";
import { mlDsaKeygen, mlDsaSign } from "@certifychain/shared/crypto/ml-dsa";
import { verifyProofBundle, type TrustedRoots } from "@certifychain/shared/crypto/verify-bundle";

/* ── Mini-outillage fixture (miroir exact des primitives serveur) ─────────── */

function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function makeDisclosure(name: string, value: unknown, salt: string): string {
  return Buffer.from(JSON.stringify([salt, name, value]), "utf8").toString("base64url");
}
function digestOf(d: string): string {
  return createHash("sha256").update(d, "ascii").digest("base64url");
}
function signHashHex(privateKeyPem: string, hashHex: string): string {
  return nodeSign(null, Buffer.from(hashHex, "hex"), privateKeyPem).toString("base64");
}
function sha256HexOfCanonical(payload: unknown): string {
  return createHash("sha256").update(canonicalize(payload), "utf8").digest("hex");
}
/**
 * A Node `Buffer` is `instanceof Uint8Array` only WITHIN Node's own realm.
 * jsdom (this spec's test environment) runs in a SEPARATE realm, and
 * `@noble/hashes`'s `abytes` guard checks `constructor.name === "Uint8Array"`
 * as its cross-realm fallback — which a `Buffer` (constructor.name="Buffer")
 * never satisfies. `mlDsaSign`/`mlDsaVerify` work fine with a Node `Buffer` in
 * REAL Node (server) or a genuine `Uint8Array` in a REAL browser (client);
 * this helper only bridges the artificial jsdom/Node realm split in THIS test.
 */
function toU8(buf: Buffer): Uint8Array {
  return new Uint8Array(buf);
}

const DIPLOMA_ID = "22222222-2222-4222-8222-222222222222";
const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";
const SCHOOL_NAME = "École Jest PQ";
const CERT_ISSUED_AT = "2026-07-01";
const FIELDS: Record<string, unknown> = {
  holderName: "Alex Dubois",
  holderEmail: "alex@example.com",
  programTitle: "Master Data Science Post-Quantique",
  mention: "Très Bien",
  rncp: "RNCP34031",
  issuedAt: "2025-07-03",
  externalId: null,
};

interface Fixture {
  bundle: ProofBundleDTO;
  disclosureByField: Record<string, string>;
  payloadHash: string;
}

function buildFixture(disclosed: string[]): Fixture {
  const root = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const school = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  // The post-quantum half — SAME wrapper (`ml-dsa.ts`) the server calls.
  const rootPq = mlDsaKeygen();
  const schoolPq = mlDsaKeygen();
  const schoolPublicKeyPq = Buffer.from(schoolPq.publicKey).toString("base64");

  const disclosureByField: Record<string, string> = {};
  let saltCounter = 0;
  for (const name of Object.keys(FIELDS)) {
    const salt = Buffer.alloc(16, ++saltCounter).toString("base64url");
    disclosureByField[name] = makeDisclosure(name, FIELDS[name], salt);
  }
  const payload: ProofBundleDTO["payload"] = {
    v: "sd-v3",
    h: "sha-256",
    id: DIPLOMA_ID,
    schoolId: SCHOOL_ID,
    _sd: Object.values(disclosureByField).map(digestOf).sort(),
  };
  const payloadHash = sha256HexOfCanonical(payload);

  // Ed25519 certificate — canonicalize({schoolId, publicKey, name, issuedAt}).
  const certificate = nodeSign(
    null,
    Buffer.from(
      canonicalize({ schoolId: SCHOOL_ID, publicKey: school.publicKey, name: SCHOOL_NAME, issuedAt: CERT_ISSUED_AT }),
      "utf8",
    ),
    root.privateKey,
  ).toString("base64");
  // ML-DSA-65 certificate — SAME canonical shape, `publicKey` = the school's PQ key.
  const certificatePq = Buffer.from(
    mlDsaSign(
      rootPq.secretKey,
      toU8(
        Buffer.from(
          canonicalize({ schoolId: SCHOOL_ID, publicKey: schoolPublicKeyPq, name: SCHOOL_NAME, issuedAt: CERT_ISSUED_AT }),
          "utf8",
        ),
      ),
    ),
  ).toString("base64");

  const signaturePq = Buffer.from(mlDsaSign(schoolPq.secretKey, toU8(Buffer.from(payloadHash, "hex")))).toString(
    "base64",
  );

  const bundle: ProofBundleDTO = {
    engine: "ed25519-sd-v3",
    payload,
    signature: signHashHex(school.privateKey, payloadHash),
    signaturePq,
    disclosures: disclosed.map((f) => disclosureByField[f]!),
    school: {
      id: SCHOOL_ID,
      name: SCHOOL_NAME,
      publicKey: school.publicKey,
      certificate,
      certIssuedAt: CERT_ISSUED_AT,
      publicKeyPq: schoolPublicKeyPq,
      certificatePq,
    },
    root: {
      publicKey: root.publicKey,
      publicKeyPq: Buffer.from(rootPq.publicKey).toString("base64"),
    },
    revocation: {
      checkedAt: new Date().toISOString(),
      status: "active",
      source: `http://localhost:4000/verify/revocation/${DIPLOMA_ID}`,
    },
  };
  return { bundle, disclosureByField, payloadHash };
}

/**
 * Root pinning (audit 2026-07-27): `buildFixture` mints a fresh classical AND
 * post-quantum root key pair on every call — the trust anchor for a test is
 * whatever THIS bundle's root actually is, never read back implicitly.
 */
function rootsOf(bundle: ProofBundleDTO): TrustedRoots {
  return {
    ed25519: [bundle.root.publicKey],
    mlDsa65: bundle.root.publicKeyPq ? [bundle.root.publicKeyPq] : [],
  };
}

describe("verifyProofBundle hybride post-quantique en jsdom (preuve navigateur, v2.md §V4-1)", () => {
  it("accepte un bundle v3 authentique : LES DEUX signatures vérifient", async () => {
    const { bundle } = buildFixture(["holderName", "programTitle"]);
    const outcome = await verifyProofBundle(bundle, rootsOf(bundle));
    expect(outcome).toEqual({
      ok: true,
      disclosed: { holderName: "Alex Dubois", programTitle: "Master Data Science Post-Quantique" },
      hidden: 5,
    });
  });

  it("rejette si SEULE la signature Ed25519 est cassée (PQ intacte)", async () => {
    const { bundle } = buildFixture(["holderName"]);
    const foreign = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    bundle.signature = signHashHex(foreign.privateKey, sha256HexOfCanonical(bundle.payload));
    const outcome = await verifyProofBundle(bundle, rootsOf(bundle));
    expect(outcome.ok).toBe(false);
  });

  it("rejette si SEULE la signature post-quantique est cassée (Ed25519 intacte)", async () => {
    const { bundle, payloadHash } = buildFixture(["holderName"]);
    const foreign = mlDsaKeygen();
    bundle.signaturePq = Buffer.from(
      mlDsaSign(foreign.secretKey, toU8(Buffer.from(payloadHash, "hex"))),
    ).toString("base64");
    const outcome = await verifyProofBundle(bundle, rootsOf(bundle));
    expect(outcome.ok).toBe(false);
  });

  it("rejette un bundle v3 sans AUCUNE signature post-quantique", async () => {
    const { bundle } = buildFixture(["holderName"]);
    delete bundle.signaturePq;
    const outcome = await verifyProofBundle(bundle, rootsOf(bundle));
    expect(outcome.ok).toBe(false);
  });

  it("un bundle v2 (zéro champ post-quantique) vérifie EXACTEMENT comme avant (non-régression)", async () => {
    // Fresh, self-consistent v2 fixture (own signature over its OWN "sd-v2"
    // payload) — NOT a v3 bundle relabeled, which would carry a signature
    // computed over a different canonical form and fail for the wrong reason.
    const root = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const school = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const disclosure = makeDisclosure("mention", "Très Bien", Buffer.alloc(16, 7).toString("base64url"));
    const payload: ProofBundleDTO["payload"] = {
      v: "sd-v2",
      h: "sha-256",
      id: DIPLOMA_ID,
      schoolId: SCHOOL_ID,
      _sd: [digestOf(disclosure)],
    };
    const certificate = nodeSign(
      null,
      Buffer.from(
        canonicalize({ schoolId: SCHOOL_ID, publicKey: school.publicKey, name: SCHOOL_NAME, issuedAt: CERT_ISSUED_AT }),
        "utf8",
      ),
      root.privateKey,
    ).toString("base64");
    const v2Bundle: ProofBundleDTO = {
      engine: "ed25519-sd-v2",
      payload,
      signature: signHashHex(school.privateKey, sha256HexOfCanonical(payload)),
      disclosures: [disclosure],
      school: {
        id: SCHOOL_ID,
        name: SCHOOL_NAME,
        publicKey: school.publicKey,
        certificate,
        certIssuedAt: CERT_ISSUED_AT,
      },
      root: { publicKey: root.publicKey },
      revocation: { checkedAt: new Date().toISOString(), status: "active", source: "x" },
    };
    expect(v2Bundle.signaturePq).toBeUndefined();
    expect(v2Bundle.school.publicKeyPq).toBeUndefined();
    expect(v2Bundle.root.publicKeyPq).toBeUndefined();
    const outcome = await verifyProofBundle(v2Bundle, rootsOf(v2Bundle));
    expect(outcome.ok).toBe(true);
  });
});

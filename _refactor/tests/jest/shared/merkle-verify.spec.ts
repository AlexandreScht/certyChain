/**
 * Merkle RFC 6962 + `verifyTransparency` en jsdom : la preuve que la vérification
 * du journal de transparence tourne dans un NAVIGATEUR (aucune API Node dans les
 * modules partagés). Vecteurs figés croisés avec les données de référence de
 * transparency-dev/merkle (ex google/certificate-transparency-go) ; fixtures
 * signées avec node:crypto (mêmes primitives que `apps/server/src/crypto/keys.ts`),
 * comme verify-bundle.spec.ts. Les DEUX chemins Ed25519 sont exercés : WebCrypto
 * injecté depuis Node ET fallback pur-JS @noble forcé.
 */
import { createHash, generateKeyPairSync, sign as nodeSign, webcrypto } from "node:crypto";
import type { ProofBundleDTO } from "@certifychain/contract/dto";
import {
  inclusionProofHex,
  merkleRootHex,
  verifyConsistency,
  verifyInclusion,
} from "@certifychain/shared/crypto/merkle";
import { verifyTransparency } from "@certifychain/shared/crypto/verify-transparency";
import type { TrustedRoots } from "@certifychain/shared/crypto/trusted-roots";

/* ── Vecteurs figés (feuilles historiques Certificate Transparency) ───────── */

const leafHashHex = (data: Buffer): string =>
  createHash("sha256").update(Buffer.concat([Buffer.from([0x00]), data])).digest("hex");

const EMPTY_ROOT = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const CT_LEAF_HASHES = [
  "",
  "00",
  "10",
  "2021",
  "3031",
  "40414243",
  "5051525354555657",
  "606162636465666768696a6b6c6d6e6f",
].map((h) => leafHashHex(Buffer.from(h, "hex")));
const CT_ROOT_3 = "aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77";
const CT_ROOT_5 = "4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4";
const CT_ROOT_6 = "76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef";
const CT_ROOT_8 = "5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328";
const CT_ROOT_2 = "fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125";
const CT_PATH_0_8 = [
  "96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7",
  "5f083f0a1a33ca076a95279832580db3e0ef4584bdff1f54c8a360f50de3031e",
  "6b47aaf29ee3c2af9af889bc1fb9254dabd31177f16232dd6aab035ca39bf6e4",
];
const CT_PATH_5_8 = [
  "bc1a0643b12e4d2d7c77918f44e0f4f79a838b6cf9ec5b5c283e1f4d88599e6b",
  "ca854ea128ed050b41b35ffc1b87b8eb2bde461e9e3b5596ece6b9d5975a0ae0",
  "d37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7",
];
const CT_PROOF_2_5 = [
  "5f083f0a1a33ca076a95279832580db3e0ef4584bdff1f54c8a360f50de3031e",
  "bc1a0643b12e4d2d7c77918f44e0f4f79a838b6cf9ec5b5c283e1f4d88599e6b",
];
const CT_PROOF_6_8 = [
  "0ebc5d3437fbe2db158b9f126a1d118e308181031d0a949f8dededebc558ef6a",
  "ca854ea128ed050b41b35ffc1b87b8eb2bde461e9e3b5596ece6b9d5975a0ae0",
  "d37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7",
];

const flipNibble = (hex: string): string => (hex.startsWith("0") ? "f" : "0") + hex.slice(1);

describe("verifyInclusion en jsdom (vecteurs CT figés)", () => {
  it("accepte PATH(0, D[8]) et PATH(5, D[8])", () => {
    expect(
      verifyInclusion({
        leafHashHex: CT_LEAF_HASHES[0]!,
        leafIndex: 0,
        treeSize: 8,
        auditPathHex: CT_PATH_0_8,
        rootHashHex: CT_ROOT_8,
      }),
    ).toBe(true);
    expect(
      verifyInclusion({
        leafHashHex: CT_LEAF_HASHES[5]!,
        leafIndex: 5,
        treeSize: 8,
        auditPathHex: CT_PATH_5_8,
        rootHashHex: CT_ROOT_8,
      }),
    ).toBe(true);
  });

  it("rejette path altéré, index faux, hex invalide, path tronqué — sans throw", () => {
    const ok = {
      leafHashHex: CT_LEAF_HASHES[5]!,
      leafIndex: 5,
      treeSize: 8,
      auditPathHex: CT_PATH_5_8,
      rootHashHex: CT_ROOT_8,
    };
    expect(verifyInclusion({ ...ok, auditPathHex: CT_PATH_5_8.map(flipNibble) })).toBe(false);
    expect(verifyInclusion({ ...ok, leafIndex: 4 })).toBe(false);
    expect(verifyInclusion({ ...ok, leafIndex: 8 })).toBe(false);
    expect(verifyInclusion({ ...ok, treeSize: 0 })).toBe(false);
    expect(verifyInclusion({ ...ok, rootHashHex: CT_ROOT_8.toUpperCase() })).toBe(false);
    expect(verifyInclusion({ ...ok, rootHashHex: CT_ROOT_8.slice(1) })).toBe(false);
    expect(verifyInclusion({ ...ok, leafHashHex: "zz".repeat(32) })).toBe(false);
    expect(verifyInclusion({ ...ok, auditPathHex: CT_PATH_5_8.slice(0, -1) })).toBe(false);
  });
});

describe("verifyConsistency en jsdom (vecteurs CT figés)", () => {
  it("accepte PROOF(2, D[5]), PROOF(6, D[8]) et les cas triviaux (0→n, n→n)", () => {
    expect(
      verifyConsistency({
        fromSize: 2,
        toSize: 5,
        fromRootHex: CT_ROOT_2,
        toRootHex: CT_ROOT_5,
        proofHex: CT_PROOF_2_5,
      }),
    ).toBe(true);
    expect(
      verifyConsistency({
        fromSize: 6,
        toSize: 8,
        fromRootHex: CT_ROOT_6,
        toRootHex: CT_ROOT_8,
        proofHex: CT_PROOF_6_8,
      }),
    ).toBe(true);
    expect(
      verifyConsistency({
        fromSize: 0,
        toSize: 8,
        fromRootHex: EMPTY_ROOT,
        toRootHex: CT_ROOT_8,
        proofHex: [],
      }),
    ).toBe(true);
    expect(
      verifyConsistency({
        fromSize: 8,
        toSize: 8,
        fromRootHex: CT_ROOT_8,
        toRootHex: CT_ROOT_8,
        proofHex: [],
      }),
    ).toBe(true);
  });

  it("rejette racine from altérée, proof altérée, proof vide non triviale, from > to", () => {
    const ok = {
      fromSize: 2,
      toSize: 5,
      fromRootHex: CT_ROOT_2,
      toRootHex: CT_ROOT_5,
      proofHex: CT_PROOF_2_5,
    };
    expect(verifyConsistency({ ...ok, fromRootHex: flipNibble(CT_ROOT_2) })).toBe(false);
    expect(verifyConsistency({ ...ok, proofHex: CT_PROOF_2_5.map(flipNibble) })).toBe(false);
    expect(verifyConsistency({ ...ok, proofHex: [] })).toBe(false);
    expect(verifyConsistency({ ...ok, fromSize: 5, toSize: 2 })).toBe(false);
  });
});

/* ── verifyTransparency : fixture complète signée avec node:crypto ────────── */

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

const DIPLOMA_ID = "22222222-2222-4222-8222-222222222222";
const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";
const ISSUED_AT = "2025-07-03";
const CHECKPOINT_AT = "2026-07-14T12:00:00.000Z";

/** Root pinning (audit 2026-07-27): the trust anchor for a test is whatever
 *  root THIS bundle was actually signed under — `buildTransparentBundle`
 *  mints a fresh key pair on every call. */
function rootsOf(bundle: ProofBundleDTO): TrustedRoots {
  return { ed25519: [bundle.root.publicKey], mlDsa65: [] };
}

function buildTransparentBundle(discloseIssuedAt: boolean): ProofBundleDTO {
  const root = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const school = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const dIssuedAt = makeDisclosure("issuedAt", ISSUED_AT, Buffer.alloc(16, 1).toString("base64url"));
  const dName = makeDisclosure("holderName", "Alex Dubois", Buffer.alloc(16, 2).toString("base64url"));
  const payload: ProofBundleDTO["payload"] = {
    v: "sd-v2",
    h: "sha-256",
    id: DIPLOMA_ID,
    schoolId: SCHOOL_ID,
    _sd: [digestOf(dIssuedAt), digestOf(dName)].sort(),
  };
  const payloadHash = createHash("sha256").update(canonicalize(payload), "utf8").digest("hex");
  // signDiplomaHash : signe les OCTETS du hash hex (identique à crypto/keys.ts).
  const signature = nodeSign(null, Buffer.from(payloadHash, "hex"), school.privateKey).toString("base64");
  const certificate = nodeSign(
    null,
    Buffer.from(
      canonicalize({
        schoolId: SCHOOL_ID,
        publicKey: school.publicKey,
        name: "École Jest",
        issuedAt: "2026-07-01",
      }),
      "utf8",
    ),
    root.privateKey,
  ).toString("base64");

  // Feuille du journal (v2.md §V3-1 — aucune PII) + arbre de 3 feuilles.
  const leafBytes = Buffer.from(
    canonicalize({ diplomaId: DIPLOMA_ID, schoolId: SCHOOL_ID, payloadHash, signature, issuedAt: ISSUED_AT }),
    "utf8",
  );
  const leaves = [
    leafHashHex(Buffer.from("voisin-0", "utf8")),
    leafHashHex(leafBytes),
    leafHashHex(Buffer.from("voisin-2", "utf8")),
  ];
  const rootHash = merkleRootHex(leaves);
  const cp = { treeSize: 3, rootHash, timestamp: CHECKPOINT_AT };
  const cpSignature = nodeSign(null, Buffer.from(canonicalize(cp), "utf8"), root.privateKey).toString("base64");

  return {
    engine: "ed25519-sd-v2",
    payload,
    signature,
    disclosures: discloseIssuedAt ? [dIssuedAt, dName] : [dName],
    school: {
      id: SCHOOL_ID,
      name: "École Jest",
      publicKey: school.publicKey,
      certificate,
      certIssuedAt: "2026-07-01",
    },
    root: { publicKey: root.publicKey },
    revocation: {
      checkedAt: new Date().toISOString(),
      status: "active",
      source: `http://localhost:4000/verify/revocation/${DIPLOMA_ID}`,
    },
    transparency: {
      leafIndex: 1,
      leafHash: leaves[1]!,
      auditPath: inclusionProofHex(leaves, 1),
      checkpoint: { ...cp, signature: cpSignature, otsAnchored: false, otsUpgradedAt: null, otsProof: null },
    },
  };
}

describe("verifyTransparency en jsdom (fallback @noble : pas de subtle.Ed25519)", () => {
  it("accepte un bundle journalisé authentique → binding 'full'", async () => {
    const bundle = buildTransparentBundle(true);
    const outcome = await verifyTransparency(bundle, rootsOf(bundle));
    expect(outcome).toEqual({
      ok: true,
      binding: "full",
      leafIndex: 1,
      treeSize: 3,
      checkpointTimestamp: CHECKPOINT_AT,
      otsUpgradedAt: null,
    });
    // Le fallback FORCÉ rend exactement le même verdict.
    expect(await verifyTransparency(bundle, rootsOf(bundle), { forceNoble: true })).toEqual(outcome);
  });

  it("binding 'hash-only' quand issuedAt est masqué — aucune valeur masquée exposée", async () => {
    const bundle = buildTransparentBundle(false);
    const outcome = await verifyTransparency(bundle, rootsOf(bundle), { forceNoble: true });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.binding).toBe("hash-only");
    expect(JSON.stringify(outcome)).not.toContain(ISSUED_AT);
  });

  it("rejette une signature de checkpoint altérée (même verdict en @noble forcé)", async () => {
    const bundle = buildTransparentBundle(true);
    const t = bundle.transparency!;
    t.checkpoint.signature = t.checkpoint.signature.slice(0, -4) + "AAAA";
    const viaDefault = await verifyTransparency(bundle, rootsOf(bundle));
    const viaNoble = await verifyTransparency(bundle, rootsOf(bundle), { forceNoble: true });
    expect(viaDefault.ok).toBe(false);
    expect(viaNoble).toEqual(viaDefault);
  });

  it("rejette un auditPath altéré et une feuille d'un autre diplôme", async () => {
    const tamperedPath = buildTransparentBundle(true);
    tamperedPath.transparency!.auditPath = tamperedPath.transparency!.auditPath.map(flipNibble);
    expect((await verifyTransparency(tamperedPath, rootsOf(tamperedPath))).ok).toBe(false);

    // La feuille à l'index 1 est remplacée par celle d'un autre contenu, arbre re-signé…
    const foreignLeaf = buildTransparentBundle(true);
    const other = leafHashHex(Buffer.from("un-autre-diplome", "utf8"));
    // …mais SANS re-signer : l'inclusion casse déjà. (Le cas « inclusion valide,
    // binding faux » est couvert côté node:test avec les pièces de prod.)
    foreignLeaf.transparency!.leafHash = other;
    expect((await verifyTransparency(foreignLeaf, rootsOf(foreignLeaf))).ok).toBe(false);
  });
});

describe("verifyTransparency — chemin WebCrypto (subtle Ed25519 injecté)", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");

  beforeAll(() => {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  });
  afterAll(() => {
    if (original) Object.defineProperty(globalThis, "crypto", original);
    else delete (globalThis as { crypto?: unknown }).crypto;
  });

  it("vérifie via subtle et rend le même verdict que @noble", async () => {
    const bundle = buildTransparentBundle(true);
    const viaSubtle = await verifyTransparency(bundle, rootsOf(bundle));
    const viaNoble = await verifyTransparency(bundle, rootsOf(bundle), { forceNoble: true });
    expect(viaSubtle).toEqual({
      ok: true,
      binding: "full",
      leafIndex: 1,
      treeSize: 3,
      checkpointTimestamp: CHECKPOINT_AT,
      otsUpgradedAt: null,
    });
    expect(viaNoble).toEqual(viaSubtle);
  });
});

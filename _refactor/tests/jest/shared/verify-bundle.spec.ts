/**
 * `verifyProofBundle` — l'algorithme ed25519-sd-v2 (v2.md §V1-2) tourne en jsdom :
 * c'est la preuve qu'il tourne dans un NAVIGATEUR (pas d'API Node dans le module).
 *
 * Les fixtures sont générées avec node:crypto (mêmes primitives que
 * `apps/server/src/crypto/keys.ts` : SPKI PEM, signature du SHA-256 canonique) —
 * ce qui teste au passage l'interop PEM SPKI → clé brute 32 octets des deux mondes.
 * Le fallback pur-JS @noble est FORCÉ dans un bloc dédié ; le chemin WebCrypto est
 * exercé en injectant le webcrypto de Node (jsdom n'expose pas subtle.Ed25519).
 */
import {
  createHash,
  generateKeyPairSync,
  sign as nodeSign,
  webcrypto,
} from "node:crypto";
import type { ProofBundleDTO } from "@certifychain/contract/dto";
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
/** signDiplomaHash : signe les OCTETS du hash hex (identique à crypto/keys.ts). */
function signHashHex(privateKeyPem: string, hashHex: string): string {
  return nodeSign(null, Buffer.from(hashHex, "hex"), privateKeyPem).toString("base64");
}
function sha256HexOfCanonical(payload: unknown): string {
  return createHash("sha256").update(canonicalize(payload), "utf8").digest("hex");
}

const DIPLOMA_ID = "22222222-2222-4222-8222-222222222222";
const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";
const FIELDS: Record<string, unknown> = {
  holderName: "Alex Dubois",
  holderEmail: "alex@example.com",
  programTitle: "Master Data Science",
  mention: "Très Bien",
  rncp: "RNCP34031",
  issuedAt: "2025-07-03",
  externalId: null,
};

interface Fixture {
  bundle: ProofBundleDTO;
  disclosureByField: Record<string, string>;
}

function buildFixture(disclosed: string[]): Fixture {
  // Racine + école : Ed25519 SPKI PEM, exactement comme generateEd25519KeyPair().
  const root = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const school = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const disclosureByField: Record<string, string> = {};
  let saltCounter = 0;
  for (const name of Object.keys(FIELDS)) {
    // Sels déterministes distincts (16 octets) — suffisant pour un test.
    const salt = Buffer.alloc(16, ++saltCounter).toString("base64url");
    disclosureByField[name] = makeDisclosure(name, FIELDS[name], salt);
  }
  const payload: ProofBundleDTO["payload"] = {
    v: "sd-v2",
    h: "sha-256",
    id: DIPLOMA_ID,
    schoolId: SCHOOL_ID,
    _sd: Object.values(disclosureByField).map(digestOf).sort(),
  };

  // Certificat : la racine signe canonicalize({schoolId, publicKey, name, issuedAt})
  // — même forme canonique que crypto/keys.ts (issueSchoolCertificate).
  const certPayload = {
    schoolId: SCHOOL_ID,
    publicKey: school.publicKey,
    name: "École Jest",
    issuedAt: "2026-07-01",
  };
  const certificate = nodeSign(
    null,
    Buffer.from(canonicalize(certPayload), "utf8"),
    root.privateKey,
  ).toString("base64");

  const bundle: ProofBundleDTO = {
    engine: "ed25519-sd-v2",
    payload,
    signature: signHashHex(school.privateKey, sha256HexOfCanonical(payload)),
    disclosures: disclosed.map((f) => disclosureByField[f]!),
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
  };
  return { bundle, disclosureByField };
}

/**
 * Root pinning (audit 2026-07-27): `buildFixture` mints a FRESH root key pair
 * on every call, so the trust anchor for a given test is whatever root that
 * SAME fixture actually signed with — never the bundle's own field trusted
 * blindly. `otherTrustedRoots` builds the "wrong pin" case explicitly.
 */
function rootsOf(bundle: ProofBundleDTO): TrustedRoots {
  return { ed25519: [bundle.root.publicKey], mlDsa65: [] };
}

/* ── Chemin par défaut (jsdom : pas de subtle.Ed25519 → @noble) ───────────── */

describe("verifyProofBundle en jsdom (preuve navigateur)", () => {
  it("accepte un bundle authentique et rend disclosed + hidden", async () => {
    const { bundle } = buildFixture(["holderName", "programTitle"]);
    const outcome = await verifyProofBundle(bundle, rootsOf(bundle));
    expect(outcome).toEqual({
      ok: true,
      disclosed: { holderName: "Alex Dubois", programTitle: "Master Data Science" },
      hidden: 5,
    });
  });

  it("préserve une valeur null divulguée (externalId)", async () => {
    const { bundle } = buildFixture(["externalId"]);
    const outcome = await verifyProofBundle(bundle, rootsOf(bundle));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.disclosed).toEqual({ externalId: null });
  });

  it("rejette une disclosure falsifiée (valeur modifiée)", async () => {
    const { bundle } = buildFixture(["holderName"]);
    bundle.disclosures = [
      makeDisclosure("holderName", "Eve", Buffer.alloc(16, 9).toString("base64url")),
    ];
    const outcome = await verifyProofBundle(bundle, rootsOf(bundle));
    expect(outcome.ok).toBe(false);
  });

  it("rejette une signature d'une autre école", async () => {
    const { bundle } = buildFixture(["holderName"]);
    const foreign = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    bundle.signature = signHashHex(foreign.privateKey, sha256HexOfCanonical(bundle.payload));
    const outcome = await verifyProofBundle(bundle, rootsOf(bundle));
    expect(outcome.ok).toBe(false);
  });

  it("rejette schoolId ≠ school.id et un certificat qui ne chaîne pas", async () => {
    const a = buildFixture([]);
    a.bundle.payload = { ...a.bundle.payload, schoolId: "99999999-9999-4999-8999-999999999999" };
    expect((await verifyProofBundle(a.bundle, rootsOf(a.bundle))).ok).toBe(false);

    const b = buildFixture([]);
    const otherRoot = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    b.bundle.root = { publicKey: otherRoot.publicKey };
    // Trust the (now tampered) declared root itself, so this stays a test of
    // "certificate doesn't chain to the DECLARED root", not of root pinning
    // (that bypass has its own dedicated suite, verify-bundle-root-pinning.spec.ts).
    expect((await verifyProofBundle(b.bundle, rootsOf(b.bundle))).ok).toBe(false);
  });

  it("rejette une version de payload inconnue", async () => {
    const { bundle } = buildFixture([]);
    bundle.payload = { ...bundle.payload, v: "sd-v3" as "sd-v2" };
    expect((await verifyProofBundle(bundle, rootsOf(bundle))).ok).toBe(false);
  });
});

/* ── Fallback @noble FORCÉ (pur JS, aucun WebCrypto) ──────────────────────── */

describe("fallback @noble forcé (forceNoble)", () => {
  it("vérifie le même bundle sans WebCrypto", async () => {
    const { bundle } = buildFixture(["mention"]);
    const outcome = await verifyProofBundle(bundle, rootsOf(bundle), { forceNoble: true });
    expect(outcome).toEqual({ ok: true, disclosed: { mention: "Très Bien" }, hidden: 6 });
  });

  it("rejette pareil en fallback (pas de divergence de chemin)", async () => {
    const { bundle } = buildFixture(["mention"]);
    bundle.signature = bundle.signature.slice(0, -4) + "AAAA";
    const outcome = await verifyProofBundle(bundle, rootsOf(bundle), { forceNoble: true });
    expect(outcome.ok).toBe(false);
  });
});

/* ── Chemin WebCrypto (subtle Ed25519 injecté depuis Node) ────────────────── */

describe("chemin WebCrypto (crypto.subtle Ed25519)", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");

  beforeAll(() => {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  });
  afterAll(() => {
    if (original) Object.defineProperty(globalThis, "crypto", original);
    else delete (globalThis as { crypto?: unknown }).crypto;
  });

  it("vérifie via subtle et rend le même verdict que @noble", async () => {
    const { bundle } = buildFixture(["holderName", "rncp"]);
    const viaSubtle = await verifyProofBundle(bundle, rootsOf(bundle));
    const viaNoble = await verifyProofBundle(bundle, rootsOf(bundle), { forceNoble: true });
    expect(viaSubtle).toEqual({
      ok: true,
      disclosed: { holderName: "Alex Dubois", rncp: "RNCP34031" },
      hidden: 5,
    });
    expect(viaNoble).toEqual(viaSubtle);
  });
});

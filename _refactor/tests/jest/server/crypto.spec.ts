/**
 * Cœur cryptographique : canonicalisation, hachage, signatures Ed25519,
 * certificats racine, coffre AES-256-GCM et ProofEngine (nonce anti-rejeu).
 */
import {
  canonicalize,
  generateEd25519KeyPair,
  hashDiplomaPayload,
  issueSchoolCertificate,
  ed25519NonceEngine as proofEngine,
  keyVault,
  signDiplomaHash,
  signEd25519,
  verifyEd25519,
  verifySchoolCertificate,
  type DiplomaPayload,
} from "../../../apps/server/src/crypto";

const payload: DiplomaPayload = {
  id: "8b4a2f0e-1111-4222-8333-444455556666",
  schoolId: "11112222-3333-4444-5555-666677778888",
  holderName: "Alex Dubois",
  holderEmail: "alex@example.com",
  programTitle: "Master Data Science",
  mention: "Très Bien",
  rncp: "RNCP35900",
  issuedAt: "2026-07-01",
  externalId: null,
};

describe("canonicalize", () => {
  it("trie les clés récursivement (représentation indépendante de l'ordre)", () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalize({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("préserve l'ordre des tableaux", () => {
    expect(canonicalize([2, 1])).not.toBe(canonicalize([1, 2]));
  });
});

describe("hashDiplomaPayload", () => {
  it("est stable pour un même payload", () => {
    expect(hashDiplomaPayload(payload)).toBe(hashDiplomaPayload({ ...payload }));
  });

  it("change dès qu'un champ signé change", () => {
    const base = hashDiplomaPayload(payload);
    expect(hashDiplomaPayload({ ...payload, mention: "Bien" })).not.toBe(base);
    expect(hashDiplomaPayload({ ...payload, rncp: null })).not.toBe(base);
    expect(hashDiplomaPayload({ ...payload, issuedAt: "2026-07-02" })).not.toBe(base);
  });
});

describe("Ed25519 sign/verify", () => {
  const { publicKey, privateKey } = generateEd25519KeyPair();

  it("vérifie une signature authentique", () => {
    const hash = hashDiplomaPayload(payload);
    const sig = signDiplomaHash(privateKey, hash);
    expect(verifyEd25519(publicKey, Buffer.from(hash, "hex"), sig)).toBe(true);
  });

  it("refuse un contenu altéré", () => {
    const hash = hashDiplomaPayload(payload);
    const sig = signDiplomaHash(privateKey, hash);
    const tampered = hashDiplomaPayload({ ...payload, holderName: "Quelqu'un D'Autre" });
    expect(verifyEd25519(publicKey, Buffer.from(tampered, "hex"), sig)).toBe(false);
  });

  it("refuse la clé publique d'une autre école", () => {
    const other = generateEd25519KeyPair();
    const hash = hashDiplomaPayload(payload);
    const sig = signDiplomaHash(privateKey, hash);
    expect(verifyEd25519(other.publicKey, Buffer.from(hash, "hex"), sig)).toBe(false);
  });

  it("ne jette pas sur une signature/clé mal formée (retourne false)", () => {
    expect(verifyEd25519("not-a-pem", Buffer.from("00", "hex"), "!!")).toBe(false);
  });
});

describe("certificat racine d'école", () => {
  const { publicKey } = generateEd25519KeyPair();
  const cert = {
    schoolId: "11112222-3333-4444-5555-666677778888",
    publicKey,
    name: "HEC Paris",
    issuedAt: "2026-07-01",
  };

  it("émet puis vérifie contre la racine CertifyChain", () => {
    const signed = issueSchoolCertificate(cert);
    expect(verifySchoolCertificate(cert, signed)).toBe(true);
  });

  it("refuse un payload de certificat altéré (nom, clé, date)", () => {
    const signed = issueSchoolCertificate(cert);
    expect(verifySchoolCertificate({ ...cert, name: "Fake School" }, signed)).toBe(false);
    expect(verifySchoolCertificate({ ...cert, issuedAt: "2026-07-02" }, signed)).toBe(false);
    const other = generateEd25519KeyPair();
    expect(verifySchoolCertificate({ ...cert, publicKey: other.publicKey }, signed)).toBe(false);
  });
});

describe("keyVault (AES-256-GCM)", () => {
  it("roundtrip chiffrer → déchiffrer", () => {
    const secret = "clé privée ultra secrète · éàç";
    expect(keyVault.decryptToString(keyVault.encrypt(secret))).toBe(secret);
  });

  it("deux chiffrements du même clair diffèrent (IV aléatoire)", () => {
    expect(keyVault.encrypt("x")).not.toBe(keyVault.encrypt("x"));
  });

  it("refuse un ciphertext altéré (tag GCM)", () => {
    const enc = keyVault.encrypt("secret");
    const parts = enc.split(".");
    const flipped = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3]!.slice(0, -2)}AA`;
    expect(() => keyVault.decrypt(flipped)).toThrow();
  });

  it("refuse un format inconnu", () => {
    expect(() => keyVault.decrypt("v9.zzz")).toThrow(/Invalid ciphertext/);
  });
});

describe("proofEngine (ed25519-nonce-v1)", () => {
  const { publicKey, privateKey } = generateEd25519KeyPair();
  const payloadHashHex = hashDiplomaPayload(payload);
  const signatureB64 = signDiplomaHash(privateKey, payloadHashHex);
  const holderSecret = "holder-secret-123";

  function proofFor(nonce: string): string {
    return proofEngine.buildProof({ nonce, holderSecret, signatureB64 });
  }

  it("accepte une preuve liée au bon nonce", () => {
    const nonce = proofEngine.generateNonce();
    expect(
      proofEngine.verifyProof({
        publicKeyPem: publicKey,
        payloadHashHex,
        signatureB64,
        nonce,
        holderSecret,
        proof: proofFor(nonce),
      }),
    ).toBe(true);
  });

  it("refuse une preuve rejouée avec un autre nonce (anti-rejeu)", () => {
    const nonce = proofEngine.generateNonce();
    const replayed = proofFor(nonce);
    expect(
      proofEngine.verifyProof({
        publicKeyPem: publicKey,
        payloadHashHex,
        signatureB64,
        nonce: proofEngine.generateNonce(),
        holderSecret,
        proof: replayed,
      }),
    ).toBe(false);
  });

  it("refuse une signature invalide même si la preuve-nonce colle", () => {
    const nonce = proofEngine.generateNonce();
    const other = generateEd25519KeyPair();
    const badSig = signDiplomaHash(other.privateKey, payloadHashHex);
    expect(
      proofEngine.verifyProof({
        publicKeyPem: publicKey,
        payloadHashHex,
        signatureB64: badSig,
        nonce,
        holderSecret,
        proof: proofEngine.buildProof({ nonce, holderSecret, signatureB64: badSig }),
      }),
    ).toBe(false);
  });

  it("génère des nonces uniques et url-safe", () => {
    const a = proofEngine.generateNonce();
    const b = proofEngine.generateNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("signEd25519 produit du base64 vérifiable générique", () => {
    const data = Buffer.from("payload");
    const sig = signEd25519(privateKey, data);
    expect(verifyEd25519(publicKey, data, sig)).toBe(true);
  });
});

/**
 * Couture Signer (v2.md §V2-1) : non-régression du chemin envelope (identique à
 * l'ancien signDiplomaHash), matrice de résolution par école, et client Vault
 * Transit (KmsSigner) exercé de bout en bout contre un faux Vault en mémoire —
 * sans réseau ni SDK.
 */
import { createPublicKey } from "node:crypto";
import {
  KmsSigner,
  envelopeSigner,
  keyVault,
  resolveSchoolSigner,
  signDiplomaHash,
  verifyEd25519,
} from "../../../apps/server/src/crypto";
import { createFakeVaultTransit } from "../../../apps/server/test/helpers/fake-vault";

// Vecteur figé (Ed25519 déterministe) : même clé + même hash ⇒ même signature b64.
const PRIVATE_PKCS8_PEM =
  "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIG9/Fr8H8FCaKZFd095+wx/ZhnrmReoYOGYkcqY7mMdU\n-----END PRIVATE KEY-----\n";
const PUBLIC_SPKI_PEM =
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAVZxQOnKthBO9RjQA8OwAWDVrTdoqTW+3vB/U+B7ujOw=\n-----END PUBLIC KEY-----\n";
const HASH_HEX = "3b1f8e2a9c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5";
const EXPECTED_SIG_B64 =
  "GpI8EBiGn2ih0DkCD9R4qU+sCdD78+9nrmCCerGasYJy4Z3BbFuBXE7n6udLK0tiW7m4rvdWgU5TiXGZxAfUBA==";
const HASH_BYTES = Buffer.from(HASH_HEX, "hex");

describe("EnvelopeSigner — non-régression", () => {
  it("produit exactement la même signature que l'ancien signDiplomaHash", async () => {
    const ref = keyVault.encrypt(PRIVATE_PKCS8_PEM);
    const viaSigner = await envelopeSigner.sign(ref, HASH_BYTES);
    expect(viaSigner).toBe(EXPECTED_SIG_B64);
    expect(signDiplomaHash(PRIVATE_PKCS8_PEM, HASH_HEX)).toBe(EXPECTED_SIG_B64);
    expect(verifyEd25519(PUBLIC_SPKI_PEM, HASH_BYTES, viaSigner)).toBe(true);
  });

  it("createSchoolKey : PEM SPKI valide + roundtrip sign/verify", async () => {
    const { publicKeyPem, ref } = await envelopeSigner.createSchoolKey("ecole-1");
    expect(publicKeyPem).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    const sig = await envelopeSigner.sign(ref, HASH_BYTES);
    expect(verifyEd25519(publicKeyPem, HASH_BYTES, sig)).toBe(true);
  });
});

describe("resolveSchoolSigner — matrice par école", () => {
  const blob = keyVault.encrypt(PRIVATE_PKCS8_PEM);

  it("envelope legacy (encryptedPrivateKey seul) → signe", async () => {
    const r = resolveSchoolSigner({ signerKind: "envelope", signerRef: null, encryptedPrivateKey: blob });
    expect(r?.signer.kind).toBe("envelope");
    expect(await r!.signer.sign(r!.ref, HASH_BYTES)).toBe(EXPECTED_SIG_B64);
  });

  it("envelope nouveau (signerRef seul) → signe", async () => {
    const r = resolveSchoolSigner({ signerKind: "envelope", signerRef: blob, encryptedPrivateKey: null });
    expect(await r!.signer.sign(r!.ref, HASH_BYTES)).toBe(EXPECTED_SIG_B64);
  });

  it("aucun matériel → null", () => {
    expect(
      resolveSchoolSigner({ signerKind: "envelope", signerRef: null, encryptedPrivateKey: null }),
    ).toBeNull();
  });

  it("kms + ref → signer kms ; kms sans ref → null ; kind inconnu → null", () => {
    expect(
      resolveSchoolSigner({ signerKind: "kms", signerRef: "cc-school-x", encryptedPrivateKey: null })
        ?.signer.kind,
    ).toBe("kms");
    expect(
      resolveSchoolSigner({ signerKind: "kms", signerRef: null, encryptedPrivateKey: blob }),
    ).toBeNull();
    expect(
      resolveSchoolSigner({ signerKind: "sgx", signerRef: "x", encryptedPrivateKey: null }),
    ).toBeNull();
  });
});

describe("KmsSigner — bout en bout contre le faux Vault Transit", () => {
  const TOKEN = "s.jest-vault-token";
  const SCHOOL_ID = "22222222-2222-4222-8222-222222222222";

  const makeSigner = (fetchImpl: typeof globalThis.fetch, token = TOKEN) =>
    new KmsSigner({ addr: "https://vault.test", token, mount: "transit", keyPrefix: "cc-school", fetchImpl });

  it("createSchoolKey puis sign : vérifiable sous la clé publique retournée", async () => {
    const { fetchImpl, keys } = createFakeVaultTransit({ token: TOKEN });
    const signer = makeSigner(fetchImpl);

    const { publicKeyPem, ref } = await signer.createSchoolKey(SCHOOL_ID);
    expect(ref).toBe(`cc-school-${SCHOOL_ID}`);
    const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
    expect(Buffer.from(der.subarray(-32))).toEqual(keys.get(ref)!.rawPublicKey);

    const sig = await signer.sign(ref, HASH_BYTES);
    expect(verifyEd25519(publicKeyPem, HASH_BYTES, sig)).toBe(true);
  });

  it("clé inconnue → rejette ; token invalide → rejette", async () => {
    const { fetchImpl } = createFakeVaultTransit({ token: TOKEN });
    await expect(makeSigner(fetchImpl).sign("cc-school-inconnue", HASH_BYTES)).rejects.toThrow();
    await expect(makeSigner(fetchImpl, "mauvais-token").createSchoolKey(SCHOOL_ID)).rejects.toThrow();
  });
});

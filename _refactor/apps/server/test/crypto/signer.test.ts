/**
 * Unit tests for the Signer seam (v2.md §V2-1) — no DB, no network.
 * Run: pnpm --filter @certifychain/server test
 *
 * Covers the NON-REGRESSION guarantee (the envelope signer reproduces the legacy
 * `signDiplomaHash` byte-for-byte against a frozen vector), the per-school resolver
 * matrix, the Vault Transit `KmsSigner` end-to-end against an in-memory fake, the
 * raw→SPKI helper, and the executable grep guard that no plaintext private key is
 * handled outside `signer.ts` (DoD V2-2).
 */
import assert from "node:assert/strict";
import { createPublicKey } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { keyVault } from "../../src/crypto/envelope";
import { generateEd25519KeyPair, signDiplomaHash, verifyEd25519 } from "../../src/crypto/keys";
import {
  KmsSigner,
  envelopeSigner,
  rawEd25519PublicKeyToSpkiPem,
  resolveSchoolSigner,
} from "../../src/crypto/signer";
import { createFakeVaultTransit } from "../helpers/fake-vault";

// ── Frozen non-regression vector (Ed25519 is deterministic) ──────────────────
// A fixed PKCS8 key, a fixed 32-byte "diploma hash", and the exact base64
// signature the LEGACY path produced. Any drift in the signing path breaks this.
const PRIVATE_PKCS8_PEM =
  "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIG9/Fr8H8FCaKZFd095+wx/ZhnrmReoYOGYkcqY7mMdU\n-----END PRIVATE KEY-----\n";
const PUBLIC_SPKI_PEM =
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAVZxQOnKthBO9RjQA8OwAWDVrTdoqTW+3vB/U+B7ujOw=\n-----END PUBLIC KEY-----\n";
const HASH_HEX = "3b1f8e2a9c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90a1b2c3d4e5f60718293a4b";
const EXPECTED_SIG_B64 =
  "GpI8EBiGn2ih0DkCD9R4qU+sCdD78+9nrmCCerGasYJy4Z3BbFuBXE7n6udLK0tiW7m4rvdWgU5TiXGZxAfUBA==";
const HASH_BYTES = Buffer.from(HASH_HEX, "hex");

describe("EnvelopeSigner — non-regression against the legacy path", () => {
  it("reproduces signDiplomaHash byte-for-byte for the frozen vector", async () => {
    // Guard the vector itself: an odd-length hex string would silently drop its
    // last nibble in Buffer.from(..., "hex") and the test would lie about what
    // it signs. 64 hex chars ⇔ the 32 bytes of a SHA-256 digest.
    assert.equal(HASH_HEX.length, 64);
    assert.equal(HASH_BYTES.length, 32);
    const ref = keyVault.encrypt(PRIVATE_PKCS8_PEM);
    const viaSigner = await envelopeSigner.sign(ref, HASH_BYTES);
    const viaLegacy = signDiplomaHash(PRIVATE_PKCS8_PEM, HASH_HEX);

    assert.equal(viaSigner, EXPECTED_SIG_B64);
    assert.equal(viaLegacy, EXPECTED_SIG_B64);
    assert.equal(viaSigner, viaLegacy);
    assert.equal(verifyEd25519(PUBLIC_SPKI_PEM, HASH_BYTES, viaSigner), true);
  });

  it("exposes a stable kind", () => {
    assert.equal(envelopeSigner.kind, "envelope");
  });
});

describe("EnvelopeSigner.createSchoolKey", () => {
  it("returns a valid SPKI PEM that verifies its own signature", async () => {
    const { publicKeyPem, ref } = await envelopeSigner.createSchoolKey("school-1");
    assert.match(publicKeyPem, /^-----BEGIN PUBLIC KEY-----\n/);
    // The public key parses (would throw otherwise).
    createPublicKey(publicKeyPem);

    const sig = await envelopeSigner.sign(ref, HASH_BYTES);
    assert.equal(verifyEd25519(publicKeyPem, HASH_BYTES, sig), true);
  });

  it("mints a distinct key on every call", async () => {
    const a = await envelopeSigner.createSchoolKey("school-1");
    const b = await envelopeSigner.createSchoolKey("school-1");
    assert.notEqual(a.publicKeyPem, b.publicKeyPem);
    assert.notEqual(a.ref, b.ref);
  });

  it("stores the private key as an envelope PKCS8 blob (legacy storage format)", async () => {
    const { ref } = await envelopeSigner.createSchoolKey("school-1");
    assert.match(keyVault.decryptToString(ref), /^-----BEGIN PRIVATE KEY-----/);
  });
});

describe("resolveSchoolSigner — per-school resolution matrix", () => {
  const legacyBlob = keyVault.encrypt(PRIVATE_PKCS8_PEM);

  it("envelope legacy (encryptedPrivateKey only) resolves and signs", async () => {
    const resolved = resolveSchoolSigner({
      signerKind: "envelope",
      signerRef: null,
      encryptedPrivateKey: legacyBlob,
    });
    assert.ok(resolved);
    assert.equal(resolved.signer.kind, "envelope");
    assert.equal(await resolved.signer.sign(resolved.ref, HASH_BYTES), EXPECTED_SIG_B64);
  });

  it("envelope new (signerRef only) resolves and signs", async () => {
    const resolved = resolveSchoolSigner({
      signerKind: "envelope",
      signerRef: legacyBlob,
      encryptedPrivateKey: null,
    });
    assert.ok(resolved);
    assert.equal(await resolved.signer.sign(resolved.ref, HASH_BYTES), EXPECTED_SIG_B64);
  });

  it("envelope prefers signerRef over the legacy blob", () => {
    const resolved = resolveSchoolSigner({
      signerKind: "envelope",
      signerRef: "the-new-ref",
      encryptedPrivateKey: "the-legacy-blob",
    });
    assert.equal(resolved?.ref, "the-new-ref");
  });

  it("envelope with no material at all → null", () => {
    assert.equal(
      resolveSchoolSigner({ signerKind: "envelope", signerRef: null, encryptedPrivateKey: null }),
      null,
    );
  });

  it("kms with a ref → the kms signer", () => {
    const resolved = resolveSchoolSigner({
      signerKind: "kms",
      signerRef: "certifychain-school-xyz",
      encryptedPrivateKey: null,
    });
    assert.ok(resolved);
    assert.equal(resolved.signer.kind, "kms");
    assert.equal(resolved.ref, "certifychain-school-xyz");
  });

  it("kms without a ref → null (never falls back to the legacy blob)", () => {
    assert.equal(
      resolveSchoolSigner({
        signerKind: "kms",
        signerRef: null,
        encryptedPrivateKey: legacyBlob,
      }),
      null,
    );
  });

  it("unknown kind → null", () => {
    assert.equal(
      resolveSchoolSigner({ signerKind: "hsm-9000", signerRef: "x", encryptedPrivateKey: null }),
      null,
    );
  });
});

describe("KmsSigner — Vault Transit end-to-end against the in-memory fake", () => {
  const TOKEN = "s.faketoken-value";
  const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";

  const makeSigner = (fetchImpl: typeof globalThis.fetch, token = TOKEN) =>
    new KmsSigner({
      addr: "https://vault.example.com",
      token,
      mount: "transit",
      keyPrefix: "cc-school",
      fetchImpl,
    });

  it("createSchoolKey returns an SPKI PEM whose 32 raw bytes match the fake key", async () => {
    const { fetchImpl, keys } = createFakeVaultTransit({ token: TOKEN, mount: "transit" });
    const signer = makeSigner(fetchImpl);

    const { publicKeyPem, ref } = await signer.createSchoolKey(SCHOOL_ID);
    assert.equal(ref, `cc-school-${SCHOOL_ID}`);

    const stored = keys.get(ref);
    assert.ok(stored);
    const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
    assert.deepEqual(Buffer.from(der.subarray(-32)), stored.rawPublicKey);
  });

  it("sign produces a signature verifiable under the returned public key", async () => {
    const { fetchImpl } = createFakeVaultTransit({ token: TOKEN });
    const signer = makeSigner(fetchImpl);

    const { publicKeyPem, ref } = await signer.createSchoolKey(SCHOOL_ID);
    const sig = await signer.sign(ref, HASH_BYTES);
    assert.equal(verifyEd25519(publicKeyPem, HASH_BYTES, sig), true);
  });

  it("throws on an unknown key (404)", async () => {
    const { fetchImpl } = createFakeVaultTransit({ token: TOKEN });
    const signer = makeSigner(fetchImpl);
    await assert.rejects(() => signer.sign("cc-school-does-not-exist", HASH_BYTES));
  });

  it("throws when the token is missing/wrong (403)", async () => {
    const { fetchImpl } = createFakeVaultTransit({ token: TOKEN });
    const signer = makeSigner(fetchImpl, "wrong-token");
    await assert.rejects(() => signer.createSchoolKey(SCHOOL_ID));
  });

  it("throws on a signature without the vault:v1: prefix", async () => {
    const malformed: typeof globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: { signature: "v1:no-vault-prefix" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const signer = makeSigner(malformed);
    await assert.rejects(() => signer.sign("cc-school-x", HASH_BYTES), /unexpected signature format/);
  });

  it("never leaks the token in an error message", async () => {
    const SECRET_TOKEN = "top-secret-vault-token-do-not-leak";
    // Fake configured with a DIFFERENT token → every request 403s.
    const { fetchImpl } = createFakeVaultTransit({ token: "some-other-token" });
    const signer = makeSigner(fetchImpl, SECRET_TOKEN);
    const err = await signer.sign("cc-school-x", HASH_BYTES).then(
      () => null,
      (e: unknown) => e,
    );
    assert.ok(err instanceof Error);
    assert.ok(!err.message.includes(SECRET_TOKEN), "token must not appear in the error message");
  });
});

describe("rawEd25519PublicKeyToSpkiPem", () => {
  it("round-trips Node's own SPKI PEM byte-for-byte", () => {
    const { publicKey } = generateEd25519KeyPair();
    const der = createPublicKey(publicKey).export({ type: "spki", format: "der" });
    const raw = Buffer.from(der.subarray(-32));
    assert.equal(rawEd25519PublicKeyToSpkiPem(raw), publicKey);
  });

  it("rejects a non-32-byte key", () => {
    assert.throws(() => rawEd25519PublicKeyToSpkiPem(Buffer.alloc(31)));
    assert.throws(() => rawEd25519PublicKeyToSpkiPem(Buffer.alloc(33)));
  });
});

describe("guard — no plaintext school private key outside signer.ts (DoD V2-2)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const dirs = [
    resolve(here, "../../src/modules/schools"),
    resolve(here, "../../src/modules/diplomas"),
  ];

  const tsFilesUnder = (dir: string): string[] =>
    readdirSync(dir, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => resolve(dir, f));

  it("scans the guarded module trees (sanity: files were found)", () => {
    const files = dirs.flatMap(tsFilesUnder);
    assert.ok(files.some((f) => f.endsWith("schools.service.ts")));
    assert.ok(files.some((f) => f.endsWith("diplomas.service.ts")));
  });

  for (const symbol of ["decryptToString", "signDiplomaHash"] as const) {
    it(`no file under modules/schools or modules/diplomas references ${symbol}`, () => {
      for (const file of dirs.flatMap(tsFilesUnder)) {
        assert.ok(
          !readFileSync(file, "utf8").includes(symbol),
          `${file} must not reference ${symbol} (private keys stay inside signer.ts)`,
        );
      }
    });
  }
});

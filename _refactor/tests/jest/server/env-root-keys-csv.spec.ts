/**
 * Root rotation CSV support (audit 2026-07-28, docs/security/root-secrets-
 * rotation.md §4) — `CERTIFYCHAIN_ROOT_PUBLIC_KEY` / `CERTIFYCHAIN_ROOT_PQ_
 * PUBLIC_KEY` now accept a comma-separated list, same encoding/convention as
 * the browser's `NEXT_PUBLIC_*` pinning (`apps/client/web/src/lib/trusted-
 * roots.ts`). This suite proves:
 *   - a single value (no comma, every pre-existing `.env`) behaves EXACTLY as
 *     before (non-regression);
 *   - two comma-separated roots both verify, whichever one actually signed a
 *     given school certificate;
 *   - the FIRST entry is the one the (single) private key actually signs
 *     with, by convention;
 *   - a CSV made only of separators/whitespace fails fast at boot, exactly
 *     like every other misconfiguration in `config/env.ts`.
 *
 * `env` is `Object.freeze`d at the FIRST import (piège n°11) and `crypto/
 * keys.ts` reads it directly, so every scenario reloads BOTH modules together
 * in an isolated registry — same pattern as `tests/jest/server/env-pq-policy.
 * spec.ts` / `mailer.spec.ts`.
 */
import { generateKeyPairSync } from "node:crypto";
import { mlDsaKeygen } from "@certifychain/shared/crypto/ml-dsa";
import { canonicalize } from "../../../apps/server/src/crypto/hashing";

type KeysModule = typeof import("../../../apps/server/src/crypto/keys");

const ORIGINAL_ENV = { ...process.env };

let exitSpy: ReturnType<typeof jest.spyOn>;
let errorSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  exitSpy = jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as never);
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  exitSpy.mockRestore();
  errorSpy.mockRestore();
  process.env = { ...ORIGINAL_ENV };
});

/** Reloads `crypto/keys.ts` (and transitively `config/env.ts`) in an isolated
 *  module registry so the current `process.env` is re-validated from scratch. */
function loadKeys(): KeysModule {
  let mod: KeysModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("../../../apps/server/src/crypto/keys") as KeysModule;
  });
  return mod as KeysModule;
}

function ed25519Pair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

describe("config/env.ts + crypto/keys.ts — CERTIFYCHAIN_ROOT_PUBLIC_KEY CSV", () => {
  it("a single value (no comma) behaves exactly as before: one-element trusted list", () => {
    const root = ed25519Pair();
    process.env.CERTIFYCHAIN_ROOT_PRIVATE_KEY = Buffer.from(root.privateKey).toString("base64");
    process.env.CERTIFYCHAIN_ROOT_PUBLIC_KEY = Buffer.from(root.publicKey).toString("base64");

    const keys = loadKeys();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(keys.certifychainTrustedEd25519Roots()).toEqual([root.publicKey]);
    expect(keys.certifychainRootPublicKeyPem()).toBe(root.publicKey);

    const payload = { schoolId: "s1", publicKey: ed25519Pair().publicKey, name: "École Solo", issuedAt: "2026-07-01" };
    const cert = keys.issueSchoolCertificate(payload);
    expect(keys.verifySchoolCertificate(payload, cert)).toBe(true);
    expect(keys.findTrustedEd25519RootFor(payload, cert)).toBe(root.publicKey);
  });

  it("two comma-separated roots: a certificate signed by EITHER verifies; the FIRST entry is the one that actually signs", () => {
    const incoming = ed25519Pair(); // current signer, listed first
    const outgoing = ed25519Pair(); // still-trusted, coexisting during the rotation window

    process.env.CERTIFYCHAIN_ROOT_PRIVATE_KEY = Buffer.from(incoming.privateKey).toString("base64");
    process.env.CERTIFYCHAIN_ROOT_PUBLIC_KEY = [
      Buffer.from(incoming.publicKey).toString("base64"),
      Buffer.from(outgoing.publicKey).toString("base64"),
    ].join(",");

    const keys = loadKeys();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(keys.certifychainTrustedEd25519Roots()).toEqual([incoming.publicKey, outgoing.publicKey]);
    // Convention: index 0 signs.
    expect(keys.certifychainRootPublicKeyPem()).toBe(incoming.publicKey);

    // A FRESH school, certified after the rotation → signed by `incoming`.
    const freshPayload = { schoolId: "s-fresh", publicKey: ed25519Pair().publicKey, name: "École Neuve", issuedAt: "2026-08-01" };
    const freshCert = keys.issueSchoolCertificate(freshPayload); // always signs with the current (private) key
    expect(keys.verifySchoolCertificate(freshPayload, freshCert)).toBe(true);
    expect(keys.findTrustedEd25519RootFor(freshPayload, freshCert)).toBe(incoming.publicKey);

    // An OLD school, certified BEFORE the rotation → signed by `outgoing`
    // (simulated directly with `signEd25519`, mirroring what `issueSchoolCertificate`
    // would have produced back when `outgoing` was still the active private key).
    const oldPayload = { schoolId: "s-old", publicKey: ed25519Pair().publicKey, name: "École Historique", issuedAt: "2026-01-01" };
    const oldCert = keys.signEd25519(outgoing.privateKey, Buffer.from(canonicalize(oldPayload), "utf8"));
    expect(keys.verifySchoolCertificate(oldPayload, oldCert)).toBe(true);
    expect(keys.findTrustedEd25519RootFor(oldPayload, oldCert)).toBe(outgoing.publicKey);
  });

  it("a certificate signed by NEITHER trusted root is rejected (verifySchoolCertificate → false, find → null)", () => {
    const incoming = ed25519Pair();
    const outgoing = ed25519Pair();
    const attacker = ed25519Pair();

    process.env.CERTIFYCHAIN_ROOT_PRIVATE_KEY = Buffer.from(incoming.privateKey).toString("base64");
    process.env.CERTIFYCHAIN_ROOT_PUBLIC_KEY = [
      Buffer.from(incoming.publicKey).toString("base64"),
      Buffer.from(outgoing.publicKey).toString("base64"),
    ].join(",");

    const keys = loadKeys();
    const payload = { schoolId: "s-forged", publicKey: ed25519Pair().publicKey, name: "École Pirate", issuedAt: "2026-07-01" };
    const forgedCert = keys.signEd25519(attacker.privateKey, Buffer.from(canonicalize(payload), "utf8"));

    expect(keys.verifySchoolCertificate(payload, forgedCert)).toBe(false);
    expect(keys.findTrustedEd25519RootFor(payload, forgedCert)).toBeNull();
  });

  it("whitespace around entries is trimmed, same as the browser's CSV parsing", () => {
    const incoming = ed25519Pair();
    const outgoing = ed25519Pair();
    process.env.CERTIFYCHAIN_ROOT_PRIVATE_KEY = Buffer.from(incoming.privateKey).toString("base64");
    process.env.CERTIFYCHAIN_ROOT_PUBLIC_KEY = `  ${Buffer.from(incoming.publicKey).toString("base64")} , ${Buffer.from(outgoing.publicKey).toString("base64")}  `;

    const keys = loadKeys();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(keys.certifychainTrustedEd25519Roots()).toEqual([incoming.publicKey, outgoing.publicKey]);
  });

  it("a CSV made only of separators/whitespace fails fast at boot (process.exit(1))", () => {
    process.env.CERTIFYCHAIN_ROOT_PUBLIC_KEY = " , , ";

    expect(() => loadKeys()).toThrow(/process\.exit\(1\)/);
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toMatch(/CERTIFYCHAIN_ROOT_PUBLIC_KEY/);
    expect(logged).toMatch(/at least one/);
  });
});

describe("config/env.ts + crypto/keys.ts — CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY CSV", () => {
  it("a single PQ root behaves exactly as before", () => {
    const { publicKey, secretKey } = mlDsaKeygen();
    process.env.PQ_POLICY = "dual-sign";
    process.env.CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY = Buffer.from(secretKey).toString("base64");
    process.env.CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY = Buffer.from(publicKey).toString("base64");

    const keys = loadKeys();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(keys.certifychainTrustedMlDsaRoots()).toEqual([Buffer.from(publicKey).toString("base64")]);
    expect(keys.certifychainRootPqPublicKeyB64()).toBe(Buffer.from(publicKey).toString("base64"));
  });

  it("two comma-separated PQ roots: both entries are exposed, index 0 is the signer", () => {
    const incoming = mlDsaKeygen();
    const outgoing = mlDsaKeygen();
    const incomingB64 = Buffer.from(incoming.publicKey).toString("base64");
    const outgoingB64 = Buffer.from(outgoing.publicKey).toString("base64");

    process.env.PQ_POLICY = "dual-sign";
    process.env.CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY = Buffer.from(incoming.secretKey).toString("base64");
    process.env.CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY = `${incomingB64},${outgoingB64}`;

    const keys = loadKeys();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(keys.certifychainTrustedMlDsaRoots()).toEqual([incomingB64, outgoingB64]);
    expect(keys.certifychainRootPqPublicKeyB64()).toBe(incomingB64);
  });

  it("one malformed entry among several reports a precise per-entry error (process.exit(1))", () => {
    const { publicKey, secretKey } = mlDsaKeygen();
    process.env.PQ_POLICY = "dual-sign";
    process.env.CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY = Buffer.from(secretKey).toString("base64");
    process.env.CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY = `${Buffer.from(publicKey).toString("base64")},${Buffer.from("too-short").toString("base64")}`;

    expect(() => loadKeys()).toThrow(/process\.exit\(1\)/);
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toMatch(/CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY entry 2 of 2/);
  });
});

/**
 * `apps/client/web/src/lib/trusted-roots.ts` — the browser's PKI root trust
 * anchor (audit 2026-07-27 root-pinning fix). This is the single most
 * fragile link in the whole pinning chain: if this base64/PEM decode is
 * wrong, or the env var is mis-set at build time, EVERY proof bundle shows
 * "invalid" in production, silently — no existing gate catches it, and the
 * web front's existing specs only ever pass `expect.anything()` for
 * `TRUSTED_ROOTS` (`verify-page.spec.tsx`, `transparency-panel.spec.tsx`).
 *
 * `NEXT_PUBLIC_*` is inlined by Next.js at BUILD time and `TRUSTED_ROOTS` is
 * computed AT IMPORT of the module — each variant below sets the env var
 * THEN reimports the module in an isolated registry (pattern of
 * `tests/jest/server/mailer.spec.ts` / `env-pq-policy.spec.ts`), never a
 * mutation after the fact (piège n°11, v2.md §6).
 */
import { generateKeyPairSync } from "node:crypto";
import { isTrustedEd25519Root } from "@certifychain/shared/crypto/trusted-roots";

type TrustedRootsModule = typeof import("../../../apps/client/web/src/lib/trusted-roots");

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

/** Reloads the module in an isolated registry so it re-reads `process.env`
 *  (the module computes `TRUSTED_ROOTS` once, at import). */
function loadTrustedRoots(): TrustedRootsModule {
  let mod: TrustedRootsModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("../../../apps/client/web/src/lib/trusted-roots") as TrustedRootsModule;
  });
  return mod as TrustedRootsModule;
}

/** A REAL Ed25519 root key pair, SPKI PEM — same shape as
 *  `apps/server/src/scripts/gen-root-keys.ts` (`generateKeyPairSync("ed25519", …)`). */
function genEd25519RootPem(): string {
  const { publicKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return publicKey as string;
}

/** `.env` encoding for the Ed25519 root: base64 of the PEM TEXT (not the raw
 *  key bytes) — exactly `gen-root-keys.ts`'s `b64(publicKey)`. */
function b64OfPem(pem: string): string {
  return Buffer.from(pem, "utf8").toString("base64");
}

describe("trusted-roots.ts (web) — décodage de l'ancre navigateur", () => {
  it("une VRAIE racine Ed25519, encodée exactement comme .env, est effectivement acceptée par isTrustedEd25519Root", () => {
    const pem = genEd25519RootPem();
    process.env.NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY = b64OfPem(pem);
    delete process.env.NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY;

    const { TRUSTED_ROOTS } = loadTrustedRoots();

    expect(TRUSTED_ROOTS.ed25519).toEqual([pem]);
    expect(isTrustedEd25519Root(pem, TRUSTED_ROOTS.ed25519)).toBe(true);
  });

  it("CSV à 2 entrées (rotation) : la racine sortante ET l'entrante vérifient toutes les deux", () => {
    const outgoing = genEd25519RootPem();
    const incoming = genEd25519RootPem();
    process.env.NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY =
      `${b64OfPem(outgoing)},${b64OfPem(incoming)}`;

    const { TRUSTED_ROOTS } = loadTrustedRoots();

    expect(TRUSTED_ROOTS.ed25519).toEqual([outgoing, incoming]);
    expect(isTrustedEd25519Root(outgoing, TRUSTED_ROOTS.ed25519)).toBe(true);
    expect(isTrustedEd25519Root(incoming, TRUSTED_ROOTS.ed25519)).toBe(true);
    // Rotation lists only the roots it names — an unrelated third key stays untrusted.
    const outsider = genEd25519RootPem();
    expect(isTrustedEd25519Root(outsider, TRUSTED_ROOTS.ed25519)).toBe(false);
  });

  it("variable absente ⇒ liste VIDE ⇒ tout est rejeté (fail-closed, jamais un bypass)", () => {
    delete process.env.NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY;
    delete process.env.NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY;

    const { TRUSTED_ROOTS } = loadTrustedRoots();

    expect(TRUSTED_ROOTS.ed25519).toEqual([]);
    expect(TRUSTED_ROOTS.mlDsa65).toEqual([]);
    // An empty list must refuse EVERY root, including a perfectly real one —
    // never "trust nothing configured ⇒ trust anything presented".
    const pem = genEd25519RootPem();
    expect(isTrustedEd25519Root(pem, TRUSTED_ROOTS.ed25519)).toBe(false);
  });

  it("une entrée base64 malformée est ignorée SANS faire tomber les entrées valides qui l'entourent", () => {
    const before = genEd25519RootPem();
    const after = genEd25519RootPem();
    // "!" sits outside the base64 alphabet — atob() throws decoding it.
    process.env.NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY =
      `${b64OfPem(before)},!!!not-base64!!!,${b64OfPem(after)}`;

    const { TRUSTED_ROOTS } = loadTrustedRoots();

    expect(TRUSTED_ROOTS.ed25519).toEqual([before, after]);
    expect(isTrustedEd25519Root(before, TRUSTED_ROOTS.ed25519)).toBe(true);
    expect(isTrustedEd25519Root(after, TRUSTED_ROOTS.ed25519)).toBe(true);
  });

  it("la racine PQ (NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY) reste un CSV de base64 BRUT, jamais décodé en PEM", () => {
    const rawPqKeyB64 = Buffer.from("fake-ml-dsa-65-root-bytes").toString("base64");
    process.env.NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY = rawPqKeyB64;
    delete process.env.NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY;

    const { TRUSTED_ROOTS } = loadTrustedRoots();

    // Unlike `ed25519`, the PQ list carries the CSV entries verbatim (no `atob`).
    expect(TRUSTED_ROOTS.mlDsa65).toEqual([rawPqKeyB64]);
    expect(TRUSTED_ROOTS.ed25519).toEqual([]);
  });
});

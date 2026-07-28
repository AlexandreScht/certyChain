/**
 * `config/env.ts` — PQ_POLICY fail-fast validation (v2.md §V4-1).
 *
 * `env` is `Object.freeze`d at the FIRST import of the module (piège n°11):
 * to exercise different `PQ_POLICY` / root-key combinations we must reload the
 * module in an isolated registry (pattern of `tests/jest/server/mailer.spec.ts`),
 * never mutate the frozen object after the fact.
 *
 * Because an invalid configuration makes `config/env.ts` call `process.exit(1)`
 * at import time, `process.exit` is mocked to THROW instead of really killing
 * the Jest worker — the throw is what `expect(...).toThrow()` catches below.
 */
import { mlDsaKeygen } from "@certifychain/shared/crypto/ml-dsa";

type EnvModule = typeof import("../../../apps/server/src/config/env");

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

/** Reloads `config/env.ts` in an isolated module registry (piège n°11). */
function loadEnv(): EnvModule {
  let mod: EnvModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("../../../apps/server/src/config/env") as EnvModule;
  });
  return mod as EnvModule;
}

describe("env.ts — PQ_POLICY=require (défaut depuis 2026-07-28)", () => {
  it("sans PQ_POLICY ni clés PQ : refuse de démarrer (process.exit(1)) — aucun diplôme sans double signature", () => {
    delete process.env.PQ_POLICY;
    delete process.env.CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY;
    delete process.env.CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY;

    expect(() => loadEnv()).toThrow(/process\.exit\(1\)/);
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    // Le message doit expliquer POURQUOI (default "require") et QUOI faire.
    expect(logged).toMatch(/CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY/);
    expect(logged).toMatch(/CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY/);
    expect(logged).toMatch(/PQ_POLICY defaults to "require"/);
    expect(logged).toMatch(/keys:root:pq/);
  });

  it("sans PQ_POLICY mais avec des clés PQ valides : démarre, PQ_POLICY résolu à 'require', pqEnabled=true", () => {
    const { publicKey, secretKey } = mlDsaKeygen();
    delete process.env.PQ_POLICY;
    process.env.CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY = Buffer.from(publicKey).toString("base64");
    process.env.CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY = Buffer.from(secretKey).toString("base64");

    const { env } = loadEnv();

    expect(env.PQ_POLICY).toBe("require");
    expect(env.pqEnabled).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("PQ_POLICY=off explicite (opt-out assumé) : ne touche jamais aux clés racine PQ ; pqEnabled=false", () => {
    process.env.PQ_POLICY = "off";
    delete process.env.CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY;
    delete process.env.CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY;

    const { env } = loadEnv();

    expect(env.PQ_POLICY).toBe("off");
    expect(env.pqEnabled).toBe(false);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe("env.ts — PQ_POLICY=dual-sign / require avec des clés valides", () => {
  it("charge normalement et pqEnabled=true quand les clés ML-DSA-65 sont valides", () => {
    const { publicKey, secretKey } = mlDsaKeygen();
    process.env.PQ_POLICY = "dual-sign";
    process.env.CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY = Buffer.from(publicKey).toString("base64");
    process.env.CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY = Buffer.from(secretKey).toString("base64");

    const { env } = loadEnv();

    expect(env.PQ_POLICY).toBe("dual-sign");
    expect(env.pqEnabled).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("'require' avec des clés valides charge tout autant (la policy ne change pas la forme requise)", () => {
    const { publicKey, secretKey } = mlDsaKeygen();
    process.env.PQ_POLICY = "require";
    process.env.CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY = Buffer.from(publicKey).toString("base64");
    process.env.CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY = Buffer.from(secretKey).toString("base64");

    const { env } = loadEnv();

    expect(env.PQ_POLICY).toBe("require");
    expect(env.pqEnabled).toBe(true);
  });
});

describe("env.ts — PQ_POLICY≠off fail-fast (v2.md §V4-1, superRefine)", () => {
  it("dual-sign SANS aucune clé PQ : process.exit(1) + message explicite", () => {
    process.env.PQ_POLICY = "dual-sign";
    delete process.env.CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY;
    delete process.env.CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY;

    expect(() => loadEnv()).toThrow(/process\.exit\(1\)/);
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toMatch(/CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY/);
    expect(logged).toMatch(/CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY/);
  });

  it("require avec une clé publique de mauvaise longueur : process.exit(1)", () => {
    const { secretKey } = mlDsaKeygen();
    process.env.PQ_POLICY = "require";
    process.env.CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY = Buffer.from(secretKey).toString("base64");
    // Deliberately too short — not a real ML-DSA-65 public key (1952 bytes).
    process.env.CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY = Buffer.from("not-a-real-pq-public-key").toString(
      "base64",
    );

    expect(() => loadEnv()).toThrow(/process\.exit\(1\)/);
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toMatch(/CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY/);
  });

  it("dual-sign avec une clé privée vide (chaîne vide) : process.exit(1)", () => {
    const { publicKey } = mlDsaKeygen();
    process.env.PQ_POLICY = "dual-sign";
    process.env.CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY = Buffer.from(publicKey).toString("base64");
    process.env.CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY = "";

    expect(() => loadEnv()).toThrow(/process\.exit\(1\)/);
  });
});

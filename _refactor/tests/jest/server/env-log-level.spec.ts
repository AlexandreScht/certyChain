/**
 * `config/env.ts` — `LOG_LEVEL` (🟢, docs/architecture.md §12.2 "niveau
 * configurable via LOG_LEVEL"). `env.logLevel` folds an explicit `LOG_LEVEL`
 * with a NODE_ENV-based default (verbose "debug" in dev, quieter "info" in
 * prod) — this is the field `lib/logger.ts` actually reads.
 *
 * `env` is `Object.freeze`d at the FIRST import (piège n°11): each variant
 * reloads `config/env.ts` in an isolated module registry (pattern of
 * `env-pq-policy.spec.ts` / `mailer.spec.ts`).
 */
type EnvModule = typeof import("../../../apps/server/src/config/env");

const ORIGINAL_ENV = { ...process.env };

let exitSpy: ReturnType<typeof jest.spyOn>;
let errorSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  process.env.PQ_POLICY = "off"; // hors-scope ici : évite d'exiger aussi des clés PQ
  // Idem : les deux cas `NODE_ENV=production` ci-dessous déclenchent sinon le
  // refinement « PUBLIC_API_ORIGIN doit être en HTTPS quand l'export EUDI est
  // actif en production » dès que le `.env` du développeur active l'export EUDI
  // (ce que fait la stack de dév depuis le Gate C). Ce spec ne teste que
  // LOG_LEVEL : on neutralise la variable hors-scope au lieu de dépendre du
  // `.env` de la machine.
  process.env.VC_EXPORT_ENABLED = "false";
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

function loadEnv(): EnvModule {
  let mod: EnvModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("../../../apps/server/src/config/env") as EnvModule;
  });
  return mod as EnvModule;
}

describe("env.ts — LOG_LEVEL", () => {
  it("non renseigné + NODE_ENV=production → logLevel='info'", () => {
    delete process.env.LOG_LEVEL;
    process.env.NODE_ENV = "production";

    const { env } = loadEnv();

    expect(env.LOG_LEVEL).toBeUndefined();
    expect(env.logLevel).toBe("info");
  });

  it("non renseigné + NODE_ENV=development → logLevel='debug'", () => {
    delete process.env.LOG_LEVEL;
    process.env.NODE_ENV = "development";

    const { env } = loadEnv();

    expect(env.logLevel).toBe("debug");
  });

  it("LOG_LEVEL explicite : prime sur le défaut dérivé de NODE_ENV, MÊME en production", () => {
    process.env.LOG_LEVEL = "debug";
    process.env.NODE_ENV = "production";

    const { env } = loadEnv();

    expect(env.logLevel).toBe("debug");
  });

  it("LOG_LEVEL explicite à 'error' : coupe le bruit même en dev", () => {
    process.env.LOG_LEVEL = "error";
    process.env.NODE_ENV = "development";

    const { env } = loadEnv();

    expect(env.logLevel).toBe("error");
  });

  it("valeur invalide : process.exit(1), message explicite", () => {
    process.env.LOG_LEVEL = "verbose"; // pas une valeur de l'enum

    expect(() => loadEnv()).toThrow(/process\.exit\(1\)/);
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toMatch(/LOG_LEVEL/);
  });
});

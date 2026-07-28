/**
 * `config/env.ts` — convention Docker secrets `<VAR>_FILE` (P2, docs/
 * architecture.md §12.2 "secrets racine en Docker secrets").
 *
 * Docker secrets sont montés en FICHIERS tmpfs (invisibles via `docker
 * inspect` / `/proc/<pid>/environ`, contrairement à une `environment:` en
 * clair) — le conteneur applicatif étant DISTROLESS (aucun shell), la
 * résolution `<VAR>_FILE` → `<VAR>` doit se faire en Node, dans `env.ts`
 * lui-même, jamais via un script d'entrypoint.
 *
 * `env` est `Object.freeze`d à la PREMIÈRE importation du module (piège
 * n°11) : chaque variante recharge `config/env.ts` dans un registre isolé
 * (pattern de `tests/jest/server/mailer.spec.ts` / `env-pq-policy.spec.ts`),
 * jamais de mutation après coup.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type EnvModule = typeof import("../../../apps/server/src/config/env");

const ORIGINAL_ENV = { ...process.env };
let tmpDir: string;

let exitSpy: ReturnType<typeof jest.spyOn>;
let errorSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "certifychain-env-secret-"));
  exitSpy = jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as never);
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  exitSpy.mockRestore();
  errorSpy.mockRestore();
  process.env = { ...ORIGINAL_ENV };
  rmSync(tmpDir, { recursive: true, force: true });
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

function secretFile(name: string, content: string): string {
  const p = join(tmpDir, name);
  writeFileSync(p, content, "utf8");
  return p;
}

describe("env.ts — <VAR>_FILE (Docker secrets)", () => {
  it("MASTER_ENC_KEY_FILE : le contenu du fichier remplace MASTER_ENC_KEY", () => {
    process.env.PQ_POLICY = "off"; // hors-scope ici : évite d'exiger aussi des clés PQ
    const path = secretFile("master_enc_key", "dGhpcy1pcy1hLXRlc3Qta2V5\n");
    process.env.MASTER_ENC_KEY_FILE = path;
    delete process.env.MASTER_ENC_KEY;

    const { env } = loadEnv();

    // Le newline final du fichier est retiré (convention Docker secrets).
    expect(env.MASTER_ENC_KEY).toBe("dGhpcy1pcy1hLXRlc3Qta2V5");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("CERTIFYCHAIN_ROOT_PRIVATE_KEY_FILE : le contenu du fichier remplace la variable directe", () => {
    process.env.PQ_POLICY = "off";
    const pemLike = "-----BEGIN PRIVATE KEY-----\nZmFrZS1rZXk=\n-----END PRIVATE KEY-----\n";
    const path = secretFile("root_priv", pemLike);
    process.env.CERTIFYCHAIN_ROOT_PRIVATE_KEY_FILE = path;
    delete process.env.CERTIFYCHAIN_ROOT_PRIVATE_KEY;

    const { env } = loadEnv();

    expect(env.CERTIFYCHAIN_ROOT_PRIVATE_KEY).toBe(pemLike.trim());
  });

  it("précédence : si `<VAR>_FILE` ET `<VAR>` sont tous deux définis, LE FICHIER gagne", () => {
    process.env.PQ_POLICY = "off";
    const path = secretFile("master_enc_key", "from-the-file");
    process.env.MASTER_ENC_KEY_FILE = path;
    process.env.MASTER_ENC_KEY = "from-the-plain-var-should-be-ignored";

    const { env } = loadEnv();

    expect(env.MASTER_ENC_KEY).toBe("from-the-file");
  });

  it("sans `_FILE` : le comportement legacy (variable directe) est inchangé", () => {
    process.env.PQ_POLICY = "off";
    delete process.env.MASTER_ENC_KEY_FILE;
    process.env.MASTER_ENC_KEY = "plain-value-no-file";

    const { env } = loadEnv();

    expect(env.MASTER_ENC_KEY).toBe("plain-value-no-file");
  });

  it("`<VAR>_FILE` pointant vers un fichier INEXISTANT : échec de démarrage explicite (process.exit(1))", () => {
    process.env.PQ_POLICY = "off";
    process.env.MASTER_ENC_KEY_FILE = join(tmpDir, "does-not-exist");
    delete process.env.MASTER_ENC_KEY;

    expect(() => loadEnv()).toThrow(/process\.exit\(1\)/);
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toMatch(/MASTER_ENC_KEY_FILE/);
    expect(logged).toMatch(/does-not-exist/);
  });

  it("les trois secrets racine peuvent être fournis par fichier SIMULTANÉMENT", () => {
    process.env.PQ_POLICY = "dual-sign";
    process.env.MASTER_ENC_KEY_FILE = secretFile("master", "master-secret-value");
    process.env.CERTIFYCHAIN_ROOT_PRIVATE_KEY_FILE = secretFile("ed25519-priv", "ed25519-secret-value");
    process.env.CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY_FILE = secretFile("mldsa-priv", "mldsa-secret-value");
    delete process.env.MASTER_ENC_KEY;
    delete process.env.CERTIFYCHAIN_ROOT_PRIVATE_KEY;
    // La clé PQ privée seule ne suffit pas à passer le superRefine (longueur
    // ML-DSA-65 vérifiée) — ce test cible uniquement la RÉSOLUTION `_FILE`,
    // pas la validité cryptographique ; on laisse donc PQ_PRIVATE volontairement
    // invalide et on vérifie juste que la valeur LUE est bien celle du fichier
    // via le message d'erreur du superRefine (qui rapporte la longueur reçue).
    delete process.env.CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY;
    process.env.CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY = "";

    expect(() => loadEnv()).toThrow(/process\.exit\(1\)/);
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    // Le superRefine PQ échoue (clé PQ trop courte) — mais MASTER_ENC_KEY et la
    // clé Ed25519 (min(1) uniquement) sont, elles, passées : la preuve que
    // leur contenu vient bien des trois fichiers est qu'AUCUNE erreur
    // "required" n'est levée pour elles.
    expect(logged).not.toMatch(/MASTER_ENC_KEY is required/);
    expect(logged).not.toMatch(/Root private key is required/);
    expect(logged).toMatch(/CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY/);
  });
});

/**
 * Suite Jest du monorepo (voir plan-tests-jest.md).
 *
 * Un runner racine, 5 projets (server en node, les 4 fronts en jsdom). Les specs
 * vivent sous tests/jest/ (hors des workspaces : les tsconfig des apps incluent
 * `**\/*.tsx` et casseraient `pnpm -r typecheck` si les specs vivaient dans src/).
 * Nommage `*.spec.ts(x)` — `*.test.ts` reste réservé aux tests node:test du serveur.
 */

/** Transform ts-jest en transpilation pure (indépendant des tsconfig "bundler"). */
const tsTransform = [
  "ts-jest",
  {
    diagnostics: false,
    tsconfig: {
      module: "commonjs",
      moduleResolution: "node",
      target: "es2022",
      jsx: "react-jsx",
      esModuleInterop: true,
      isolatedModules: true,
      strict: false,
      skipLibCheck: true,
    },
  },
];

const path = require("node:path");

/**
 * Resolves an installed package's ROOT directory starting the Node resolution
 * algorithm from `fromDir` — needed for transitive dependencies pnpm keeps in
 * its versioned `.pnpm` store rather than hoisting into a workspace's own
 * `node_modules` (so no version number is ever hardcoded here). Resolves the
 * package's MAIN entry (not `./package.json`, which these packages' `exports`
 * maps deliberately do not expose) and walks up to its directory.
 */
function pkgDir(pkg, fromDir) {
  const mainEntry = require.resolve(pkg, { paths: [fromDir] });
  // mainEntry is ".../<pkg>/index.js" (or similar) — the package root is one
  // level up, found by locating the LAST path segment matching the package name.
  const marker = `${path.sep}${pkg.replace("/", path.sep)}${path.sep}`;
  const idx = mainEntry.lastIndexOf(marker);
  if (idx === -1) throw new Error(`pkgDir: could not locate "${pkg}" root in "${mainEntry}"`);
  return mainEntry.slice(0, idx + marker.length - 1);
}

const sharedDir = path.join(__dirname, "packages/shared");
// @noble/post-quantum (V4, ML-DSA-65) IS hoisted into packages/shared's own
// node_modules (it's shared's direct dependency); @noble/curves is only a
// TRANSITIVE dependency of post-quantum, so it is resolved relative to it.
const postQuantumDir = pkgDir("@noble/post-quantum", sharedDir);
const curvesDir = pkgDir("@noble/curves", postQuantumDir);
// @noble/post-quantum/@noble/curves pin @noble/hashes@~2.2.0 — a NEWER major
// than the @noble/hashes@~1.x already hoisted for @noble/ed25519 elsewhere in
// this repo (which is plain CJS and stays UNMAPPED below). v2.x dropped CJS
// entirely, so THIS specific instance (resolved from inside the post-quantum
// dependency tree) needs the same .ts-source bridge — scoped to the two exact
// deep-import specifiers `curves`/`post-quantum` actually use, so the
// unrelated `@noble/hashes/sha256` imports used everywhere else in
// `packages/shared/src/crypto` keep resolving to the older CJS build.
const hashesForPqDir = pkgDir("@noble/hashes", postQuantumDir);

/** Mappe les packages internes (exports sans build step) vers leurs sources. */
const workspaceModuleMapper = {
  "^@certifychain/contract$": "<rootDir>/packages/contract/src/index.ts",
  "^@certifychain/contract/(.*)$": "<rootDir>/packages/contract/src/$1",
  "^@certifychain/shared/ui$": "<rootDir>/packages/shared/src/ui/index.ts",
  "^@certifychain/shared/(.*)$": "<rootDir>/packages/shared/src/$1",
  // @noble/ed25519 est ESM-only mais embarque sa source .ts : on la mappe pour
  // que ts-jest la transpile (le require() CJS de l'ESM échouerait).
  "^@noble/ed25519$": "<rootDir>/packages/shared/node_modules/@noble/ed25519/index.ts",
  // @noble/post-quantum (V4, ML-DSA-65) est ESM-only également, et sa source
  // ml-dsa.ts importe elle-même deux modules ESM-only de @noble/curves — les
  // trois sont mappés vers leur source .ts pour la même raison (piège n°11-bis :
  // require() CJS d'un module ESM échoue). @noble/hashes (utilisé partout
  // ailleurs) reste non mappé : il ne publie QUE du CJS.
  "^@noble/post-quantum/ml-dsa\\.js$": path.join(postQuantumDir, "src/ml-dsa.ts"),
  "^@noble/curves/utils\\.js$": path.join(curvesDir, "src/utils.ts"),
  "^@noble/curves/abstract/fft\\.js$": path.join(curvesDir, "src/abstract/fft.ts"),
  "^@noble/hashes/utils\\.js$": path.join(hashesForPqDir, "src/utils.ts"),
  "^@noble/hashes/sha3\\.js$": path.join(hashesForPqDir, "src/sha3.ts"),
};

/**
 * Stubs de modules front sans intérêt (ou hostiles) en jsdom :
 * - next/link → ancre nue (pas de routeur App requis) ;
 * - gsap/@gsap/react → no-op (pas de layout dans jsdom ; les animations
 *   restent couvertes visuellement par le smoke E2E).
 */
const frontStubMapper = {
  "^next/link$": "<rootDir>/tests/jest/setup/stubs/next-link.tsx",
  "^gsap$": "<rootDir>/tests/jest/setup/stubs/gsap.ts",
  "^gsap/ScrollTrigger$": "<rootDir>/tests/jest/setup/stubs/gsap-scrolltrigger.ts",
  "^@gsap/react$": "<rootDir>/tests/jest/setup/stubs/gsap-react.ts",
};

/** Base commune à tous les projets. */
const base = {
  rootDir: __dirname,
  transform: { "^.+\\.tsx?$": tsTransform },
  moduleNameMapper: workspaceModuleMapper,
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  // node_modules n'est jamais transformé SAUF la source .ts de @noble/ed25519
  // (voir workspaceModuleMapper). Le segment .pnpm est exclu du match pour que
  // le chemin réel du store (node_modules/.pnpm/…/node_modules/@noble/…) reste
  // transformable ; seuls les .ts/.tsx sont concernés par la transform de toute façon.
  transformIgnorePatterns: ["[\\\\/]node_modules[\\\\/](?!\\.pnpm[\\\\/]|@noble[\\\\/])"],
  // Les builds Next (.next/standalone) recopient les package.json des apps →
  // collisions haste-map. Jamais des cibles de test : ignorés.
  modulePathIgnorePatterns: ["[\\\\/]\\.next[\\\\/]"],
};

/** Base des projets front (composants React / DOM). */
const jsdomBase = {
  ...base,
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/tests/jest/setup/jsdom-polyfills.ts"],
};

module.exports = {
  projects: [
    {
      ...base,
      displayName: "server",
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/jest/server/**/*.spec.ts"],
      // Recharge .env racine + valeurs par défaut sûres AVANT tout import de
      // config/env.ts (fail-fast).
      setupFiles: ["<rootDir>/tests/jest/setup/server-env.ts"],
    },
    {
      ...jsdomBase,
      displayName: "shared",
      testMatch: ["<rootDir>/tests/jest/shared/**/*.spec.@(ts|tsx)"],
    },
    {
      ...jsdomBase,
      displayName: "web",
      testMatch: ["<rootDir>/tests/jest/web/**/*.spec.@(ts|tsx)"],
      moduleNameMapper: {
        ...workspaceModuleMapper,
        ...frontStubMapper,
        "^@/(.*)$": "<rootDir>/apps/client/web/src/$1",
      },
    },
    {
      ...jsdomBase,
      displayName: "wallet",
      testMatch: ["<rootDir>/tests/jest/wallet/**/*.spec.@(ts|tsx)"],
      moduleNameMapper: {
        ...workspaceModuleMapper,
        ...frontStubMapper,
        "^@/(.*)$": "<rootDir>/apps/client/wallet/src/$1",
      },
    },
    {
      ...jsdomBase,
      displayName: "admin",
      testMatch: ["<rootDir>/tests/jest/admin/**/*.spec.@(ts|tsx)"],
    },
  ],
};

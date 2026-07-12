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

/** Mappe les packages internes (exports sans build step) vers leurs sources. */
const workspaceModuleMapper = {
  "^@certifychain/contract$": "<rootDir>/packages/contract/src/index.ts",
  "^@certifychain/contract/(.*)$": "<rootDir>/packages/contract/src/$1",
  "^@certifychain/shared/ui$": "<rootDir>/packages/shared/src/ui/index.ts",
  "^@certifychain/shared/(.*)$": "<rootDir>/packages/shared/src/$1",
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

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Backend, admin & wallet apps are separate packages with their own
    // lint/build; the root web lint config does not apply to them.
    "server/**",
    "admin/**",
    "wallet/**",
    "**/dist/**",
  ]),
  {
    rules: {
      // Advisory React-Compiler rule (React docs: "not recommended", not a bug).
      // The flagged init-on-mount / data-fetch effects are intentional — kept as
      // a hint rather than a hard error (revisit list in PLAN.md).
      "react-hooks/set-state-in-effect": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
]);

export default eslintConfig;

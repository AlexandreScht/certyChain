import { defineConfig } from "tsup";

// Bundles the whole API (pure-JS deps) into a single self-contained CJS file.
// → the runtime image needs only `dist/server.cjs` + the `drizzle/` SQL folder.
export default defineConfig({
  entry: { server: "src/server.ts" },
  format: ["cjs"],
  target: "node22",
  platform: "node",
  bundle: true,
  minify: true,
  clean: true,
  sourcemap: false,
  treeshake: true,
  noExternal: [/.*/], // bundle ALL deps into the single CJS file
  outExtension: () => ({ js: ".cjs" }),
});

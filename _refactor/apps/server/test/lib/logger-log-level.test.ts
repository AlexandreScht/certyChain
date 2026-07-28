/**
 * `lib/logger.ts` — `LOG_LEVEL` (🟢, docs/architecture.md §12.2 "niveau
 * configurable via LOG_LEVEL").
 *
 * `env` (and therefore the logger's `MIN` threshold, computed once at import
 * time) is `Object.freeze`d at the FIRST import of `config/env.ts` (piège
 * n°11, v2.md §6): to exercise a NON-default `LOG_LEVEL`, this file sets
 * `process.env.LOG_LEVEL` BEFORE any import — node:test runs each file in
 * its own child process, so this stays scoped to this file alone (pattern of
 * `net-trust-proxy.test.ts` / `pq-emission.test.ts`).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.LOG_LEVEL = "warn";

const { logger } = await import("../../src/lib/logger");
const { env } = await import("../../src/config/env");

describe("logger — LOG_LEVEL=warn (surchargé, différent du défaut dev 'debug')", () => {
  it("précondition : env.logLevel est bien 'warn' dans CE processus", () => {
    assert.equal(env.logLevel, "warn");
  });

  it("debug/info sont SUPPRIMÉS, warn/error sont ÉMIS", async (t) => {
    const lines: string[] = [];
    const record = (chunk: unknown) => {
      lines.push(String(chunk));
      return true;
    };
    t.mock.method(process.stdout, "write", record);
    t.mock.method(process.stderr, "write", record);

    logger.debug("should.not.appear");
    logger.info("should.not.appear.either");
    logger.warn("should.appear");
    logger.error("should.appear.too");

    const parsed = lines.map((l) => JSON.parse(l) as { msg: string });
    assert.deepEqual(
      parsed.map((p) => p.msg),
      ["should.appear", "should.appear.too"],
    );
  });
});

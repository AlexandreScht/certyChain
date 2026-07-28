/**
 * Outbound token-bucket integration (audit 2026-07-28) — `lib/insee.ts#
 * lookupSiret` and `lib/gemini.ts#evaluateSchoolLegitimacy` each carry a
 * module-scoped bucket (`config/constants.ts#OUTBOUND_RATE_LIMIT`), created
 * once at module load. The real `.env` used elsewhere in this repo has NO
 * `INSEE_API_KEY` / `GEMINI_API_KEY` configured (both integrations already
 * degrade cleanly without one) — which means the key-presence guard always
 * short-circuits BEFORE the bucket in `apps/server/test/lib/*.test.ts`
 * (node:test, real `.env`, `env` frozen at first import — piège n°11). To
 * actually exercise a CONFIGURED bucket, this suite reloads both modules
 * (and transitively `config/env.ts`) in an isolated registry with a fake key
 * set, same pattern as `tests/jest/server/mailer.spec.ts` /
 * `env-root-keys-csv.spec.ts`.
 *
 * `fetch` is mocked so no real network call ever happens; both buckets
 * refill slowly enough (2/s and 1/s) that a burst of capacity+1 calls
 * completing in milliseconds cannot accumulate a full extra token.
 */
import { OUTBOUND_RATE_LIMIT } from "../../../apps/server/src/config/constants";

type InseeModule = typeof import("../../../apps/server/src/lib/insee");
type GeminiModule = typeof import("../../../apps/server/src/lib/gemini");

const ORIGINAL_ENV = { ...process.env };
const originalFetch = globalThis.fetch;

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = originalFetch;
});

function loadInsee(): InseeModule {
  process.env.INSEE_API_KEY = "jest-fake-insee-key";
  let mod: InseeModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("../../../apps/server/src/lib/insee") as InseeModule;
  });
  return mod as InseeModule;
}

function loadGemini(): GeminiModule {
  process.env.GEMINI_API_KEY = "jest-fake-gemini-key";
  let mod: GeminiModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("../../../apps/server/src/lib/gemini") as GeminiModule;
  });
  return mod as GeminiModule;
}

describe("lib/insee.ts — outbound token bucket", () => {
  it("degrades to null once exhausted — never throws, never touches fetch for the throttled attempt", async () => {
    let fetchCalls = 0;
    globalThis.fetch = jest.fn(async () => {
      fetchCalls += 1;
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const { lookupSiret } = loadInsee();
    const capacity = OUTBOUND_RATE_LIMIT.INSEE.capacity;
    const siret = "12345678901234";

    for (let i = 0; i < capacity; i += 1) {
      const result = await lookupSiret(siret);
      expect(result).toEqual({ found: false, active: false, legalName: null, nafCode: null, address: null, siret });
    }
    expect(fetchCalls).toBe(capacity);

    const throttled = await lookupSiret(siret);
    expect(throttled).toBeNull();
    expect(fetchCalls).toBe(capacity); // unchanged: fetch was never called
  });
});

describe("lib/gemini.ts — outbound token bucket", () => {
  it("degrades to null once exhausted — never throws, never touches fetch for the throttled attempt", async () => {
    let fetchCalls = 0;
    const validBody = JSON.stringify({ score: 80, summary: "ok", flags: [] });
    globalThis.fetch = jest.fn(async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: validBody }] } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const { evaluateSchoolLegitimacy } = loadGemini();
    const capacity = OUTBOUND_RATE_LIMIT.GEMINI.capacity;

    for (let i = 0; i < capacity; i += 1) {
      const result = await evaluateSchoolLegitimacy({ name: "École Test", contactEmail: "contact@ecole-test.fr" });
      expect(result).not.toBeNull();
    }
    expect(fetchCalls).toBe(capacity);

    const throttled = await evaluateSchoolLegitimacy({ name: "École Test", contactEmail: "contact@ecole-test.fr" });
    expect(throttled).toBeNull();
    expect(fetchCalls).toBe(capacity); // unchanged: fetch was never called
  });
});

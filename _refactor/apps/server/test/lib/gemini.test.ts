import assert from "node:assert/strict";
import { test } from "node:test";
import { parseResult } from "../../src/lib/gemini";

test("gemini.parseResult: valid JSON → sanitized result", () => {
  const r = parseResult('{"score":80,"summary":"Cohérent","flags":["domaine générique"]}', "gemini-2.0-flash");
  assert.deepEqual(r, {
    score: 80,
    summary: "Cohérent",
    flags: ["domaine générique"],
    model: "gemini-2.0-flash",
  });
});

test("gemini.parseResult: clamps score to 0–100", () => {
  assert.equal(parseResult('{"score":150,"summary":"","flags":[]}', "m")?.score, 100);
  assert.equal(parseResult('{"score":-5,"summary":"","flags":[]}', "m")?.score, 0);
  assert.equal(parseResult('{"score":83.6,"summary":"","flags":[]}', "m")?.score, 84);
});

test("gemini.parseResult: invalid JSON → null", () => {
  assert.equal(parseResult("not json at all", "m"), null);
});

test("gemini.parseResult: non-numeric score → null", () => {
  assert.equal(parseResult('{"score":"abc","summary":"x","flags":[]}', "m"), null);
});

test("gemini.parseResult: tolerates missing/garbage flags & summary", () => {
  const r = parseResult('{"score":50}', "m");
  assert.equal(r?.score, 50);
  assert.deepEqual(r?.flags, []);
  assert.equal(r?.summary, "");
});

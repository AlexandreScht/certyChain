import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tokenizeCsv } from "../../src/lib/csv";

describe("shared CSV tokenizer", () => {
  it("handles quoted commas, escaped quotes and CRLF", () => {
    assert.deepEqual(tokenizeCsv('a,b\r\n"x,y","z""q"'), [
      ["a", "b"],
      ["x,y", 'z"q'],
    ]);
  });

  it("rejects malformed quoting for every CSV importer", () => {
    assert.throws(() => tokenizeCsv('a,"unterminated'));
    assert.throws(() => tokenizeCsv('a,pre"quote'));
  });
});

/**
 * Unit tests for the pure disclosure mechanic (RFC 9901 salt → disclosure →
 * digest) shared by the native ed25519-sd-v2 protocol (V1) and the EUDI SD-JWT
 * export (F2). No DB, no I/O.
 * Run: pnpm --filter @certifychain/server test
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  decodeBase64Url,
  digestOf,
  makeDisclosure,
  makeSalt,
  parseDisclosure,
} from "../../src/crypto/disclosures";

describe("makeDisclosure / makeSalt", () => {
  it("encodes base64url(JSON.stringify([salt, name, value]))", () => {
    const d = makeDisclosure("mention", "Très Bien", "AAAAAAAAAAAAAAAAAAAAAA");
    const decoded = JSON.parse(Buffer.from(d, "base64url").toString("utf8"));
    assert.deepEqual(decoded, ["AAAAAAAAAAAAAAAAAAAAAA", "mention", "Très Bien"]);
    // Frozen vector: the exact chain must never drift (signed digests depend on it).
    assert.equal(d, "WyJBQUFBQUFBQUFBQUFBQUFBQUFBQUFBIiwibWVudGlvbiIsIlRyw6hzIEJpZW4iXQ");
  });

  it("mints a distinct, 16-byte base64url salt on every call", () => {
    const salts = new Set(Array.from({ length: 200 }, () => makeSalt()));
    assert.equal(salts.size, 200);
    for (const s of salts) {
      assert.match(s, /^[A-Za-z0-9_-]+$/);
      assert.equal(Buffer.from(s, "base64url").byteLength, 16);
    }
    // Two disclosures of the same (name, value) differ — the salt makes them so.
    assert.notEqual(makeDisclosure("mention", "AB"), makeDisclosure("mention", "AB"));
  });

  it("carries null values verbatim (never drops a null field)", () => {
    const [, name, value] = parseDisclosure(makeDisclosure("rncp", null));
    assert.equal(name, "rncp");
    assert.equal(value, null);
  });
});

describe("digestOf — RFC 9901 §4.2.4", () => {
  it("matches the frozen vector (stability across refactors)", () => {
    const d = "WyJBQUFBQUFBQUFBQUFBQUFBQUFBQUFBIiwibWVudGlvbiIsIlRyw6hzIEJpZW4iXQ";
    assert.equal(digestOf(d), "8JVDjf8R5pczGcE5qyBoX8lWV13q6p-Pqwy11qZub60");
  });

  it("hashes the base64url CHAIN, not the decoded JSON", () => {
    const d = makeDisclosure("mention", "Très Bien", "AAAAAAAAAAAAAAAAAAAAAA");
    const overChain = createHash("sha256").update(d, "ascii").digest("base64url");
    const overJson = createHash("sha256")
      .update(Buffer.from(d, "base64url"))
      .digest("base64url");
    assert.equal(digestOf(d), overChain);
    assert.notEqual(digestOf(d), overJson);
  });

  it("is deterministic for the same chain, distinct across salts", () => {
    const d = makeDisclosure("holderName", "Alex");
    assert.equal(digestOf(d), digestOf(d));
    assert.notEqual(digestOf(d), digestOf(makeDisclosure("holderName", "Alex")));
  });
});

describe("parseDisclosure — round-trip and malformed shapes", () => {
  it("round-trips [salt, name, value] for strings and null", () => {
    for (const value of ["Master Data Science", null, "RNCP34031"]) {
      const salt = makeSalt();
      const d = makeDisclosure("programTitle", value, salt);
      assert.deepEqual(parseDisclosure(d), [salt, "programTitle", value]);
    }
  });

  it("rejects non-base64url, padded and non-canonical encodings", () => {
    assert.throws(() => parseDisclosure("not base64url!!"), TypeError);
    assert.throws(() => parseDisclosure("YWJjZA=="), TypeError); // padded
    assert.throws(() => parseDisclosure("A"), TypeError); // impossible length (4n+1)
  });

  it("rejects invalid JSON and invalid UTF-8", () => {
    const notJson = Buffer.from("ceci n'est pas du json", "utf8").toString("base64url");
    assert.throws(() => parseDisclosure(notJson), /valid JSON/);
    const badUtf8 = Buffer.from([0xff, 0xfe, 0xfd]).toString("base64url");
    assert.throws(() => parseDisclosure(badUtf8), TypeError);
  });

  it("rejects wrong arities and non-string salt/name", () => {
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v), "utf8").toString("base64url");
    assert.throws(() => parseDisclosure(enc({ salt: "x" })), /three-element/);
    assert.throws(() => parseDisclosure(enc(["salt", "name"])), /three-element/);
    assert.throws(() => parseDisclosure(enc(["s", "n", "v", "extra"])), /three-element/);
    assert.throws(() => parseDisclosure(enc([42, "name", "v"])), /salt must be a string/);
    assert.throws(() => parseDisclosure(enc(["salt", 42, "v"])), /name must be a string/);
  });
});

describe("decodeBase64Url", () => {
  it("decodes canonical unpadded base64url and round-trips", () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 255]);
    assert.deepEqual(decodeBase64Url(bytes.toString("base64url"), "x"), bytes);
  });

  it("rejects '=' padding and non-canonical trailing bits", () => {
    assert.throws(() => decodeBase64Url("YQ==", "x"), TypeError);
    // "ab" decodes then re-encodes differently when the trailing bits are dirty.
    assert.throws(() => decodeBase64Url("ab", "x"), TypeError);
  });
});

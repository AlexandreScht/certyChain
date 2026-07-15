import { createHash, randomBytes } from "node:crypto";

/**
 * Salted per-field disclosures — the single, pure implementation of the
 * SD-JWT / RFC 9901 "salt → disclosure → digest" mechanic, shared by BOTH
 * consumers of that primitive (v2.md §0.4):
 *   • the native protocol (`ed25519-sd-v2`, Ed25519, issuer = the school), and
 *   • the EUDI export (`modules/vc/sd-jwt.ts`, ES256, issuer = the platform).
 *
 * This module is deliberately zero-I/O and domain-agnostic: no claim whitelist,
 * no signature, no envelope. Layer those on top. What legitimately differs
 * between the two consumers (signature algo, wire envelope, issuer identity) is
 * NOT factored here.
 */

/** A disclosure = base64url(JSON.stringify([salt, name, value])) — RFC 9901 §4.2. */
export type Disclosure = string;

/** RFC 9901 recommends ≥ 128 bits of salt. */
const SALT_BYTES = 16;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

/** Fresh random salt (16 octets, base64url). */
export function makeSalt(): string {
  return randomBytes(SALT_BYTES).toString("base64url");
}

/**
 * Build a disclosure = base64url(JSON.stringify([salt, name, value])).
 * A fresh 16-octet salt is minted per call unless one is supplied (callers that
 * must track salt-uniqueness across a set — e.g. the SD-JWT builder — pass it in).
 */
export function makeDisclosure(name: string, value: unknown, salt: string = makeSalt()): Disclosure {
  return Buffer.from(JSON.stringify([salt, name, value]), "utf8").toString("base64url");
}

/**
 * digest = base64url( SHA-256( <the ASCII characters of the disclosure string> ) ).
 * ⚠️ We hash the base64url CHAIN itself, not the decoded JSON (RFC 9901 §4.2.4).
 */
export function digestOf(d: Disclosure): string {
  return createHash("sha256").update(d, "ascii").digest("base64url");
}

/**
 * Canonical, unpadded base64url decode. Rejects padding and non-canonical
 * encodings (anti-malleability) so a re-encoded byte string is stable.
 */
export function decodeBase64Url(value: string, field: string): Buffer {
  if (!BASE64URL_PATTERN.test(value) || value.includes("=") || value.length % 4 === 1) {
    throw new TypeError(`${field} must be unpadded base64url`);
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new TypeError(`${field} must use canonical base64url encoding`);
  }
  return decoded;
}

/**
 * Decode a disclosure → [salt, name, value]. Throws (TypeError) on any malformed
 * shape: non-canonical base64url, invalid UTF-8/JSON, not a 3-element array, or a
 * non-string salt/name. The value stays `unknown` (may legitimately be `null`).
 */
export function parseDisclosure(d: Disclosure): [string, string, unknown] {
  const raw = decodeBase64Url(d, "Disclosure");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    throw new TypeError("Disclosure must contain valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) {
    throw new TypeError("Disclosure must be a three-element array");
  }
  const [salt, name, value] = parsed as [unknown, unknown, unknown];
  if (typeof salt !== "string") throw new TypeError("Disclosure salt must be a string");
  if (typeof name !== "string") throw new TypeError("Disclosure name must be a string");
  return [salt, name, value];
}

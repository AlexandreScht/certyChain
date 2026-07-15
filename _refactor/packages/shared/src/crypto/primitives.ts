import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

/**
 * Shared low-level crypto primitives — encodings, canonical JSON, disclosure
 * parsing and Ed25519 verification — used by every verifier in this package
 * (`verify-bundle.ts`, `verify-transparency.ts`). Extracted verbatim from
 * `verify-bundle.ts` (V3 refactor) with zero behavioural change.
 *
 * Pure and framework/serverless-free by contract (CLAUDE.md §3): NO `node:*`,
 * hono or drizzle imports — everything runs unchanged in a browser and in Node.
 */

// The @noble sync path is 100% pure-JS: wire its SHA-512 from @noble/hashes so it
// never depends on WebCrypto (some browsers expose subtle without Ed25519).
ed.etc.sha512Sync = (...m: Uint8Array[]): Uint8Array => sha512(ed.etc.concatBytes(...m));

/* ── Encoding helpers (browser + Node; no Buffer, no DOM-only types) ──────── */

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64urlToBytes(s: string): Uint8Array {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  return b64ToBytes(b64);
}

export function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i] as number);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function asciiToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

export function utf8ToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Strict lowercase hex: even length, [0-9a-f] only — anything else throws. */
const HEX_PATTERN = /^(?:[0-9a-f]{2})*$/;

export function hexToBytes(hex: string): Uint8Array {
  if (!HEX_PATTERN.test(hex)) throw new Error("invalid hex string");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += (bytes[i] as number).toString(16).padStart(2, "0");
  }
  return out;
}

/** SPKI PEM → raw 32-byte Ed25519 public key (last 32 octets of the DER). */
export function pemToRawEd25519(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const der = b64ToBytes(b64);
  return der.slice(der.length - 32);
}

/** Deterministic canonical JSON — MUST match server `crypto/hashing.ts`. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}
export function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Decode a disclosure → [salt, name, value]; throws on any malformed shape. */
export function parseDisclosureTriple(d: string): [string, string, unknown] {
  const json = new TextDecoder("utf-8", { fatal: true }).decode(b64urlToBytes(d));
  const arr = JSON.parse(json) as unknown;
  if (!Array.isArray(arr) || arr.length !== 3) throw new Error("malformed disclosure");
  const [salt, name, value] = arr as [unknown, unknown, unknown];
  if (typeof salt !== "string" || typeof name !== "string") throw new Error("malformed disclosure");
  return [salt, name, value];
}

/* ── Ed25519 verification: WebCrypto fast path, @noble pure-JS fallback ────── */

interface SubtleLike {
  importKey(
    format: "raw",
    keyData: Uint8Array,
    algorithm: { name: string },
    extractable: boolean,
    keyUsages: string[],
  ): Promise<unknown>;
  verify(
    algorithm: { name: string },
    key: unknown,
    signature: Uint8Array,
    data: Uint8Array,
  ): Promise<boolean>;
}

function getSubtle(): SubtleLike | null {
  const cryptoObj = (globalThis as { crypto?: { subtle?: unknown } }).crypto;
  const subtle = cryptoObj && typeof cryptoObj === "object" ? cryptoObj.subtle : undefined;
  return subtle ? (subtle as SubtleLike) : null;
}

function nobleVerify(pub: Uint8Array, msg: Uint8Array, sig: Uint8Array): boolean {
  try {
    // zip215:false → RFC8032 semantics, matching node:crypto / WebCrypto.
    return ed.verify(sig, msg, pub, { zip215: false });
  } catch {
    return false;
  }
}

export async function verifyEd25519(
  pub: Uint8Array,
  msg: Uint8Array,
  sig: Uint8Array,
  forceNoble: boolean,
): Promise<boolean> {
  if (!forceNoble) {
    const subtle = getSubtle();
    if (subtle) {
      try {
        const key = await subtle.importKey("raw", pub, { name: "Ed25519" }, false, ["verify"]);
        return await subtle.verify({ name: "Ed25519" }, key, sig, msg);
      } catch {
        // WebCrypto without Ed25519 support → fall through to the pure-JS path.
      }
    }
  }
  return nobleVerify(pub, msg, sig);
}

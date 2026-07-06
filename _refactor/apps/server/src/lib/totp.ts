import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { MFA } from "../config/constants";

/**
 * RFC 6238 TOTP (time-based one-time password) — zero-dependency, node:crypto only.
 * SHA-1, 30-second step, 6 digits (the defaults every authenticator app expects).
 * Used for second-factor auth on school & platform-admin accounts.
 */

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A fresh 160-bit base32 secret to store (envelope-encrypted) and enroll. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (bin % 10 ** MFA.TOTP_DIGITS).toString().padStart(MFA.TOTP_DIGITS, "0");
}

/** Current TOTP code for a secret (mainly for tests/seed demo). */
export function generateTotp(secretB32: string, atMs: number = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / MFA.TOTP_STEP_SECONDS);
  return hotp(base32Decode(secretB32), counter);
}

/** Constant-time verify of a 6-digit code against a secret, with ± drift window. */
export function verifyTotp(code: string, secretB32: string, atMs: number = Date.now()): boolean {
  const clean = code.trim();
  if (!new RegExp(`^\\d{${MFA.TOTP_DIGITS}}$`).test(clean)) return false;
  const secret = base32Decode(secretB32);
  const counter = Math.floor(atMs / 1000 / MFA.TOTP_STEP_SECONDS);
  const presented = Buffer.from(clean);
  for (let w = -MFA.TOTP_WINDOW; w <= MFA.TOTP_WINDOW; w += 1) {
    const candidate = Buffer.from(hotp(secret, counter + w));
    if (candidate.length === presented.length && timingSafeEqual(candidate, presented)) {
      return true;
    }
  }
  return false;
}

/** otpauth:// URI for QR enrollment in an authenticator app. */
export function totpAuthUri(accountEmail: string, secretB32: string): string {
  const label = encodeURIComponent(`${MFA.ISSUER}:${accountEmail}`);
  const params = new URLSearchParams({
    secret: secretB32,
    issuer: MFA.ISSUER,
    algorithm: "SHA1",
    digits: String(MFA.TOTP_DIGITS),
    period: String(MFA.TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

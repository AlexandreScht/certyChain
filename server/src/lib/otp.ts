import { createHmac, timingSafeEqual } from "node:crypto";
import { OTP } from "../config/constants";
import { env } from "../config/env";
import { numericCode } from "./ids";

export function generateOtp(): string {
  return numericCode(OTP.LENGTH);
}

/** HMAC-SHA256 with the server pepper — the plaintext code is never stored. */
export function hashOtp(code: string): string {
  return createHmac("sha256", env.OTP_PEPPER).update(code).digest("hex");
}

export function verifyOtp(code: string, hash: string): boolean {
  const a = Buffer.from(hashOtp(code));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

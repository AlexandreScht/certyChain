import { randomBytes, randomInt, randomUUID } from "node:crypto";

export const uuid = (): string => randomUUID();

/** URL-safe random token (base64url). */
export const urlToken = (bytes = 24): string => randomBytes(bytes).toString("base64url");

/** Cryptographically-random numeric string (unbiased). */
export function numericCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += randomInt(0, 10).toString();
  return out;
}

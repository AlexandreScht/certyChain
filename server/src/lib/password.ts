import { randomBytes, scrypt, type ScryptOptions, timingSafeEqual } from "node:crypto";
import { SCRYPT } from "../config/constants";

/**
 * Password hashing with node:crypto scrypt — zero native dependencies
 * (bundles cleanly into the distroless image). Format is self-describing so
 * parameters can evolve without breaking existing hashes.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT.saltLen);
  const dk = (await scryptAsync(password, salt, SCRYPT.keyLen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  })) as Buffer;
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${dk.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  const [scheme, n, r, p, saltB, dkB] = parts;
  if (scheme !== "scrypt" || !n || !r || !p || !saltB || !dkB) return false;
  const salt = Buffer.from(saltB, "base64");
  const expected = Buffer.from(dkB, "base64");
  const dk = (await scryptAsync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  })) as Buffer;
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}

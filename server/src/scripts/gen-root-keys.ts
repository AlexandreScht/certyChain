/**
 * Generates a fresh set of secrets for `.env`.
 * Standalone (no env import) so it runs before the env is configured.
 *
 *   pnpm --filter @certifychain/server keys:root
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const b64 = (s: string | Buffer): string => Buffer.from(s).toString("base64");

/* eslint-disable no-console */
console.log("# ── CertifyChain secrets — copy into .env ──────────────────────");
console.log(`CERTIFYCHAIN_ROOT_PUBLIC_KEY=${b64(publicKey)}`);
console.log(`CERTIFYCHAIN_ROOT_PRIVATE_KEY=${b64(privateKey)}`);
console.log(`MASTER_ENC_KEY=${randomBytes(32).toString("base64")}`);
console.log(`OTP_PEPPER=${randomBytes(32).toString("base64")}`);
console.log(`JWT_ACCESS_SECRET=${randomBytes(48).toString("base64")}`);
console.log(`JWT_REFRESH_SECRET=${randomBytes(48).toString("base64")}`);

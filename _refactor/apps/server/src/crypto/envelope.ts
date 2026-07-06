import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env";

/**
 * Envelope encryption for secrets at rest (school private keys, holder secrets).
 * AES-256-GCM (authenticated). `KeyVault` is the seam to swap in AWS KMS /
 * HashiCorp Vault later without touching callers.
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const KEY_LEN = 32;

function loadMasterKey(): Buffer {
  const key = Buffer.from(env.MASTER_ENC_KEY, "base64");
  if (key.length !== KEY_LEN) {
    throw new Error(
      `MASTER_ENC_KEY must decode to ${KEY_LEN} bytes (got ${key.length}). ` +
        `Generate via: openssl rand -base64 32`,
    );
  }
  return key;
}

export interface KeyVault {
  encrypt(plaintext: string | Buffer): string;
  decrypt(payload: string): Buffer;
  decryptToString(payload: string): string;
}

class EnvelopeKeyVault implements KeyVault {
  readonly #key: Buffer = loadMasterKey();

  encrypt(plaintext: string | Buffer): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.#key, iv);
    const data = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, "utf8");
    const ct = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      "v1",
      iv.toString("base64url"),
      tag.toString("base64url"),
      ct.toString("base64url"),
    ].join(".");
  }

  decrypt(payload: string): Buffer {
    const parts = payload.split(".");
    const [v, ivB, tagB, ctB] = parts;
    if (v !== "v1" || !ivB || !tagB || !ctB) throw new Error("Invalid ciphertext format");
    const decipher = createDecipheriv(ALGO, this.#key, Buffer.from(ivB, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ctB, "base64url")), decipher.final()]);
  }

  decryptToString(payload: string): string {
    return this.decrypt(payload).toString("utf8");
  }
}

export const keyVault: KeyVault = new EnvelopeKeyVault();

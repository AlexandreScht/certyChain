/**
 * Bootstrap d'environnement pour le projet Jest « server ».
 *
 * `config/env.ts` valide process.env au premier import et fait `process.exit(1)`
 * en cas de manque — ce setup (setupFiles = avant tout import de spec) recharge
 * donc le `.env` racine s'il existe, puis complète avec des valeurs par défaut
 * sûres pour que la suite tourne aussi sur une machine sans `.env` (CI).
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 1) .env racine (KEY=VALUE, commentaires ignorés) — ne JAMAIS écraser une
//    variable déjà présente dans l'environnement du shell.
try {
  const raw = readFileSync(resolve(__dirname, "../../../.env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
} catch {
  /* pas de .env — les défauts ci-dessous suffisent */
}

// 2) Défauts sûrs pour chaque variable exigée par EnvSchema.
const defaults: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://test:test@127.0.0.1:5432/certifychain_test",
  JWT_ACCESS_SECRET: "jest-access-secret-0123456789abcdef0123456789",
  JWT_REFRESH_SECRET: "jest-refresh-secret-0123456789abcdef012345678",
  MASTER_ENC_KEY: randomBytes(32).toString("base64"),
  OTP_PEPPER: "jest-otp-pepper-0123456789",
};
for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value;
}

// 3) Paire de clés racine Ed25519 (PEM → base64) si absente — permet de tester
//    l'émission/vérification de certificats sans dépendre du .env local.
if (!process.env.CERTIFYCHAIN_ROOT_PRIVATE_KEY || !process.env.CERTIFYCHAIN_ROOT_PUBLIC_KEY) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  process.env.CERTIFYCHAIN_ROOT_PRIVATE_KEY = Buffer.from(privateKey).toString("base64");
  process.env.CERTIFYCHAIN_ROOT_PUBLIC_KEY = Buffer.from(publicKey).toString("base64");
}

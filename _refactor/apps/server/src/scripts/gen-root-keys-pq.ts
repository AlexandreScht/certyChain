/**
 * Generates a fresh ML-DSA-65 (FIPS 204) key pair for the CertifyChain PKI
 * root's post-quantum signature (v2.md §V4-1) — on the exact model of
 * `gen-root-keys.ts`. Standalone (no env import) so it runs before the env is
 * configured.
 *
 *   pnpm --filter @certifychain/server keys:root:pq
 */
import { mlDsaKeygen } from "@certifychain/shared/crypto/ml-dsa";

const { publicKey, secretKey } = mlDsaKeygen();

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

/* eslint-disable no-console */
console.log("# ── CertifyChain post-quantum root secrets — copy into .env ────");
console.log(`CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY=${b64(publicKey)}`);
console.log(`CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY=${b64(secretKey)}`);

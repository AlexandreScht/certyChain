/**
 * Provisions the platform P-256 key used to sign SD-JWT VCs.
 *
 *   pnpm --filter @certifychain/server keys:vc
 *   pnpm --filter @certifychain/server keys:vc -- --rotate
 */
import { sqlClient } from "../db/client";
import { provisionVcIssuerKey } from "../modules/vc/issuer-keys";

/* eslint-disable no-console */

const args = process.argv.slice(2);
const rotate = args.includes("--rotate");
const unknownArgs = args.filter((arg) => arg !== "--rotate");

async function main(): Promise<void> {
  if (unknownArgs.length > 0) {
    throw new Error(`Argument inconnu : ${unknownArgs.join(", ")}`);
  }

  const result = await provisionVcIssuerKey({ rotate });
  // Never print the private JWK or its encrypted envelope.
  console.log(`${rotate ? "Clé VC tournée" : "Clé VC créée"} : ${result.kid} (${result.id})`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await sqlClient.end({ timeout: 5 });
  });

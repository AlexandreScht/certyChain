/**
 * Smoke-test the Gemini school-validation path end-to-end (real API call).
 * Verifies the API key, model, network and JSON-mode parsing — without the DB.
 *
 *   pnpm --filter @certifychain/server test:gemini
 */
import { env } from "../config/env";
import { evaluateSchoolLegitimacy } from "../lib/gemini";

/* eslint-disable no-console */

/** Local SIRET sanity (14 digits + Luhn) — inlined to keep this script DB-free. */
function siretLuhnValid(siret: string | null): boolean {
  if (!siret || !/^\d{14}$/.test(siret)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    let d = siret.charCodeAt(13 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
const SAMPLES = [
  {
    label: "École plausible",
    name: "Université Claude Bernard Lyon 1",
    siret: "19691774400019",
    contactEmail: "contact@univ-lyon1.fr",
    adminEmail: "scolarite@univ-lyon1.fr",
  },
  {
    label: "Suspecte",
    name: "zzz diplômes express",
    siret: "00000000000000",
    contactEmail: "vendeur123@gmail.com",
    adminEmail: "vendeur123@gmail.com",
  },
];

async function main(): Promise<void> {
  if (!env.GEMINI_API_KEY) {
    console.error(
      "\n✖ GEMINI_API_KEY est vide dans .env → la validation se dégrade en revue manuelle (score null).\n" +
        "  Renseigne GEMINI_API_KEY puis relance.\n",
    );
    process.exit(1);
  }
  console.log(`\nModèle : ${env.GEMINI_MODEL}\n`);

  for (const s of SAMPLES) {
    const result = await evaluateSchoolLegitimacy({
      name: s.name,
      siret: s.siret,
      contactEmail: s.contactEmail,
      adminEmail: s.adminEmail,
      siretLuhnValid: siretLuhnValid(s.siret),
    });
    if (!result) {
      console.log(`• ${s.label} (${s.name}) → null (échec API/clé/parse — voir logs ci-dessus)`);
    } else {
      console.log(`• ${s.label} (${s.name}) → score ${result.score}/100`);
      console.log(`    ${result.summary}`);
      if (result.flags.length) console.log(`    drapeaux : ${result.flags.join(", ")}`);
    }
  }
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

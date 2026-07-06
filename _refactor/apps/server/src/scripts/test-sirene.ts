/**
 * Smoke-test the SIRENE (INSEE) lookup + the Gemini cross-check, end to end.
 *
 *   pnpm --filter @certifychain/server test:sirene -- <SIRET14> ["Nom déclaré"] ["Ville déclarée"]
 */
import { env } from "../config/env";
import { verifySchoolAgainstSirene } from "../lib/gemini";
import { lookupSiret } from "../lib/insee";

/* eslint-disable no-console */
async function main(): Promise<void> {
  const siret = process.argv[2];
  const declaredName = process.argv[3] ?? "(nom déclaré non fourni)";
  const declaredCity = process.argv[4] ?? null;

  if (!siret) {
    console.error('Usage : pnpm --filter @certifychain/server test:sirene -- <SIRET14> ["Nom déclaré"]');
    process.exit(1);
  }
  if (!env.inseeConfigured) {
    console.error("\n✖ INSEE_API_KEY est vide dans .env → la vérification SIRENE est désactivée (repli IA/manuel).\n");
    process.exit(1);
  }

  console.log(`\nSIRENE lookup ${siret} (base ${env.INSEE_API_BASE}) …\n`);
  const r = await lookupSiret(siret);
  if (r === null) {
    console.log("→ null (clé/réseau/erreur — voir logs ci-dessus, ou format SIRET invalide)");
    process.exit(0);
  }
  console.log(
    `→ found=${r.found} active=${r.active} legalName="${r.legalName ?? ""}" naf=${r.nafCode ?? "?"} city="${r.address?.city ?? ""}"`,
  );

  if (r.found && r.active) {
    console.log(`\nVérification croisée IA (déclaré « ${declaredName} »${declaredCity ? ` / ${declaredCity}` : ""} vs officiel) …`);
    const cross = await verifySchoolAgainstSirene({
      declaredName,
      officialName: r.legalName,
      nafCode: r.nafCode,
      active: true,
      declaredCity,
      officialCity: r.address?.city ?? null,
      officialPostalCode: r.address?.postalCode ?? null,
    });
    if (!cross) console.log("→ IA indisponible (GEMINI_API_KEY absente ou erreur).");
    else {
      console.log(`→ score ${cross.score}/100 · nameMatch=${cross.nameMatch} · cityMatch=${cross.cityMatch}`);
      console.log(`   ${cross.summary}`);
    }
  }
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

# features.md — Spécifications d'implémentation prêtes à exécuter

> **Pour la session Claude qui implémente** : ce fichier est ton plan complet. Lis d'abord
> [`CLAUDE.md`](./CLAUDE.md) (règles du projet) et [`PLAN.md`](./PLAN.md) (état), puis ce fichier
> **en entier** avant la première ligne de code. Implémente **une feature à la fois**, étape par
> étape, dans l'ordre des numéros, et exécute le **gate de vérification** indiqué à la fin de
> chaque étape avant de passer à la suivante. Ne saute **jamais** une « Étape 0 » (récupération
> des référentiels officiels). Tiens `PLAN.md` à jour en continu (CLAUDE.md §10) et journalise
> dans le vault Obsidian (CLAUDE.md §9).
>
> Deux features indépendantes (aucune dépendance entre elles) :
> - **F1 — Accrochage CDC** : génération/suivi des fichiers XML réglementaires vers la Caisse des
>   Dépôts (Passeport de compétences). Valeur : conformité légale automatisée pour les écoles.
> - **F2 — Export EUDI Wallet (eIDAS 2.0)** : émission de diplômes au format **SD-JWT VC** via
>   **OpenID4VCI**, exportables vers les portefeuilles d'identité européens. Valeur : interop
>   standards ouverts, anti-enfermement propriétaire.
>
> Ordre recommandé : **F1 puis F2** (F1 est plus proche du code existant ; F2 introduit des
> protocoles nouveaux). Chaque feature se termine par un état commitable et vérifié Docker.

---

## 0. Socle commun — règles non négociables (rappel + spécifiques à ces features)

### 0.1 Règles cardinales du repo (résumé exécutable)

1. **RPC typé Hono** : toute nouvelle route est écrite en **chaîné**
   (`new Hono<AppEnv>().get(...).post(...)`), middlewares intercalés **dans** la chaîne,
   déclarations (`const x = …`) hissées **au-dessus** de la chaîne. Jamais d'annotation de type
   de retour sur `createApp()` ni sur un handler (`Promise<Response>` détruit l'inférence).
   Le validateur est TOUJOURS `zValidator` de `apps/server/src/lib/validator.ts` (casté
   `as typeof honoZValidator` — ne pas toucher). Enregistrer le nouveau routeur dans
   `apps/server/src/app.ts` via `.route("/prefix", router)` dans la chaîne existante.
   La sonde `apps/server/src/rpc.type-test.ts` doit continuer à compiler.
2. **Contrat d'abord** : chaque type qui traverse le réseau vit dans `packages/contract/src/`
   (`dto.ts` pour les réponses, `schemas.ts` pour les inputs Zod, `enums.ts` pour les unions,
   `errors.ts` intouché). Côté client, chaque appel passe par `endpoints.ts` avec **retour
   annoté DTO** (voir en tête de `apps/client/web/src/lib/api/endpoints.ts` pour le pattern).
3. **Config serveur** : toute nouvelle variable passe par `apps/server/src/config/env.ts`
   (schéma Zod fail-fast, dérivés dans le `Object.freeze` final). **Jamais `process.env.X`**
   en code produit. Ajouter aussi la variable à `.env.example` (+ compose si non sensible).
4. **Erreurs API** : côté serveur uniquement les helpers `fail.*` de
   `apps/server/src/lib/http-error.ts` (ouvre ce fichier et utilise les noms EXISTANTS — ne
   pas inventer). Exception documentée : les endpoints OAuth publics de F2 (voir F2-6.3).
5. **DB** : migrations SQL **manuscrites** dans `apps/server/drizzle/` (numérotation continue :
   la prochaine est `0011_…`), + mise à jour miroir de `apps/server/src/db/schema.ts`
   (style Drizzle identique aux tables voisines). **Jamais `pnpm db:generate`.**
6. **Sécurité transverse** : scoping multi-tenant systématique (toute requête école filtre par
   le `schoolId` de la session — JAMAIS un id fourni par le client), `requireAuth("school_admin")`
   / `requireAuth("student")` / `requireAdminAuth` selon le realm (voir usages dans
   `diplomas.routes.ts`, `wallet.routes.ts`, `admin.routes.ts`), rate-limits par compte ciblé
   (middleware `rate-limit.ts`), audit via `recordAudit()` (`modules/audit/audit.service.ts`),
   redaction PII via `apps/server/src/lib/mask.ts` (à ÉTENDRE, voir chaque feature).
7. **Docker distroless** : AUCUNE dépendance avec build natif (node-gyp) sans mise à jour
   explicite des Dockerfiles. Les libs prescrites ici sont pur-JS — si une alternative te
   tente, vérifie ce critère d'abord.
8. **UI** : Server Components par défaut, `"use client"` seulement si nécessaire ; réutiliser
   `packages/shared/src/ui` (Button, Card, Modal, Toast, Field, Input, Select, Spinner, Stat…)
   et les classes du design system (CLAUDE.md §8). Pas de nouveau composant si un existant suffit.
9. **Version de `hono`** : ne pas la bumper, ne pas ajouter de paquet `@hono/*` supplémentaire.

### 0.2 Toolchain Windows (obligatoire, sinon rien ne marche)

```powershell
# PowerShell UNIQUEMENT (jamais Git Bash : corepack y échoue AVEC exit 0)
$env:PATH = "$env:APPDATA\fnm\node-versions\v24.16.0\installation;" + $env:PATH
# Toujours épingler pnpm : `corepack pnpm` nu résout v11 qui refuse packageManager 9.12.0.
# Les scripts RACINE db:seed/smoke ré-invoquent pnpm nu → les CONTOURNER (formes directes) :
corepack pnpm@9.12.0 install
corepack pnpm@9.12.0 -r typecheck
corepack pnpm@9.12.0 -r lint
corepack pnpm@9.12.0 --filter @certifychain/server test        # node:test (68 avant features)
corepack pnpm@9.12.0 test:jest                                  # Jest racine (278 avant features)
corepack pnpm@9.12.0 --filter @certifychain/server db:migrate
corepack pnpm@9.12.0 --filter @certifychain/server db:seed
corepack pnpm@9.12.0 --filter @certifychain/server smoke        # 44 checks avant features
```

### 0.3 Gate de vérification (à exécuter tel quel)

- **Gate A (après chaque étape serveur)** : `-r typecheck` = 0 erreur · node:test = tous verts.
- **Gate B (après chaque étape front)** : `-r typecheck` + `-r lint` = 0 · `test:jest` = tous verts.
- **Gate C (fin de feature — juge de paix)** :
  ```powershell
  docker compose build                                              # 4/4 images
  docker compose -f docker-compose.yml -f docker-compose-dev.yml up -d
  corepack pnpm@9.12.0 --filter @certifychain/server db:seed
  corepack pnpm@9.12.0 --filter @certifychain/server smoke          # 44 + nouveaux checks, 0 échec
  ```
- À chaque nouveau spec Jest : mettre à jour les tableaux de [`plan-tests-jest.md`](./plan-tests-jest.md).
- Les specs Jest vont sous `tests/jest/**` en `*.spec.ts(x)` ; les tests node:test sous
  `apps/server/test/**` en `*.test.ts` (les deux conventions coexistent, ne pas mélanger).

### 0.4 Tests : qui teste quoi

| Niveau | Outil | Où | Quoi |
|---|---|---|---|
| Unitaire serveur (libs pures) | node:test | `apps/server/test/lib/*.test.ts`, `test/modules/**` | NIR, builder XML (golden), state machines, SD-JWT round-trip, status list |
| Intégration routes | node:test + `app.request()` | `apps/server/test/modules/**` | flux HTTP complets sans réseau (pattern existant : `test/modules/verification/verification.test.ts`) |
| UI | Jest (jsdom) | `tests/jest/web/**`, `tests/jest/wallet/**` | pages/panneaux nouveaux (stubs next/link+gsap déjà mappés) |
| E2E réel | smoke | `apps/server/src/scripts/smoke.ts` | extension du scénario seedé, via Docker |

---

# F1 — Accrochage CDC (Passeport de compétences)

## F1-0. Contexte légal + récupération du kit officiel (ÉTAPE BLOQUANTE)

**Le droit.** L'article **L. 6113-8 du Code du travail** (loi « Avenir professionnel » 2018-771)
oblige les ministères et organismes **certificateurs** à transmettre au SI du Compte Personnel de
Formation (géré par la **Caisse des Dépôts**) les informations relatives aux **titulaires** de
leurs certifications (RNCP **et** Répertoire Spécifique), y compris le **NIR** (numéro de sécurité
sociale). Modalités : décret n° 2019-1490 du 27/12/2019 (en vigueur 01/01/2021) — transmission
sous **3 mois** après la délivrance ; en cas de manquement, mise en demeure du DG de la CDC
(≥ 60 jours) puis signalement à France compétences. C'est ce flux qui alimente le
**Passeport de compétences** de chaque actif. La collecte du NIR à cette fin est explicitement
autorisée (FAQ officielle du portail certificateurs).

**Le flux technique.** Le certificateur dépose des fichiers **XML** conformes au **XSD** et au
**dictionnaire de données** publiés par la CDC, via l'« Espace des certificateurs » (dépôt manuel
au portail, ou flux automatisé pour les gros volumes). La CDC renvoie des **comptes rendus de
traitement** (acceptation/rejet **par enregistrement**, avec codes d'erreur).

**⚠️ Refonte 2026 annoncée** : le portail officiel indique que la modalité de dépôt **évolue en
2026** (XSD, fichiers XML et dictionnaire de données **refondus**). Raison de plus pour l'étape 0.

**Étape 0 — à faire AVANT tout code :**
1. Depuis https://certificateurs.moncompteformation.gouv.fr/ (rubriques « Comment faire ? » et
   « Guides »), télécharger la **version courante** de : XSD, dictionnaire de données, fichiers
   XML d'exemple, guide de construction du fichier XML, guide de résolution des erreurs.
   (Guides historiques 2021/2023 : « Guide général du projet d'accrochage », « Guide
   d'accompagnement construction fichier XML » — vérifier s'ils sont remplacés par le kit 2026.)
2. Commiter ces fichiers dans **`docs/cdc/`** (nouveau dossier) avec un `docs/cdc/README.md`
   notant : version du schéma, date de téléchargement, URL source.
3. En extraire et consigner dans ce même README : la **liste exacte des champs obligatoires**,
   l'**encodage** attendu (UTF-8 vs ISO-8859-1), la **convention de nommage** des fichiers, la
   **taille max** d'un lot, l'existence d'un **environnement de test/préproduction** de dépôt.
4. Ajuster ensuite le canevas §F1-5.3 et le miroir Zod au XSD réel. **Le XSD officiel est la
   source de vérité, pas ce document.**

> Périmètre produit : seuls les diplômes portant un code **RNCP** (`diplomas.rncp` non nul) sont
> concernés. L'UI doit l'expliquer et filtrer. L'activation du module pour une école suppose
> qu'elle soit habilitée côté CDC (démarche administrative hors plateforme) → activation par
> l'**admin plateforme**, pas en self-service.

## F1-1. Décisions d'architecture (fermées — ne pas rouvrir)

| Sujet | Décision | Pourquoi |
|---|---|---|
| Phasage | **Phase A** : collecte identités + génération XML + validation + téléchargement + suivi statuts (dépôt manuel au portail CDC). **Phase B** : ingestion du compte rendu (CRT) uploadé. **Phase C (plus tard, non spécifiée ici)** : dépôt automatisé (SFTP/API selon kit 2026). | Livrer la valeur conformité sans détenir de credentials CDC ; l'automatisation du transport exige convention + secrets → sprint dédié. |
| Stockage du XML généré | **Jamais stocké.** Régénération **déterministe** à chaque téléchargement (tri stable des items + `generatedAt` figé en base réutilisé dans le fichier) ; seul le **SHA-256** du fichier est stocké et vérifié à chaque régénération. | Aucun fichier PII/NIR au repos ; intégrité prouvable. |
| NIR | Fourni par l'**école** (elle le détient légalement), par CSV dédié ou saisie unitaire, **juste-à-temps** avant un export. Chiffré au repos via `keyVault` (AES-256-GCM existant, `apps/server/src/crypto/envelope.ts`). Jamais dans un DTO (seulement un booléen), jamais loggé, **purgé** N jours après acceptation CDC (`CDC_RETENTION_DAYS`, défaut 30). | Minimisation RGPD ; base légale = obligation légale du certificateur (art. 6-1-c RGPD), CertifyChain agit en sous-traitant. |
| Nom/naissance | Le XSD exige nom de naissance / prénoms / date de naissance **séparés** ; `diplomas.holderName` est un champ unique → **ne jamais le parser**. Ces données arrivent avec le NIR dans la table `cdc_identities`. | Fiabilité (un split heuristique produirait des rejets CDC). |
| Validation du XML | Builder déterministe (`fast-xml-parser` XMLBuilder, échappement automatique) + **miroir Zod du XSD** validé avant génération + tests golden. Pas de validation XSD native au runtime (libxml = node-gyp, interdit en distroless). Validation XSD réelle : commande manuelle documentée (§F1-8.4) + dépôt en environnement de test CDC. | Zéro dépendance native ; la conformité finale se prouve chez la CDC. |
| Multi-tenant | Toutes les routes école : `requireAuth("school_admin")` + filtre `schoolId` de session. Activation du module : realm **admin**. | Modèle existant. |
| Concurrence | **Un seul export en statut `generated` à la fois par école** (index unique partiel) ; conflit → `fail.conflict` (vérifier le nom exact dans `http-error.ts`). | Évite les doubles lots et les courses. |

## F1-2. Migration `0011_cdc_accrochage.sql` (+ miroir `db/schema.ts`)

Nouvelles tables (style : voir tables voisines — `uuid` PK `gen_random_uuid()`, timestamps
`with time zone`, FK explicites) :

**`cdc_settings`** — configuration certificateur par école
| Colonne | Type | Contraintes / notes |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK→schools UNIQUE, on delete cascade | 1 ligne max par école |
| enabled | boolean not null default false | activé par l'admin plateforme |
| certificateur_siret | text not null | pré-rempli avec `schools.siret`, éditable (cas certificateur ≠ établissement) |
| contact_email | text | selon exigences du dictionnaire de données (F1-0) |
| created_at / updated_at | timestamptz not null default now() | |

**`cdc_identities`** — complément d'identité par diplôme (données sensibles)
| Colonne | Type | Contraintes / notes |
|---|---|---|
| id | uuid PK | |
| diploma_id | uuid FK→diplomas UNIQUE, on delete cascade | 1 identité max par diplôme |
| school_id | uuid FK→schools not null | dénormalisé pour le scoping direct |
| nir_encrypted | text | enveloppe `keyVault.encrypt()` — NULL après purge |
| birth_last_name | text not null | nom de naissance |
| first_names | text not null | prénoms dans l'ordre de l'état civil |
| birth_date | date not null | |
| source | text not null | `'csv'` \| `'form'` |
| purge_after | timestamptz | fixé à l'acceptation CDC (+ rétention) |
| purged_at | timestamptz | la ligne reste (traçabilité), les champs sensibles sont vidés |
| created_at | timestamptz | |

À la purge : `nir_encrypted = NULL`, `birth_last_name = ''`, `first_names = ''` (garder
`birth_date` est inutile → la mettre à `'1900-01-01'` n'est pas propre ; préférer rendre les 3
colonnes d'état civil NULLABLES et les vider — choisis cette option et reflète-la ci-dessus).

**`cdc_exports`** — lots
| Colonne | Type | Contraintes / notes |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK→schools not null | |
| status | enum `cdc_export_status` | `'generated','submitted','accepted','partially_rejected','rejected','cancelled'` |
| file_name | text not null | selon convention CDC (F1-0) |
| file_sha256 | text not null | hex du fichier généré |
| generated_at | timestamptz not null | **réutilisé** à la régénération (déterminisme) |
| submitted_at / resolved_at | timestamptz | |
| created_at | timestamptz | |
| *(index)* | | `UNIQUE (school_id) WHERE status = 'generated'` |

**`cdc_export_items`** — diplômes d'un lot
| Colonne | Type | Contraintes / notes |
|---|---|---|
| id | uuid PK | |
| export_id | uuid FK→cdc_exports on delete cascade | |
| diploma_id | uuid FK→diplomas | |
| status | enum `cdc_item_status` | `'pending','accepted','rejected'` |
| reject_code / reject_reason | text | renseignés par le CRT (Phase B) |
| *(index)* | | `UNIQUE (export_id, diploma_id)` ; `UNIQUE (diploma_id) WHERE status <> 'rejected'` (un diplôme n'est « en vol »/accepté qu'une fois ; re-soumission possible après rejet — l'unicité partielle l'autorise car l'ancien item passe `rejected`) |

⚠️ L'index partiel `UNIQUE (diploma_id) WHERE status <> 'rejected'` interdit un diplôme dans
deux lots vivants, mais un lot `cancelled` doit libérer ses diplômes → à l'annulation d'un
export, **supprimer ses items** (pas seulement changer le statut du lot).

**Audit** : étendre l'enum existant (`audit_type`) :
```sql
ALTER TYPE "audit_type" ADD VALUE IF NOT EXISTS 'cdc_export_generated';
ALTER TYPE "audit_type" ADD VALUE IF NOT EXISTS 'cdc_export_submitted';
ALTER TYPE "audit_type" ADD VALUE IF NOT EXISTS 'cdc_crt_ingested';
ALTER TYPE "audit_type" ADD VALUE IF NOT EXISTS 'cdc_identity_purged';
```
⚠️ Piège PostgreSQL : une valeur d'enum ajoutée ne peut pas être **utilisée** dans la même
transaction. La migration ne fait qu'AJOUTER les valeurs (aucun INSERT les utilisant) → OK.
Miroir `schema.ts` : ajouter les valeurs au `pgEnum("audit_type", […])` existant (l. ~55).

Gate A après migration : `db:migrate` sur la stack dev Docker + typecheck.

## F1-3. Contrat (`packages/contract/src`)

- `enums.ts` : `export const CDC_EXPORT_STATUSES = ["generated","submitted","accepted","partially_rejected","rejected","cancelled"] as const;` + type ; idem `CDC_ITEM_STATUSES`.
- `schemas.ts` (inputs Zod — suivre le style des schémas existants) :
  - `UpdateCdcSettingsInput` : `{ certificateurSiret: z.string().regex(/^\d{14}$/), contactEmail: z.string().email().optional() }`
  - `CreateCdcExportInput` : `{ diplomaIds: z.array(z.string().uuid()).min(1).max(500) }`
  - `CdcCrtUploadInput` (Phase B) : contenu texte du CRT (voir F1-7).
  - `CdcIdentityFormInput` : `{ diplomaId: uuid, nir: z.string(), birthLastName: z.string().min(1).max(120), firstNames: z.string().min(1).max(200), birthDate: z.string().date() }` — la validation FORTE du NIR (clé) vit côté serveur dans `nir.ts`, le schéma ne fait que borner (`min(13).max(20)` avant normalisation).
- `dto.ts` (réponses — le NIR n'y figure JAMAIS) :
  - `CdcSettingsDTO { enabled, certificateurSiret, contactEmail | null }`
  - `CdcEligibleDiplomaDTO { id, holderName, programTitle, rncp, issuedAt, identityComplete: boolean, inFlight: boolean }`
  - `CdcExportDTO { id, status, fileName, fileSha256, generatedAt, submittedAt | null, counts: { total, accepted, rejected, pending } }`
  - `CdcExportItemDTO { diplomaId, holderName, programTitle, status, rejectCode | null, rejectReason | null }`
  - `CdcIdentityImportResultDTO { imported: number, errors: Array<{ line: number, message: string }> }` (même esprit que `ImportResultDTO` de l'import CSV diplômes)

## F1-4. Serveur — lib `nir.ts` (pure, testée à fond)

Créer `apps/server/src/modules/accrochage/nir.ts` :

- `normalizeNir(raw: string): string` — supprime espaces/points/tirets, uppercase.
- `validateNir(nir: string): { ok: true } | { ok: false, reason: string }` :
  1. Format : 15 caractères, `^[12]\d{2}(0[1-9]|1[0-2]|[2-9]\d)(\d{2}|2A|2B)\d{6}\d{2}$` —
     rester **permissif** sur les cas légitimes (mois « exotiques » 20/30–42/50–99 des NIR
     attribués à l'étranger, sexe 7/8 provisoire) : n'imposer strictement que la longueur,
     l'alphabet (`[0-9AB]`) et la **clé**. Mieux : longueur + alphabet + clé seulement, et un
     simple *warning* applicatif sur le reste.
  2. **Clé de contrôle** : soit `n` le nombre formé des 13 premiers caractères où `2A`→`19` et
     `2B`→`18` ; clé attendue = `97 - (n % 97)` (utiliser **BigInt** : 13 chiffres > 2^32),
     comparer aux 2 derniers chiffres.
- ⚠️ **Jamais de NIR réel** dans le code, les tests ou les fixtures. Générer des NIR de test :
  12 chiffres arbitraires + 13ᵉ, clé calculée par la même formule (test de propriété), plus
  quelques vecteurs `2A`/`2B` construits à la main.

Tests : `apps/server/test/modules/accrochage/nir.test.ts` (node:test) — clé valide/invalide,
normalisation, 2A/2B, propriété « mutation d'un chiffre ⇒ rejet » (boucle sur les 13 positions).

**Redaction** : ouvrir `apps/server/src/lib/mask.ts` et ajouter les clés sensibles de F1
(`nir`, `birthLastName`, `firstNames`, `birthDate`) au mécanisme existant + un test dans
`apps/server/test/lib/mask.test.ts`.

## F1-5. Serveur — module `accrochage`

Fichiers : `apps/server/src/modules/accrochage/{accrochage.routes.ts, accrochage.service.ts, xml-builder.ts, nir.ts, crt-parser.ts (Phase B)}`.

### F1-5.1 Env & constantes
- `env.ts` : `CDC_RETENTION_DAYS: z.coerce.number().int().positive().default(30)`.
- `config/constants.ts` : `CDC: { MAX_BATCH: 500, CSV_MAX_BYTES: 2 * 1024 * 1024 }` + entrée
  `RATE_LIMIT.CDC_GENERATE` (ex. 10/heure par école) calquée sur les entrées existantes.
- `.env.example` : documenter `CDC_RETENTION_DAYS`.

### F1-5.2 Routes (chaînées, realm école sauf mention)

```ts
// accrochage.routes.ts — SQUELETTE (signatures et middlewares, pas l'implémentation)
export const accrochageRoutes = new Hono<AppEnv>()
  .get("/settings", requireAuth("school_admin"), /* CdcSettingsDTO */)
  .put("/settings", requireAuth("school_admin"), zValidator("json", UpdateCdcSettingsInput), /* … */)
  .get("/eligible", requireAuth("school_admin"), /* CdcEligibleDiplomaDTO[] : diplômes actifs,
        rncp non nul, PAS déjà dans un item status<>'rejected' ; identityComplete calculé */)
  .post("/identities", requireAuth("school_admin"), zValidator("json", CdcIdentityFormInput), /* saisie unitaire */)
  .post("/identities/import", requireAuth("school_admin"), /* CSV brut, bodyLimit dédié 2 MB
        (même pattern que l'import CSV de diplomas.routes.ts), erreurs PAR LIGNE */)
  .delete("/identities/:diplomaId", requireAuth("school_admin"), /* correction avant export */)
  .post("/exports", requireAuth("school_admin"), rateLimit(/* CDC_GENERATE */),
        zValidator("json", CreateCdcExportInput), /* génère lot + hash, voir 5.4 */)
  .get("/exports", requireAuth("school_admin"), /* liste paginée */)
  .get("/exports/:id", requireAuth("school_admin"), /* détail + items */)
  .get("/exports/:id/file", requireAuth("school_admin"), /* régénère le XML, vérifie le sha256
        stocké, renvoie Content-Type: application/xml + Content-Disposition: attachment */)
  .post("/exports/:id/submitted", requireAuth("school_admin"), /* generated → submitted */)
  .post("/exports/:id/crt", requireAuth("school_admin"), /* Phase B : upload CRT → statuts items */)
  .post("/exports/:id/cancel", requireAuth("school_admin"), /* generated → cancelled + DELETE items */);
```
Enregistrer dans `app.ts` : `.route("/cdc", accrochageRoutes)` (dans la chaîne, avant `.onError`).

**Activation admin** : dans `admin.routes.ts` (chaîné, `requireAdminAuth`), ajouter
`POST /admin/schools/:id/cdc` `{ enabled: boolean }` → upsert `cdc_settings.enabled`
(+ `recordAudit`). Côté école, TOUTES les routes ci-dessus (sauf `GET /settings`) répondent
`fail.forbidden` (nom exact à vérifier) si `enabled = false`.

### F1-5.3 Génération XML (`xml-builder.ts`)

- Lib : `corepack pnpm@9.12.0 --filter @certifychain/server add fast-xml-parser` (pur JS).
  Utiliser **exclusivement** `XMLBuilder` (échappement automatique) — l'interpolation de
  chaînes dans du XML est INTERDITE (injection).
- Entrée du builder : un objet **déjà validé** par un miroir Zod du XSD (`CdcBatchSchema`
  interne au module — chaque champ avec les longueurs/formats du dictionnaire de données).
- Déterminisme : items triés par `diploma_id` ASC ; date de génération = `generated_at` stocké ;
  encodage et nommage = ceux du kit officiel (F1-0).
- **Canevas illustratif** (structure du guide 2021 — à ALIGNER sur le XSD téléchargé en F1-0,
  qui est refondu en 2026 ; ne pas coder ce canevas les yeux fermés) :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<flux>                                   <!-- nom/attributs racine : voir XSD -->
  <certificateur>
    <siret>{cdc_settings.certificateur_siret}</siret>
  </certificateur>
  <passages>
    <passage>                            <!-- 1 par diplôme -->
      <titulaire>
        <nir>{déchiffré juste-à-temps}</nir>
        <nomNaissance>{cdc_identities.birth_last_name}</nomNaissance>
        <prenoms>{cdc_identities.first_names}</prenoms>
        <dateNaissance>{cdc_identities.birth_date}</dateNaissance>
      </titulaire>
      <certification><codeRncp>{diplomas.rncp}</codeRncp></certification>
      <obtention>
        <dateObtention>{diplomas.issued_at}</dateObtention>
        <mention>{diplomas.mention?}</mention>
      </obtention>
    </passage>
  </passages>
</flux>
```

- Mapping (à compléter en F1-0 avec les champs additionnels exigés par le dictionnaire —
  ex. n° de session, voie d'accès, code diplôme interne… ; s'il manque une donnée dans le
  modèle CertifyChain, l'ajouter à `cdc_identities` ou `cdc_settings`, PAS à `diplomas`).

### F1-5.4 Service — cycle de vie

1. `POST /exports` : vérifier `enabled` ; charger les diplômes demandés **de l'école de la
   session** ; refuser (`fail.validation`, erreurs par diplôme) si : rncp nul, statut ≠ active,
   identité manquante, déjà « en vol ». Créer `cdc_exports` (+ items `pending`) dans **une
   transaction** ; générer le XML une première fois pour calculer `file_sha256` + `file_name` ;
   `recordAudit({ type: "cdc_export_generated", schoolId, metadata: { exportId, count } })`.
   Le XML n'est PAS persisté ; les NIR sont déchiffrés en mémoire le temps de la génération.
2. `GET /exports/:id/file` : régénérer ; si le sha256 diffère de celui stocké (identité modifiée
   entre-temps) → `fail.conflict` avec message explicite (« régénérez un nouveau lot ») —
   c'est le garde-fou d'intégrité, ne pas le « réparer » en écrasant le hash.
3. `submitted` : l'école a déposé le fichier sur l'espace CDC → statut + `submitted_at` + audit.
4. Phase B (`crt`) : parser le compte rendu officiel (`crt-parser.ts`, format défini par le kit
   F1-0), mettre à jour chaque item (`accepted`/`rejected` + codes), statut du lot =
   `accepted` / `partially_rejected` / `rejected` + `resolved_at` ; pour chaque item accepté :
   `cdc_identities.purge_after = now() + CDC_RETENTION_DAYS jours` ; audit `cdc_crt_ingested`.
5. **Purge** : étendre `apps/server/src/lib/cleanup.ts › purgeExpired()` — vider les champs
   sensibles de `cdc_identities` où `purge_after < now()` et `purged_at` nul, poser `purged_at`,
   logger un compte (jamais les valeurs), audit `cdc_identity_purged` (metadata : count).

### F1-5.5 CSV identités (`/identities/import`)

Colonnes : `diploma_id` OU `external_id` (au moins un) ; `nir` ; `nom_naissance` ; `prenoms` ;
`date_naissance` (ISO `YYYY-MM-DD`). Réutiliser la mécanique de parsing/erreurs-par-ligne de
l'import CSV diplômes (`diplomas.routes.ts` + service) : en-têtes VALIDÉS (constat d'audit S3 —
ne pas régresser), `noUncheckedIndexedAccess` oblige à traiter `row[i]` possiblement undefined.
Chaque ligne : résoudre le diplôme (par id, sinon `external_id`) **dans l'école de la session**,
`normalizeNir` + `validateNir`, upsert `cdc_identities` (chiffrement `keyVault.encrypt(nir)`).
Ne JAMAIS renvoyer le NIR dans la réponse (uniquement compteurs + erreurs).

## F1-6. Front école (`apps/client/web`)

1. **Page** `apps/client/web/src/app/(school)/ecole/accrochage/page.tsx` (`"use client"`,
   même squelette que `parametres/page.tsx`) avec 4 blocs :
   - **État/config** : activé ou non (si non : carte explicative « contactez CertifyChain » +
     lien vers le portail CDC), SIRET certificateur éditable.
   - **Préparation** : tableau des diplômes éligibles (`GET /cdc/eligible`) avec badge
     « identité complète / manquante », upload CSV identités (+ modèle CSV téléchargeable
     généré côté client), saisie unitaire en modale (`Modal` + `Field`/`Input` shared) — le
     champ NIR est `type="password"` avec toggle œil, jamais persisté côté client
     (pas de localStorage/sessionStorage).
   - **Génération** : sélection multiple → bouton « Générer le fichier d'accrochage » →
     téléchargement + instructions de dépôt pas-à-pas (lien espace certificateurs).
   - **Historique** : lots avec statut, compteurs, actions (télécharger, marquer déposé,
     importer le compte rendu [Phase B], annuler).
2. **Nav** : ajouter l'entrée dans `apps/client/web/src/components/school/AppShell.tsx`
   (tableau des liens, l. ~48) : `{ label: "Accrochage CDC", href: "/ecole/accrochage", … }`
   (choisir une icône lucide cohérente, ex. `FileCheck`).
3. **Endpoints** : compléter `apps/client/web/src/lib/api/endpoints.ts` (un wrapper par route,
   retour annoté DTO). Le téléchargement du fichier ne passe PAS par `unwrap()` JSON :
   utiliser `csrfFetch` directement sur l'URL `/cdc/exports/:id/file` et déclencher le
   téléchargement via blob (`URL.createObjectURL`) — cookies même realm, rien à stocker.
4. **Admin** (`apps/client/admin`) : dans la fiche école (`src/app/schools/page.tsx` ou le
   composant détail existant), ajouter le toggle « Accrochage CDC activé » branché sur
   `POST /admin/schools/:id/cdc` + endpoint wrapper admin.

## F1-7. Phase B — compte rendu de traitement (CRT)

À n'implémenter qu'après validation Phase A. Le format exact du CRT vient du kit F1-0.
`crt-parser.ts` : entrée texte/XML brut → `Array<{ lineRef: string, accepted: boolean,
code?: string, reason?: string }>` ; corrélation aux items via la référence portée dans le
fichier généré (prévoir dès la Phase A un identifiant de passage stable par item, ex.
`cdc_export_items.id`, si le XSD offre un champ de référence émetteur — sinon corrélation
NIR/ordre, à trancher avec le kit). Tests golden : un CRT d'exemple anonymisé (fixtures
fabriquées, jamais de NIR réel).

## F1-8. Tests & vérification F1

1. **node:test** :
   - `test/modules/accrochage/nir.test.ts` (F1-4).
   - `test/modules/accrochage/xml-builder.test.ts` : golden file (fixture d'entrée → XML attendu
     octet pour octet), déterminisme (2 appels = même hash), échappement (`<`, `&`, guillemets
     dans un nom), rejet Zod si champ hors dictionnaire.
   - `test/modules/accrochage/service.test.ts` via `app.request()` : éligibilité (rncp nul
     exclu, révoqué exclu, déjà en vol exclu), refus si module désactivé, refus cross-tenant
     (école A ne voit pas les diplômes de B), state machine (submitted→cancel interdit),
     conflit hash après modification d'identité, purge.
2. **Jest** : `tests/jest/web/accrochage-page.spec.tsx` — rendu des 4 blocs, état désactivé,
   badge identité manquante, soumission CSV (mock endpoints comme
   `tests/jest/web/waitlist-section.spec.tsx`), AUCUN NIR affiché après saisie.
3. **Smoke** (`src/scripts/smoke.ts`, à la suite des 44 checks — l'école seedée a des diplômes
   RNCP ; sinon compléter `seed.ts`) : activer via API admin → poser 2 identités (NIR de test
   à clé valide) → générer → télécharger (200, `application/xml`, sha256 = celui du DTO) →
   marquer déposé → vérifier que le NIR n'apparaît dans AUCUNE réponse JSON. **+6 checks**
   (44 → 50) ; mettre à jour le compte annoncé dans `PLAN.md`/`CLAUDE.md`.
4. **Validation XSD manuelle** (documenter dans `docs/cdc/README.md`) :
   ```bash
   docker run --rm -v "%cd%/docs/cdc:/x" alpine:3 sh -c "apk add --no-cache libxml2-utils && xmllint --noout --schema /x/<schema>.xsd /x/exemple-genere.xml"
   ```
5. Gate C complet (build 4/4 + smoke 50/50).

## F1-9. Definition of Done F1

- [ ] Kit officiel CDC versionné dans `docs/cdc/` + README (version, champs, encodage, nommage).
- [ ] Migration 0011 + miroir schema.ts + `db:migrate` OK sur stack dev.
- [ ] Contrat (enums/schemas/DTO) sans aucun champ NIR sortant.
- [ ] Module serveur complet, routes chaînées, `rpc.type-test.ts` compile.
- [ ] `mask.ts` étendu (NIR + état civil) + test.
- [ ] Purge branchée dans `cleanup.ts`.
- [ ] Page école + nav + endpoints + toggle admin.
- [ ] Tests : node:test (≥ 68 + nouveaux) · Jest (≥ 278 + nouveaux) · smoke 50/50 · typecheck/lint 0.
- [ ] `PLAN.md` mis à jour (statut + compte smoke) ; Obsidian (`logs/bugs.md` si bug trouvé,
      `context/session-courante.md` en fin de session) ; `plan-tests-jest.md` tables à jour.
- [ ] XML d'exemple validé contre le XSD via xmllint (F1-8.4) — et, dès que l'accès existe,
      dépôt test sur l'environnement CDC.

---

# F2 — Export EUDI Wallet (eIDAS 2.0 : SD-JWT VC + OpenID4VCI)

## F2-0. Contexte, standards épinglés, périmètre (ÉTAPE BLOQUANTE)

**Le contexte.** Le règlement (UE) **2024/1183** (« eIDAS 2.0 ») impose à chaque État membre de
fournir un **EUDI Wallet** à ses citoyens **fin 2026**. L'écosystème technique est défini par
l'**ARF** (Architecture and Reference Framework, v2.4+ — https://eudi.dev). Pour un émetteur de
diplômes, la voie d'entrée est : émettre des **attestations électroniques d'attributs** au format
**SD-JWT VC**, délivrées par **OpenID4VCI**. CertifyChain garde son wallet web comme hub de
gestion ; la feature ajoute un **export standard** (« Ajouter à mon portefeuille européen »).

**Standards utilisés (état vérifié au 2026-07-11 — à RE-vérifier en étape 0) :**
| Brique | Référence | Statut |
|---|---|---|
| Émission | **OpenID4VCI 1.0** — https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html | **Final** (une 1.1 est en draft — implémenter la 1.0 finale) |
| Format | **SD-JWT** = **RFC 9901** ; **SD-JWT VC** = draft-ietf-oauth-sd-jwt-vc (≥ -15) | RFC / draft avancé |
| Révocation | **Token Status List** = draft-ietf-oauth-status-list (≥ -21, nov. 2025) | draft avancé, requis par l'ARF |
| Libs | `@sd-jwt/core`, `@sd-jwt/sd-jwt-vc` (OpenWallet Foundation, pur TS) ; status list : `@owf/token-status-list` (successeur de `@sd-jwt/jwt-status-list`) | vérifier les noms/versions exacts sur npm à l'install |
| Crypto | **ES256 (P-256)** via `jose` (déjà en dépendance) | choix d'interop — voir F2-1 |

**Étape 0 — avant tout code :**
1. Télécharger et commiter dans **`docs/eudi/`** : la spec OID4VCI 1.0 (HTML ou PDF), le draft
   SD-JWT VC courant, le draft Token Status List courant, + un `README.md` (versions, dates, URLs).
2. Y consigner les points que ce document marque « 🔎 » ci-dessous après vérification dans le
   texte téléchargé (ils ont bougé entre drafts et la session d'implémentation ne doit PAS les
   deviner) : identifiant de format exact (`dc+sd-jwt` — anciennement `vc+sd-jwt`), forme exacte
   de la **Credential Response**, champs exacts de `credential_configurations_supported`.
3. Vérifier sur npm le nom/l'état des paquets (`@sd-jwt/*`, `@owf/token-status-list`) et
   qu'aucun n'exige de build natif.

**Hors périmètre v1 (le dire dans PLAN.md, ne pas les commencer) :** OpenID4VP (présentation),
statut d'émetteur **qualifié** (QEAA/QTSP), mdoc ISO 18013-5, DIDs, W3C VC JSON-LD, DPoP,
inscription dans les trust lists nationales. V1 = émission interopérable non qualifiée,
testée contre des wallets de référence.

## F2-1. Décisions d'architecture (fermées — ne pas rouvrir)

| Sujet | Décision | Pourquoi |
|---|---|---|
| Flow | **Pre-Authorized Code + `tx_code`** uniquement (pas d'authorization code flow) : l'élève est déjà authentifié dans le wallet CertifyChain quand il demande l'export. | C'est le flow OID4VCI prévu exactement pour ce cas ; zéro écran OAuth à construire. |
| Format | **SD-JWT VC** (`dc+sd-jwt` 🔎) avec divulgation sélective de TOUS les claims métier. | Aligné ARF ; prolonge la philosophie « divulgation minimale » du produit. |
| Algo de signature | **ES256 (P-256)** — PAS le Ed25519 maison. | Interop : ES256 est l'algo le plus largement supporté par les wallets EUDI/ARF ; EdDSA reste inégalement implémenté. Le Ed25519 PKI existant continue de signer les diplômes côté produit — les deux coexistent. |
| Identité d'émetteur | **La plateforme** : `iss` = `PUBLIC_API_ORIGIN` (une seule clé d'émission plateforme, `kid` versionné). L'école apparaît dans les **claims** (`school_name`, `school_siret`). Évolution ultérieure possible : émetteurs par école (chaîne x5c sous la racine CertifyChain) — pas en v1. | Une seule identité à faire accepter/tester ; la résolution de clés SD-JWT VC (`/.well-known/jwt-vc-issuer`) est triviale avec un émetteur unique. |
| Clé d'émission | Paire P-256 générée par script, **clé privée chiffrée `keyVault`** en table `vc_issuer_keys`, clé active unique, rotation par ajout d'une nouvelle ligne (`kid` différent, l'ancienne passe `retired` mais reste publiée dans le JWKS pour vérifier l'existant). | Cohérent avec le KeyVault existant ; pas de nouveau secret d'env. |
| Révocation | **Token Status List** : 1 bit par credential émis, bit **dérivé à la lecture** de `diplomas.status` ET `schools.status` (école non `approved` ⇒ révoqué — cohérence avec la porte S1 de la vérification publique). Rien à propager au moment de la révocation. | Zéro drift d'état ; la révocation produit (déjà testée) reste la source de vérité. |
| c_nonce | **Nonce Endpoint** dédié (OID4VCI final : le `c_nonce` n'est PLUS dans la réponse token). Nonce **stateless** : JWT HMAC (`JWT_ACCESS_SECRET`, claims `{ aud: "vc-nonce", exp: +300, jti }`). | Conforme spec finale ; pas de table de nonces supplémentaire — l'anti-replay réel est porté par le pre-auth code et l'access token à usage unique. |
| Access token | JWT HMAC (`JWT_ACCESS_SECRET`) `{ sub: offerId, aud: "vc", exp: +300 }`, **usage unique** (posé `credential_issued_at` sur l'offre au premier appel credential réussi). | Simple, révocable par TTL, rejoue impossible. |
| Erreurs | Sur `/vc/oauth/token`, `/vc/nonce`, `/vc/credential` : réponses d'erreur **au format OAuth/OID4VCI** (`{"error":"invalid_grant"}`, `{"error":"invalid_proof","c_nonce":…}` selon spec) — **PAS** le contrat `fail.*` maison. C'est l'exception documentée à CLAUDE.md §7 : ces endpoints sont consommés par des wallets tiers qui parsent la RFC, pas notre client. Tout le reste du module (routes internes wallet) reste en `fail.*`. | Interop. |
| Cookies/CSRF | Les endpoints publics OID4VCI ne lisent AUCUN cookie et n'ont PAS de middleware CSRF (auth = pre-auth code / Bearer). La route interne de création d'offre est, elle, dans le realm wallet standard (cookies + CSRF comme ses voisines). | Modèle de menace différent ; le CSRF n'a pas de sens sans cookie. |
| Activation | `VC_EXPORT_ENABLED` (env, défaut `false`) + clé active en base requise. Le DTO détail diplôme wallet gagne `eudiExportAvailable: boolean` (serveur-driven, false si feature off, diplôme révoqué ou école non approuvée). | Dégradation propre, pattern maison (Gemini/SIRENE/Stripe). |

## F2-2. Migration `0012_vc_issuer.sql` (+ miroir `schema.ts`)

**`vc_issuer_keys`**
| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| kid | text UNIQUE not null | ex. `vc-2026-07` |
| alg | text not null default 'ES256' | |
| public_jwk | jsonb not null | JWK public (crv P-256, x, y) |
| private_key_encrypted | text not null | `keyVault.encrypt(JSON.stringify(privateJwk))` |
| status | text not null default 'active' | `'active'` \| `'retired'` — index unique partiel `WHERE status='active'` |
| created_at | timestamptz | |

**`vc_offers`**
| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | = id public dans `credential_offer_uri` (non devinable) |
| diploma_id | uuid FK→diplomas not null | |
| student_id | uuid FK→students not null | |
| pre_auth_code_hash | text UNIQUE not null | SHA-256 hex du code (code = 32 octets aléatoires base64url, jamais stocké en clair) |
| tx_code_hash | text not null | HMAC-SHA256(code, OTP_PEPPER) — même recette que `otp_codes.code_hash` (`lib/otp.ts`) |
| tx_attempts | integer not null default 0 | max 3 puis offre invalidée |
| expires_at | timestamptz not null | +10 min |
| consumed_at | timestamptz | posé par le token endpoint (consommation **atomique**, voir F2-5.4) |
| credential_issued_at | timestamptz | posé par le credential endpoint (usage unique du token) |
| created_at | timestamptz | |

**`vc_credentials`**
| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| diploma_id | uuid FK→diplomas not null | |
| offer_id | uuid FK→vc_offers not null | |
| status_list_id | integer not null default 1 | |
| status_list_index | integer not null | attribué ALÉATOIREMENT parmi les libres (voir F2-5.6) ; `UNIQUE (status_list_id, status_list_index)` |
| cnf_jkt | text not null | thumbprint RFC 7638 de la clé holder (traçabilité) |
| vct | text not null | |
| issued_at | timestamptz not null default now() | |

On ne stocke **ni** le SD-JWT émis **ni** les disclosures (copies de PII interdites) — seulement
ces métadonnées. Audit enum : `ALTER TYPE "audit_type" ADD VALUE IF NOT EXISTS 'vc_offer_created';`
et `'vc_credential_issued'` (+ miroir schema.ts, même piège transactionnel qu'en F1-2).

## F2-3. Env, constantes, contrat

- `env.ts` : `PUBLIC_API_ORIGIN: z.string().url().default("http://localhost:4000")` (origine
  **publique** de l'API — c'est le `credential_issuer` ; en prod = URL https derrière Caddy) ;
  `VC_EXPORT_ENABLED: zBool(false)`. Dérivé dans le freeze : `vcExportEnabled: raw.VC_EXPORT_ENABLED`.
- `constants.ts` : `VC: { OFFER_TTL_SEC: 600, TOKEN_TTL_SEC: 300, NONCE_TTL_SEC: 300, TX_CODE_LEN: 5, TX_MAX_ATTEMPTS: 3, VCT: "urn:certifychain:diploma:1", STATUS_LIST_CAPACITY: 4096, STATUS_TTL_SEC: 300 }` + `RATE_LIMIT.VC_TOKEN` (10/min/IP), `VC_NONCE` (30/min/IP), `VC_CREDENTIAL` (10/min/IP), `VC_OFFER` (10/min par étudiant).
- `.env.example` + compose (les 2 nouvelles variables, non sensibles).
- Contrat : `dto.ts` → `EudiOfferDTO { offerDeepLink: string, txCode: string, expiresAt: string }`
  (le deep link `openid-credential-offer://…` sert tel quel de payload QR) ; ajouter
  `eudiExportAvailable: boolean` au DTO détail diplôme wallet existant (chercher le DTO renvoyé
  par la route wallet de détail — probablement `WalletDiplomaDetailDTO` dans `dto.ts`) et le
  renseigner dans `wallet.service.ts`. `schemas.ts` : rien (la route interne n'a pas de body).

## F2-4. Clé d'émission — script

`apps/server/src/scripts/gen-vc-issuer-key.ts` + script package `"keys:vc"` (même forme que
`keys:root`) : génère P-256 via `jose.generateKeyPair("ES256", { extractable: true })`,
exporte les JWK, insère dans `vc_issuer_keys` (privé chiffré `keyVault`), refuse s'il existe
déjà une clé `active` (message : passer `--rotate` pour rétirer l'ancienne et en créer une
nouvelle). L'exécuter dans le setup dev (documenter dans README + `docs/eudi/README.md`).
Le seed (`seed.ts`) doit créer la clé si absente quand `VC_EXPORT_ENABLED=true` (pour smoke).

## F2-5. Serveur — module `vc`

Fichiers : `apps/server/src/modules/vc/{vc.routes.ts, vc.service.ts, sd-jwt.ts, status-list.ts, keys.ts}`.
Libs : `corepack pnpm@9.12.0 --filter @certifychain/server add @sd-jwt/core @sd-jwt/sd-jwt-vc @owf/token-status-list`
(🔎 vérifier les noms à l'install ; si `@owf/token-status-list` n'existe pas, prendre
`@sd-jwt/jwt-status-list` ; si aucun n'est sain, implémenter le draft soi-même : bitstring
1 bit/entrée → DEFLATE (zlib) → base64url, enveloppé dans un JWT `typ: "statuslist+jwt"` —
la section « Status List Token » du draft donne les champs exacts).

### F2-5.1 Routes publiques (chaînées, montées à la RACINE)

`credential_issuer` = `PUBLIC_API_ORIGIN` (origine nue) ⇒ les well-known DOIVENT être à la
racine du serveur. Dans `app.ts`, ajouter **`.route("/", vcRoutes)`** dans la chaîne :

```ts
// vc.routes.ts — SQUELETTE
export const vcRoutes = new Hono<AppEnv>()
  .get("/.well-known/openid-credential-issuer", /* metadata issuer, voir 5.2 */)
  .get("/.well-known/oauth-authorization-server", /* metadata AS : issuer, token_endpoint,
        grant_types_supported: ["urn:ietf:params:oauth:grant-type:pre-authorized_code"] */)
  .get("/.well-known/jwt-vc-issuer", /* { issuer, jwks: { keys: [tous les JWK publics] } } */)
  .get("/vc/offers/:id", /* credential_offer_uri → l'objet Credential Offer JSON ; 404 si inconnu/expiré/consommé ; Cache-Control: no-store */)
  .post("/vc/nonce", rateLimit(/* VC_NONCE */), /* { c_nonce } + Cache-Control: no-store */)
  .post("/vc/oauth/token", rateLimit(/* VC_TOKEN */), /* form-urlencoded ! voir 5.4 */)
  .post("/vc/credential", rateLimit(/* VC_CREDENTIAL */), /* Bearer + proof, voir 5.5 */)
  .get("/vc/status/:listId", /* Status List Token signé, Cache-Control: max-age=STATUS_TTL_SEC */);
```

Si `!env.vcExportEnabled` ou pas de clé active : ces routes répondent 404 uniformément.
CORS : ajouter `Access-Control-Allow-Origin: *` (sans credentials) sur les GET publics
(well-known, offers, status) — vérifier comment `corsMiddleware` est structuré et l'ÉTENDRE
proprement plutôt que d'empiler un 2ᵉ middleware CORS contradictoire. Les POST (token, nonce,
credential) sont consommés par des apps natives : pas de CORS nécessaire en v1.
⚠️ `/vc/oauth/token` consomme du `application/x-www-form-urlencoded` (RFC 6749), pas du JSON :
utiliser `await c.req.parseBody()`, pas `zValidator("json", …)`.

### F2-5.2 Metadata issuer (contenu minimal)

```jsonc
{
  "credential_issuer": "<PUBLIC_API_ORIGIN>",
  "credential_endpoint": "<PUBLIC_API_ORIGIN>/vc/credential",
  "nonce_endpoint": "<PUBLIC_API_ORIGIN>/vc/nonce",
  "display": [{ "name": "CertifyChain", "locale": "fr-FR" }],
  "credential_configurations_supported": {
    "certifychain-diploma": {
      "format": "dc+sd-jwt",              // 🔎 confirmer l'identifiant dans la spec épinglée
      "vct": "urn:certifychain:diploma:1",
      "credential_signing_alg_values_supported": ["ES256"],
      "proof_types_supported": { "jwt": { "proof_signing_alg_values_supported": ["ES256"] } },
      "display": [{ "name": "Diplôme certifié", "locale": "fr-FR" }],
      "claims": [ /* 🔎 forme exacte (array vs object) selon la spec épinglée — décrire
                     holder_name, program_title, mention, rncp, issued_at, school_name, school_siret */ ]
    }
  }
}
```
(Pas de champ `authorization_servers` ⇒ l'issuer est son propre AS ⇒ le wallet lit
`/.well-known/oauth-authorization-server` sur la même origine.)

### F2-5.3 Création d'offre (route INTERNE realm wallet)

Dans `wallet.routes.ts` (chaîné, à côté des routes de partage) :
`POST /wallet/diplomas/:id/eudi-offer`, `requireAuth("student")`, rate-limit `VC_OFFER` :
1. Charger le diplôme **de l'étudiant de la session** ; refuser si révoqué, école non
   `approved`, feature off (`fail.notFound`/`fail.forbidden` selon les helpers existants).
2. Générer `preAuthCode` (32 octets base64url) + `txCode` (5 chiffres, `crypto.randomInt`).
3. Insérer `vc_offers` (hashs, expiration) ; `recordAudit({ type: "vc_offer_created", … })`.
4. Construire l'objet Credential Offer :
   ```jsonc
   { "credential_issuer": "<PUBLIC_API_ORIGIN>",
     "credential_configuration_ids": ["certifychain-diploma"],
     "grants": { "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
        "pre-authorized_code": "<code>",
        "tx_code": { "input_mode": "numeric", "length": 5,
                     "description": "Code affiché dans votre espace CertifyChain" } } } }
   ```
   ⚠️ L'objet ci-dessus (avec le code en clair) n'est PAS stocké : il est reconstruit par
   `GET /vc/offers/:id`… qui ne connaît plus le code en clair. Solution imposée : chiffrer
   l'objet offer complet via `keyVault.encrypt()` dans une colonne `offer_payload_encrypted`
   de `vc_offers` (ajoute-la à la table F2-2), déchiffré par `GET /vc/offers/:id`. Le hash
   `pre_auth_code_hash` reste la référence de consommation côté token.
5. Réponse `EudiOfferDTO` : `offerDeepLink = "openid-credential-offer://?credential_offer_uri="
   + encodeURIComponent(PUBLIC_API_ORIGIN + "/vc/offers/" + offer.id)`, `txCode` (affiché à
   l'utilisateur UNIQUEMENT ici — jamais dans le QR), `expiresAt`.

### F2-5.4 Token endpoint (`POST /vc/oauth/token`)

Body form-urlencoded : `grant_type`, `pre-authorized_code`, `tx_code`.
1. `grant_type !== "urn:ietf:params:oauth:grant-type:pre-authorized_code"` →
   `400 {"error":"unsupported_grant_type"}`.
2. Résoudre l'offre par `sha256(pre-authorized_code)`. Inconnue/expirée/déjà consommée →
   `400 {"error":"invalid_grant"}` (message générique, pas de distinction — anti-énumération).
3. Vérifier `tx_code` (HMAC). Échec → incrémenter `tx_attempts` **atomiquement** ; si
   `tx_attempts >= TX_MAX_ATTEMPTS`, poser `consumed_at` (offre morte) ; toujours répondre
   `400 {"error":"invalid_grant"}`.
4. Consommation **atomique** du code (même pattern anti-rejeu que les nonces de vérification) :
   `UPDATE vc_offers SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING id`
   — zéro ligne ⇒ course perdue ⇒ `invalid_grant`.
5. Réponse 200 : `{ "access_token": <JWT HMAC {sub: offerId, aud: "vc", exp: +TOKEN_TTL_SEC}>,
   "token_type": "Bearer", "expires_in": 300 }` + `Cache-Control: no-store`.
   (PAS de `c_nonce` ici — spec finale : c'est le rôle du nonce endpoint.)

### F2-5.5 Credential endpoint (`POST /vc/credential`)

JSON : `{ "credential_configuration_id": "certifychain-diploma", "proofs": { "jwt": ["<proof>"] } }`
(🔎 accepter aussi la variante single `proof` si la spec épinglée la garde). Vérifications, dans
l'ordre, chaque échec → erreur OAuth appropriée (`invalid_token` 401 / `invalid_proof` 400 avec
un `c_nonce` frais si la spec le prévoit 🔎) :
1. `Authorization: Bearer` → vérifier JWT HMAC (aud `vc`, exp) → `offerId`.
2. Offre : `consumed_at` non nul (token émis) ET `credential_issued_at` NUL. Poser
   `credential_issued_at` **atomiquement** (même `UPDATE … WHERE … IS NULL RETURNING`) —
   c'est l'usage unique du token.
3. Proof JWT : header `typ: "openid4vci-proof+jwt"`, `alg: "ES256"`, clé holder dans le header
   `jwk` ; payload `aud === PUBLIC_API_ORIGIN`, `nonce` = c_nonce valide (JWT HMAC aud
   `vc-nonce` non expiré), `iat` dans ±5 min. Vérifier la signature avec la `jwk` du header
   (`jose.importJWK`). Refuser toute clé non-P-256.
4. Attribuer `status_list_index` (F2-5.6), insérer `vc_credentials` (cnf_jkt = thumbprint).
5. Construire le SD-JWT VC (F2-5.7) et répondre selon la forme EXACTE de la Credential
   Response de la spec épinglée 🔎 (final 1.0 : tableau `credentials` — à confirmer sur le
   texte téléchargé en F2-0, écrire le test de conformité d'après ce texte) +
   `Cache-Control: no-store`. Audit `vc_credential_issued`.

### F2-5.6 Status list (`status-list.ts`)

- Attribution d'index : tirage aléatoire parmi les libres de la liste 1 (capacité 4096) ;
  si > 75 % occupés, étendre la capacité (×2) — la liste étant **dérivée**, l'extension est
  sans migration de données. Boucle « tire → tente l'INSERT (unique) → re-tire en cas de
  conflit » (borne : 10 essais puis erreur 500 loggée).
- `GET /vc/status/:listId` : charger les `vc_credentials` de la liste + jointure `diplomas`
  (+ `schools.status`) ; bit = 1 si `diplomas.status = 'revoked'` OU école non `approved` ;
  encoder (lib ou manuel : 1 bit/entrée, DEFLATE, base64url) ; signer un JWT
  `typ: "statuslist+jwt"` avec la clé active (`kid` dans le header), claims :
  `iss = PUBLIC_API_ORIGIN`, `sub = <URL de la liste>`, `iat`, `ttl = STATUS_TTL_SEC`,
  `status_list: { bits: 1, lst: "<encodé>" }` (🔎 noms exacts dans le draft épinglé).
  Mettre en cache mémoire 60 s (pattern simple type login-throttle Map) — le handler reste pur.
- Claim `status` dans chaque SD-JWT émis :
  `{ status_list: { idx: <index>, uri: PUBLIC_API_ORIGIN + "/vc/status/1" } }`.

### F2-5.7 Construction SD-JWT VC (`sd-jwt.ts`)

- `SDJwtVcInstance` de `@sd-jwt/sd-jwt-vc` : `signer` = signature ES256 `jose` avec la clé
  active (kid en header), `hashAlg: "sha-256"` (hasher/`saltGenerator` via `node:crypto`).
- Claims **toujours visibles** : `iss`, `iat`, `vct`, `cnf: { jwk: <clé holder du proof> }`,
  `status`. Claims **sélectivement divulgables** (disclosureFrame `_sd`) : `holder_name`,
  `program_title`, `mention` (si non nulle), `rncp` (si non nul), `issued_at` (ISO),
  `school_name`, `school_siret`, `diploma_id`. Ajouter 2 decoys (`_sd_decoy: 2` si la lib le
  supporte — sinon accepter sans decoys et le noter).
- **Pas de `exp`** : un diplôme n'expire pas ; la révocation passe par la status list.
- Round-trip de test obligatoire : vérifier le SD-JWT émis avec la partie *verifier* de la
  même lib (signature via le JWK public, divulgation partielle → seuls les claims divulgués
  apparaissent, digest des disclosures cohérents).

### F2-5.8 Redaction & hygiène

- `mask.ts` : ajouter `pre-authorized_code`, `preAuthorizedCode`, `tx_code`, `txCode`,
  `access_token` (si absent) + test.
- `cleanup.ts` : purger les `vc_offers` expirées non consommées (> 24 h) — les credentials
  émis et leurs index restent (nécessaires à la status list).

## F2-6. Front wallet (`apps/client/wallet`)

1. **Détail diplôme** (`src/components/wallet/DiplomaDetailCard.tsx` ou le panneau d'actions
   voisin — suivre l'emplacement des actions de partage existantes) : si
   `eudiExportAvailable`, bouton « Ajouter à mon portefeuille européen (EUDI) » → modale
   (`Modal` shared) : QR (`QRCodeCanvas` de `qrcode.react`, déjà utilisée dans
   `SharePanel.tsx`) encodant `offerDeepLink`, le **code de transaction** affiché en gros
   (`font-display`, copiable), compte à rebours d'expiration (10 min), bouton « régénérer ».
   Texte : « Compatible avec les portefeuilles d'identité européens (EUDI Wallet) — standards
   ouverts OpenID4VCI / SD-JWT VC », et l'avertissement « le code se saisit dans votre
   application portefeuille, ne le partagez pas ».
2. Diplôme révoqué : pas de bouton (le DTO renvoie déjà false — ne pas dupliquer la logique).
3. `src/lib/api/endpoints.ts` (wallet) : wrapper `createEudiOffer(diplomaId): Promise<EudiOfferDTO>`.
4. Jest : `tests/jest/wallet/eudi-export.spec.tsx` — bouton absent si `eudiExportAvailable=false`,
   modale ouvre avec QR + code, erreur API → `role=alert` (pattern `waitlist-section.spec.tsx`),
   deep link commence par `openid-credential-offer://`.

## F2-7. Interop & test manuel (documenter dans `docs/eudi/README.md`)

- **Contrainte réseau** : le téléphone doit joindre `PUBLIC_API_ORIGIN`. En dev :
  `PUBLIC_API_ORIGIN=http://<IP LAN>:4000` (et exposer le port), ou tunnel https. La plupart
  des wallets EUDI **exigent https** → le test wallet réel se fait derrière le TLS du sprint
  P1 (Caddy) ou un tunnel type cloudflared. Le smoke, lui, tourne en localhost (pas bloqué).
- Wallets de test : le **reference wallet EUDI** (org GitHub `eu-digital-identity-wallet`,
  apps iOS/Android + verifier de test) ; à défaut, les wallets de démo Sphereon / Animo
  (Paradym) qui parlent OID4VCI+SD-JWT VC. Checklist : scan du QR → saisie tx_code →
  credential visible avec les claims → présentation partielle chez un verifier de démo →
  révoquer le diplôme côté CertifyChain → statut « révoqué » visible après refresh (TTL 300 s).
- Valideurs en ligne utiles : décodeur SD-JWT (sdjwt.info ou équivalent) pour inspecter
  l'émission sans wallet.

## F2-8. Tests & vérification F2

1. **node:test** :
   - `test/modules/vc/sd-jwt.test.ts` : round-trip build/verify (F2-5.7), claims SD vs visibles,
     cnf = clé holder, kid présent.
   - `test/modules/vc/status-list.test.ts` : encode/décode local, bit révoqué/école rejetée,
     attribution d'index (unicité, extension de capacité), JWT signé vérifiable.
   - `test/modules/vc/flow.test.ts` via `app.request()` : **flux complet** — création d'offre
     (route wallet authentifiée : réutiliser les helpers de session du test d'intégration
     existant), GET offer, POST nonce, POST token (form-urlencoded ; cas : mauvais tx_code ×3
     ⇒ offre morte ; rejouer le code ⇒ invalid_grant ; expiration), POST credential (proof
     forgé mauvaise clé ⇒ rejet ; nonce périmé ⇒ rejet ; 2ᵉ appel ⇒ rejet usage unique),
     réponses d'erreur au format OAuth (`{"error":…}`), feature off ⇒ 404.
     Le proof de test se fabrique avec `jose` (P-256 éphémère) — aucune lib wallet nécessaire.
   - `env` étant gelé au premier import : pour tester on/off, suivre le pattern
     `jest.isolateModules`/réimport utilisé par `tests/jest/server/mailer.spec.ts` (ou, en
     node:test, lancer le flux avec `VC_EXPORT_ENABLED=true` via l'env du process de test et
     tester le « off » sur une route unitaire dédiée si nécessaire — ne pas se battre avec le gel).
2. **Jest UI** : F2-6.4.
3. **Smoke** (+8 checks, 50 → 58 si F1 déjà faite ; sinon 44 → 52) : seed crée la clé →
   login étudiant seedé → create-offer → GET offer JSON → POST nonce → POST token (avec le
   tx_code renvoyé par la route interne) → POST credential avec proof ES256 fabriqué →
   vérifier : SD-JWT à 3+ segments `~`, claims divulgables présents dans les disclosures,
   GET status list = bit 0 → révoquer le diplôme (API école existante) → bit 1.
4. Gate C complet + mise à jour des comptes (PLAN.md, CLAUDE.md §6 si le libellé « 44 checks »
   y est encore).

## F2-9. Definition of Done F2

- [ ] `docs/eudi/` : specs épinglées + README (versions, 🔎 résolus : format id, credential
      response, claims metadata, champs status list).
- [ ] Migration 0012 + miroir + migrate OK.
- [ ] Script `keys:vc` + seed (clé auto en dev).
- [ ] Module `vc` complet : well-known ×3, offers, nonce, token, credential, status —
      chaînés, montés à la racine, `rpc.type-test.ts` compile.
- [ ] Route interne wallet + DTO `eudiExportAvailable` + UI modale QR/tx_code.
- [ ] Erreurs OAuth conformes sur les endpoints publics ; `fail.*` partout ailleurs.
- [ ] `mask.ts` + `cleanup.ts` étendus.
- [ ] Tests : node:test flux complet + Jest UI + smoke +8 · typecheck/lint 0 · build 4/4.
- [ ] Test manuel wallet réel effectué OU explicitement reporté dans PLAN.md avec la raison
      (pas de TLS public avant P1) — ne pas prétendre l'avoir fait.
- [ ] PLAN.md / plan-tests-jest.md / Obsidian à jour.

---

## 3. Pièges connus (relire avant chaque étape — ils ont tous déjà mordu)

1. **Routes non chaînées / handler annoté `Promise<Response>`** ⇒ l'inférence RPC casse en
   silence côté serveur et bruyamment côté fronts. La sonde `rpc.type-test.ts` te protège :
   si elle rougit, corrige le style, ne la modifie pas.
2. **`ALTER TYPE … ADD VALUE`** : jamais utiliser la nouvelle valeur dans la même migration.
3. **`env` est `Object.freeze` au premier import** : dans les tests, variantes d'env =
   réimport isolé (pattern `mailer.spec.ts`), jamais de mutation après coup.
4. **pnpm Windows** : PowerShell + `corepack pnpm@9.12.0` épinglé + formes directes
   (`--filter @certifychain/server db:seed|smoke`) — les scripts racine ré-invoquent pnpm nu.
5. **Distroless** : pas de module natif ; si `pnpm add` compile quoi que ce soit (node-gyp),
   stop et choisis une alternative pure-JS.
6. **Jest jsdom + framer-motion** : disparition d'éléments animés ⇒ fake timers pour déclencher,
   puis `jest.useRealTimers()` + `waitFor` (pattern documenté dans `plan-tests-jest.md` §1).
7. **`noUncheckedIndexedAccess`** : tout accès indexé (CSV, `split`, tableaux de bytes) doit
   traiter `undefined`.
8. **Anti-énumération** : messages d'erreur génériques sur token endpoint (F2) et sur la
   résolution CSV (F1 : « ligne N : diplôme introuvable », sans révéler l'existence chez une
   autre école).
9. **Pas de PII dans les logs** : le logger JSON passe par `mask.ts` — mais il ne masque que ce
   qu'on lui déclare. Étendre AVANT d'écrire le premier `logger.info` des nouveaux modules.
10. **NIR de test uniquement fabriqués** (clé calculée), jamais copiés d'un exemple réel.
11. **Ne pas stocker ce qui peut être dérivé** : XML CDC (régénéré), bits de status list
    (dérivés), SD-JWT émis (non stocké) — c'est un choix de design, ne pas « optimiser » en
    ajoutant du stockage.
12. **CLAUDE.md §6** et `PLAN.md` §5 mentionnent « smoke 44 checks » : mettre à jour ces
    libellés quand le compte change.

## 4. Séquencement conseillé & jalons commitables

| Jalon | Contenu | Gate |
|---|---|---|
| F1-a | F1-0 docs + migration 0011 + contrat + `nir.ts` + mask | A |
| F1-b | module serveur + tests node:test + intégration | A |
| F1-c | front école + admin toggle + Jest | B |
| F1-d | smoke +6 + Docker | **C** |
| F2-a | F2-0 docs + migration 0012 + script clé + contrat | A |
| F2-b | sd-jwt.ts + status-list.ts + tests unitaires | A |
| F2-c | routes publiques + route interne + flux intégration | A |
| F2-d | UI wallet + Jest | B |
| F2-e | smoke +8 + Docker + test wallet réel (ou report motivé) | **C** |

Chaque jalon laisse le repo vert (typecheck/lint/tests) — proposer un commit à l'utilisateur à
chaque gate C au minimum.

## 5. Sources (vérifiées le 2026-07-11 — re-vérifier en étape 0 de chaque feature)

**F1 :** portail officiel certificateurs https://certificateurs.moncompteformation.gouv.fr/
(rubrique « Comment faire ? », guides + XSD + dictionnaire ; refonte du format annoncée pour
2026) · art. L6113-8 C. trav. https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048590265 ·
guide général d'accrochage (PDF, portail) · FAQ NIR (portail, « Puis-je collecter le numéro de
sécurité sociale… »).

**F2 :** OID4VCI 1.0 final https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html ·
SD-JWT RFC 9901 · SD-JWT VC https://datatracker.ietf.org/doc/draft-ietf-oauth-sd-jwt-vc/ ·
Token Status List https://datatracker.ietf.org/doc/draft-ietf-oauth-status-list/ ·
ARF https://eudi.dev/latest/architecture-and-reference-framework-main/ · libs
https://github.com/openwallet-foundation/sd-jwt-js (`@sd-jwt/core`, `@sd-jwt/sd-jwt-vc`,
status list → `@owf/token-status-list`) · reference wallet
https://github.com/eu-digital-identity-wallet.

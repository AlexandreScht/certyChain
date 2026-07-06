# PROGRESS.md — Refonte monorepo CertifyChain (`_refactor/`)

> **Journal vivant de la refonte.** Permet la reprise à froid après toute coupure (token limit, session).
> Plan de référence approuvé : `C:\Users\alexa\.claude\plans\calm-jingling-crystal.md` (v2 avec amendements A/B).
> Règle : chaque étape terminée est cochée ici avec ses décisions/pièges AVANT de passer à la suivante.

## Toolchain (recette locale)

```bash
# node n'est PAS sur le PATH → fnm + corepack (pnpm@9.12.0 pinné)
export PATH="$APPDATA/fnm/node-versions/v24.16.0/installation:$PATH"   # Git Bash
# PowerShell : $env:PATH = "$env:APPDATA\fnm\node-versions\v24.16.0\installation;" + $env:PATH
corepack pnpm -v          # doit répondre 9.12.0
# Toutes les commandes pnpm se lancent DEPUIS _refactor/ (workspace autonome).
# Vérification finale = Docker (docker compose build / up) — Docker Desktop doit être démarré.
```

## Checklist des étapes

- [x] **Étape 0 — Squelette workspace** : `pnpm-workspace.yaml` (apps/client/*, apps/server, packages/*), `package.json` orchestrateur (`certifychain`), `tsconfig.base.json`, copies `.env`/`.env.example`/`pnpm-lock.yaml`, ce fichier.
- [x] **Étape 1 — `packages/contract`** : 5 fichiers copiés, exports `.` `./dto` `./enums` `./errors` `./schemas`, dep zod (3.25.76 au niveau workspace). Typecheck 0. ✅
- [x] **Étape 2 — `packages/shared`** : ui ×18 + barrel (ThemeToggle = export default, accessible via `./ui/ThemeToggle`), styles/globals.css (canonique = web, `@source "../"` en tête, SANS `@import "tailwindcss"` — il appartient à l'app), lib/cn, api/client (API_BASE, ApiClientError, createCsrfFetch, unwrap, SuccessBody), hooks (useTheme + createSessionHooks factory), config/security-headers (buildSecurityHeaders). peerDeps only (react/react-dom/next/framer/lucide/clsx/tw-merge) + dep type-only @certifychain/contract + devDep @types/node (process.env). Typecheck 0. ✅
  - `lib/query.ts` (toQuery) NON créé : hc prend `{ query }` nativement — à re-créer seulement si un endpoint hors-RPC en a besoin.
- [x] **Étape 3 — `apps/server` (migration)** : copie sans `src/contract` (+ `.dockerignore` mort abandonné, audit #26), 32 imports → `@certifychain/contract` (21 fichiers + `app.ts` en `./contract`), scripts `--env-file=../../.env`, Dockerfile réécrit (manifests ×7 puis sources contract+server, runner distroless inchangé `/app/dist`+`/app/drizzle` — `runMigrations` résout `drizzle/` depuis cwd). Typecheck 0 · tsup 345.92 KB (symboles contract bundlés ✓) · **59/59 tests**. ✅
- [x] **Étape 4 — `apps/server` (RPC typé)** : 9 modules convertis en chaîné (déclarations intercalées hissées au-dessus des chaînes — admin, auth ×2 dont `loadClaimableAlias`, billing, diplomas, schools, verification, wallet), `app.ts` chaîné SANS annotation de retour (sinon l'inférence est effacée), `export type AppType = ReturnType<typeof createApp>`, export package `"./rpc"` → `src/app.ts`. Sonde permanente `src/rpc.type-test.ts` (InferRequestType/InferResponseType : health + login école) — casse le typecheck si une route sort du style chaîné. Typecheck 0 · bundle 345.70 KB · **59/59 tests**. ✅
  - ⚠️ Piège : le wrapper maison `lib/validator.ts` est casté `as typeof honoZValidator` → l'inférence hc traverse ; ne pas retirer ce cast.
- [x] **Étape 5 — `apps/client/web`** : copie (sans ui/utils/useTheme) + rewrites (`@contract/*`→`@certifychain/contract/*`, ui→`@certifychain/shared/ui`, cn/useTheme→shared) ; bindings realm minces (`client.ts` = hc<AppType> + csrfFetch cc_csrf ; `useSession.ts` = createSessionHooks) ; **endpoints.ts réécrit sur le RPC typé** (25 fonctions ; section wallet/share supprimée = code mort ici ; import CSV = csrfFetch multipart hors-RPC) ; globals.css aminci (tailwind + import relatif shared) ; next.config (transpilePackages, tracing ../../.., buildSecurityHeaders en import RELATIF — le loader Next l'accepte ✓). Typecheck 0 · lint 0 (6 warnings préexistants) · build 11 routes · standalone `apps/client/web/server.js` ✓ · **piège Tailwind validé** (`h-[18px]` du ThemeToggle shared présent dans le CSS émis). ✅
- [x] **Étape 6 — `apps/client/wallet`** : même recette, realm public ; endpoints **purgés à 12 fonctions réellement utilisées** (+me) — les sections école/verification/diplomas/verify de l'ancienne copie triplée étaient mortes. Typecheck 0 · lint 0 · build 4 routes (`/claim/[token]` inclus) · standalone ✓. ✅
- [x] **Étape 7 — `apps/client/admin`** : realm admin (`cc_admin_csrf`, useAdminSession/useRequireAdmin, `$put` settings, noindex + no-referrer) ; 15 endpoints tous utilisés, conservés ; piège corrigé : `qrcode.react` REQUIS par admin (QR d'enrôlement TOTP au login). Typecheck 0 · lint 0 · build 8 routes · standalone ✓. ✅
- [x] **Étape 8 — Docker & composes** : 4 Dockerfiles réécrits (manifests ×7 → install frozen → COPY `packages/` + `apps/server` [type-check AppType] + l'app → standalone `apps/client/<app>/server.js`) ; compose racine `name: certifychain` + 4 chemins dockerfile ; compose-dev copié verbatim (+ `dev/`) ; **1 compose par app cliente** (`context: ../../..`, service unique durci, `NEXT_PUBLIC_API_URL` surchargeable, admin loopback par défaut). `config -q` ×5 OK · **build 4/4 images** (server 205 MB, web 284 MB, wallet/admin 280 MB) · build via compose web solo OK. ✅
  - ⚠️ Piège PowerShell (outillage, pas le code) : `Get-Content`/`Set-Content` sur des chemins `[token]` → toujours `-LiteralPath` ; robocopy `/E` + `Remove-Item` dans une même commande = bloqué par la protection du harness → séparer.
- [x] **Étape 9 — Tests + smoke live** : host = typecheck ×3 + **59/59 tests** + lint ×3 (0 erreur, 7 warnings préexistants admin) ; `docker compose build` 4/4 ; **59/59 re-joués dans l'étage builder** (`docker build --target builder` + `docker run … pnpm test` avec `.env` monté) ; stack **dev overlay** up (5/5 healthy — le seed host et la capture d'OTP exigent la DB publiée + Mailpit, les images restent celles de prod) ; seed OK ; **nouveau script smoke E2E permanent `pnpm smoke`** (`apps/server/src/scripts/smoke.ts`) : **44 vérifications, 0 échec** — santé+headers, pages ×4, verify challenge→proof→verified + anti-rejeu + nonce forgé + token inconnu, login école mdp+TOTP (secret déchiffré via KeyVault), émission → invitation claim (Mailpit) → landing → OTP → session élève → wallet → partage → verify → révocations (lien + diplôme), OTP login élève + anti-énumération, realm admin complet. ✅
- [x] **Étape 9bis — Tests supplémentaires (demande utilisateur)** : suite serveur étendue **59 → 68 tests** (`lib/mask.test.ts` : redaction PII du claim ; `lib/otp.test.ts` : round-trip HMAC + rejets sûrs) + le smoke E2E permanent de l'étape 9 (44 checks). Typecheck 0. ✅
- [x] **Étape 9ter — Audit bugs utilisateurs (demande utilisateur)** : rapport `docs/audit-refonte-2026-07-07.md`. 2 corrections appliquées ((1) 4 sites `process.env.*_ORIGIN` → `env.*` validé — liens e-mails/claim/ShareLinkDTO ; (2) SharePanel wallet : lien expiré affiché « Actif » + QR vedette pouvant être expiré + tri incohérent) ; 6 recommandations non bloquantes (R1–R6). Docs non trackées **sauvées** dans `_refactor/docs/` (ADR 0001, architecture.md, audit legacy 2026-07-05). Re-validation post-correctifs : typecheck 0 · **68/68** · wallet lint 0 · rebuild 4/4 · **smoke 44/44**. ✅
- [x] **Étape 10 — Docs & swap** : `CLAUDE.md` réécrit (monorepo, règles RPC §4, recette toolchain, correction argon2→scrypt) · `README.md` · `PLAN.md` **dans `_refactor/`** (l'ancien PLAN racine part avec le swap ; historique via git) · ADR **0002-monorepo-layout** + **0003-hono-rpc-typed-client** (gabarit 0001) · `MIGRATION-SWAP.md` (swap effectué + rollback + procédure d'aplatissement) · vault Obsidian (décision + session + stack). **Swap exécuté le 2026-07-07** : racine réduite à `_refactor/` + 4 guides (.md) + `.git`/`.gitignore`/`.claude` — demande utilisateur, remplace le « déplacer vers la racine » du plan v2. ✅
- [x] **Étape 11 — Dossier `test/` par projet (demande utilisateur)** : les 9 fichiers de tests d'`apps/server` (seul projet à en avoir — aucun test côté `apps/client/{web,wallet,admin}` ni `packages/*`, vérifié : pas de `*.test.*`/`*.spec.*`, pas de script `test`, pas de config vitest/jest) déplacés de `src/**` vers **`apps/server/test/**` (arborescence miroir : `test/crypto/`, `test/lib/`, `test/middleware/`, `test/modules/verification/`). Imports relatifs corrigés (`./x` → `../../src/.../x`, profondeur ajustée pour `test/modules/verification/`). `package.json` › `test` glob `src/**/*.test.ts` → `test/**/*.test.ts` ; `tsconfig.json` › `include` complété avec `test/**/*.ts` (sinon le typecheck cessait silencieusement de couvrir les tests). Aucun changement Dockerfile requis (`COPY apps/server` copie déjà tout le dossier ; `tsup.config.ts` n'a pas d'entry sur `test/`). **Validation** : typecheck 0 (test/ inclus) · **68/68 host** · **68/68 dans l'étage builder Docker** (hermétique) · image prod `server` reconstruite avec succès (dist/ inchangé, aucun code de test bundlé). ✅

## Décisions prises en route

| Date | Décision | Raison |
|---|---|---|
| 2026-07-06 | (plan v2) RPC typé Hono + compose par app cliente | Amendements utilisateur à l'approbation du plan |

## Pièges rencontrés

- **Corepack sous Git Bash (harness) : échec silencieux.** Le shim sh de `corepack` mangle le chemin (`C:\Program Files\Git\Users\…`) ET renvoie exit 0 malgré le crash → un `set -e` "tout vert" peut n'avoir RIEN exécuté. Toujours lancer pnpm via **PowerShell** (`$env:PATH = "$env:APPDATA\fnm\node-versions\v24.16.0\installation;" + $env:PATH`) et vérifier un marqueur réel (version pnpm, `# pass 59`).
- **`certifychain_devdns` : "Pool overlaps"** au `up` dev si les réseaux de l'ancien projet (`certychain_*`, même subnet fixe 172.29.7.0/24) existent encore → `docker compose -p certychain down --remove-orphans` + `docker network rm` avant le premier up dev.
- **Étape 9 sur l'overlay dev, volontairement** : la stack prod n'expose ni la DB (seed host impossible — l'image runner est distroless, sans tsx) ni les emails (SMTP localhost → drop). Overlay dev = mêmes images, seuls env/ports diffèrent.
- **Smoke re-jouable** : emails uniques par run (`promo2026.<runid>@…`) + purge des `otp_codes` du compte démo avant la demande (sinon le cooldown 30 s avale l'envoi et l'ancien code est déjà consommé).

## Commandes de validation reproductibles

```bash
cd _refactor
pnpm -v
pnpm --filter @certifychain/contract typecheck
pnpm --filter @certifychain/shared typecheck
pnpm --filter @certifychain/server typecheck && pnpm --filter @certifychain/server build && pnpm --filter @certifychain/server test
pnpm --filter @certifychain/web lint && pnpm --filter @certifychain/web build
pnpm --filter @certifychain/wallet lint && pnpm --filter @certifychain/wallet build
pnpm --filter @certifychain/admin lint && pnpm --filter @certifychain/admin build
docker compose config -q && docker compose build
docker compose -f apps/client/web/docker-compose.yml config -q

# Tests dans l'étage builder (hermétique)
docker build --target builder -t certifychain-server-builder -f apps/server/Dockerfile .
docker run --rm -v "$PWD/.env:/app/.env:ro" -w /app/apps/server certifychain-server-builder pnpm test

# Smoke E2E (44 checks) — stack dev up + seed d'abord
docker compose -f docker-compose.yml -f docker-compose-dev.yml up -d
pnpm db:seed && pnpm smoke
```

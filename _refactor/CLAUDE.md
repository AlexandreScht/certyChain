# CertifyChain — Project Instructions & Context (monorepo)

> **Reprise rapide :** lis d'abord [`PLAN.md`](./PLAN.md) (plan vivant : fait / en cours / reste) puis
> [`PROGRESS.md`](./PROGRESS.md) (journal de la refonte monorepo 2026-07, pièges d'outillage inclus).
> Ce fichier-ci décrit *le projet et ses règles* ; `PLAN.md` décrit *l'avancement*.

---

## 1. Présentation du projet

**CertifyChain** est une plateforme **SaaS B2B** de **délivrance et de vérification de diplômes
numériques** par preuve cryptographique. Un établissement émet des diplômes signés (Ed25519, clé
propre à l'école sous racine PKI CertifyChain), l'élève les partage via un lien, et un recruteur
vérifie l'authenticité en < 10 s **sans compte** et **sans accéder au contenu** (divulgation minimale).

```
École (émetteur)      →   Élève (wallet)      →   Recruteur (vérif. publique)
signe le diplôme          reçoit + partage        clique le lien → résultat
(clé privée Ed25519)      un lien (≠ diplôme)     (nonce unique, < 2 s)
```
Aucun acteur n'a besoin d'être en ligne en même temps : **la preuve est autonome**.

Protocole (phase 1, implémenté) : challenge → **nonce à usage unique** (TTL 120 s, consommation
atomique) → preuve liée au nonce → vérification signature **et** certificat contre la racine PKI
**et** révocations → « Vérifié » (champs minimaux) ou échec. Phase 2 (SnarkJS/Groth16) derrière
l'interface `ProofEngine` — voir [`docs/architecture/decisions/0001-proof-engine-crypto-stack.md`](./docs/architecture/decisions/0001-proof-engine-crypto-stack.md).

## 2. Stack (verrouillée)

| Couche | Choix | Notes |
|---|---|---|
| Fronts ×3 | **Next.js 16** (App Router) · React 19 · TS strict | Server Components par défaut |
| Styling | **Tailwind CSS v4** | design system unique dans `packages/shared` |
| Animations | Framer Motion (déclaratif) · GSAP (timelines) | `prefers-reduced-motion` partout |
| Backend | **Hono + Node 22** (`apps/server`) | routes **chaînées** → RPC typé (voir §4) |
| Validation | **Zod** — contrat partagé `packages/contract` | serveur = source de vérité |
| DB / ORM | **PostgreSQL + Drizzle** | migrations SQL manuscrites `apps/server/drizzle/` (jamais `db:generate`) |
| Auth | JWT (jose) cookies httpOnly · **scrypt** (`node:crypto`, mdp admins) · OTP email (élèves) · **MFA TOTP** (écoles + admins) | réalms cookies isolés `cc_*` / `cc_admin_*` |
| Crypto | Ed25519 + nonce derrière `ProofEngine` · secrets AES-256-GCM (enveloppe `KeyVault`) | phase 2 : Groth16 |
| Infra | Docker multi-stage **distroless non-root**, compose durci | 1 compose racine + 1 compose **par app cliente** |
| Package manager | **pnpm 9** (workspace) | membres : `apps/client/*`, `apps/server`, `packages/*` |
| Admin & IA | SIRENE/INSEE (vérité SIRET) + Gemini (vérificateur conditionnel) | dégradation propre sans clés |

## 3. Architecture (monorepo pnpm)

```
_refactor/                       # ← LE projet (l'ancien arbre racine a été supprimé au swap 2026-07-07)
├─ apps/
│  ├─ client/
│  │  ├─ web/       # @certifychain/web    :3000 — landing + portail École + /verify/[token] (+ Dockerfile + compose)
│  │  ├─ wallet/    # @certifychain/wallet :3001 — portefeuille élève, /claim/[token] (+ Dockerfile + compose)
│  │  └─ admin/     # @certifychain/admin  :3002 — back-office plateforme, loopback par défaut (+ Dockerfile + compose)
│  └─ server/       # @certifychain/server :4000 — API Hono ; exporte `AppType` via "./rpc"
├─ packages/
│  ├─ contract/     # @certifychain/contract — dto, enums, errors, schemas (Zod) ; exports ./dto etc.
│  └─ shared/       # @certifychain/shared — ui ×18, styles, hooks, api (csrfFetch+unwrap), lib, config
├─ docs/            # architecture.md · ADR (decisions/) · audits
├─ dev/             # mocks compose-dev (proconnect-mock, coredns)
├─ docker-compose.yml (stack complète, name: certifychain) · docker-compose-dev.yml (Mailpit, pgweb, mocks, DB publiée)
├─ pnpm-workspace.yaml · package.json (orchestrateur) · tsconfig.base.json · .env(.example)
└─ CLAUDE.md · PLAN.md · PROGRESS.md · README.md · MIGRATION-SWAP.md
```

Règles de frontière :
- `packages/shared` est **100 % framework-serveur-free** : jamais de dépendance `hono`, drizzle,
  ni d'import depuis `apps/server` (anti-pattern arcadex, cf. `docs/architecture.md` §12.4).
- Les packages internes s'exportent **sans build step** (exports vers les sources `.ts/.tsx/.css`) ;
  chaque app cliente les déclare dans `transpilePackages`.
- Le web n'importe du serveur que **des types** (`import type { AppType }`) — effacés au build.

## 4. RPC typé (règle cardinale du backend)

Le serveur compose ses routes en **style chaîné** (`new Hono().get(...).post(...)`) et `app.ts`
exporte `export type AppType = ReturnType<typeof createApp>` (package export `"./rpc"`). Chaque
app cliente construit `hc<AppType>(API_BASE, { fetch: csrfFetch })` et enrobe chaque appel dans
`endpoints.ts` avec un retour **annoté DTO** : une dérive de route/schéma/réponse casse la
compilation client. Voir ADR [`0003-hono-rpc-typed-client.md`](./docs/architecture/decisions/0003-hono-rpc-typed-client.md).

⚠️ À respecter sous peine de perdre l'inférence :
- **Toute nouvelle route** doit être enregistrée en chaîné, middlewares intercalés dans la chaîne ;
  les déclarations (`const x = …`) se hissent **au-dessus** de la chaîne.
- Ne pas annoter le type de retour de `createApp()` ni celui des handlers (`Promise<Response>`
  efface l'inférence de `c.json`).
- `lib/validator.ts` est casté `as typeof honoZValidator` — **ne pas retirer ce cast** (l'inférence
  hc le traverse).
- La sonde `apps/server/src/rpc.type-test.ts` casse le typecheck si une route sort du style chaîné.
- Version de `hono` **alignée** entre `apps/server` et les 3 apps clientes.

## 5. Modèle de sécurité (inchangé dans l'esprit — détails : `docs/architecture.md` §12)

TLS via reverse-proxy (à ajouter avant mise en ligne : Caddy) · en-têtes durcis + CORS crédentiel
restreint · JWT courts + refresh rotation + statut école re-vérifié au refresh · CSRF double-submit
par réalm · rate-limits **par compte ciblé** (pas par IP) sur les flux auth, IP en garde-fou ·
clés privées écoles chiffrées AES-256-GCM (KeyVault) · logs JSON redaction PII · conteneurs
distroless non-root, `cap_drop: ALL`, rootfs read-only, DB sur réseau interne non publié.

## 6. Commandes (depuis la racine du workspace)

```bash
# ⚠️ Toolchain locale : node n'est PAS sur le PATH → fnm + corepack (pnpm@9.12.0 pinné).
#    PowerShell :  $env:PATH = "$env:APPDATA\fnm\node-versions\v24.16.0\installation;" + $env:PATH
#    Git Bash — piège : le shim corepack y échoue AVEC exit 0 → utiliser PowerShell (cf. PROGRESS.md).
corepack pnpm install

pnpm dev                # stack:dev = web + wallet + admin + api en parallèle
pnpm web:dev | wallet:dev | admin:dev | server:dev
pnpm build | lint | typecheck                 # -r sur tout le workspace
pnpm test               # 68 tests node:test (serveur)
pnpm db:migrate | db:seed | db:seed:admin     # scripts serveur (--env-file=../../.env)

# Docker — stack PROD durcie (db + api + 3 fronts)
docker compose up --build
# Docker — stack DÉV (+ Mailpit :8025, pgweb :8081, mocks ProConnect/DNS, DB publiée :5432)
docker compose -f docker-compose.yml -f docker-compose-dev.yml up --build
# Déploiement indépendant d'un front (compose par app, contexte ../../..)
docker compose -f apps/client/web/docker-compose.yml up --build

# Smoke E2E (44 checks : verify anti-rejeu, MFA école, claim, partage, OTP, admin)
docker compose -f docker-compose.yml -f docker-compose-dev.yml up -d
pnpm db:seed && pnpm smoke

# Vérification finale de référence = Docker (juge de paix) ; le host pnpm sert à itérer.
```

Convention compose : variables **non sensibles** dans les `docker-compose*.yml` ; **secrets**
uniquement dans `.env` (gitignoré — voir `.env.example`).

## 7. Conventions de code

- **TypeScript strict** partout (`noUncheckedIndexedAccess` inclus) ; pas de `any` non justifié.
- `"use client"` uniquement si nécessaire ; Server Components par défaut.
- **Config serveur** : toujours via `config/env.ts` (Zod, fail-fast) — jamais `process.env.X` en
  code produit (constat d'audit 2026-07-07).
- **Erreurs API** : contrat `{ error: { code, message, details } }` ; côté serveur `fail.*` +
  `zValidator` maison ; côté client `unwrap()` → `ApiClientError`.
- **UI** : réutiliser `packages/shared/src/ui` et les classes du design system — ne pas re-tripler.
- Lint avant PR (`pnpm lint`) ; le serveur doit `typecheck` + `test` sans erreur.
- **Next.js 16** : breaking changes — lire `node_modules/next/dist/docs/` au besoin.

## 8. Design system (source unique)

Style **liquid glassmorphism + neumorphism**, fond ivoire, accents indigo→cyan→magenta→orange.
Source de vérité : `packages/shared/src/styles/globals.css` (importé en relatif par chaque app,
avec `@source "../"` pour le scan Tailwind v4 du package). Classes à réutiliser telles quelles :

- Verre : `glass`, `glass-strong`, `glass-tint-{indigo,cyan,magenta}`, `glass-sheen`
- Neumorphisme : `neumorph`, `neumorph-sm`, `neumorph-inset`, `neumorph-pill`
- Dégradés/fonds : `grad-text`, `grad-text-cool`, `grad-ring`, `bg-mesh`, `bg-dots`, `noise`
- CTA/interactions : `cta-primary`, `cta-ghost`, `lift`, `tilt-3d`, `hover-glow`, `cursor-glow`
- Animations : `animate-{float-slow,float-slower,drift-chip-*,spin-slow,spin-slower,pulse-soft,pulse-ring,scan,shimmer,marquee,dash,arrow-wave,morph}`
- Typo : `font-display` (Space Grotesk), `font-body` (Inter), `font-elegant` (Outfit)
- Tokens : `ink`, `ink-soft`, `muted`, `muted-soft`, `hairline`, `indigo-{600,500,100}`,
  `cyan-{500,100}`, `magenta-{500,100}`, `success`, `danger`, `ivory`, `surface`

Patterns : cartes `rounded-[1.75rem]`, badges pilule à point `pulse-ring`, anneau `grad-ring`,
tuiles KPI `neumorph-sm`, révélations scroll (GSAP) + entrées (Framer Motion).

## 9. Logging automatique dans Obsidian

Vault : `C:\Users\alexa\Documents\obsidian\CertyChaine`

- **Début de session** : lire `vault/context/stack.md` et `vault/context/session-courante.md`.
- **Décision technique** : `vault/decisions/[sujet]-[date].md` (problème, options, décision + pourquoi).
- **Bug résolu** : append dans `vault/logs/bugs.md` (description, cause, solution).
- **Fin de session** : mettre à jour `vault/context/session-courante.md` (fait / en cours / blocages / suite).
- **Nouvelle dépendance** : mettre à jour `vault/context/stack.md`.
- Frontmatter YAML : `date`, `projet`, `tags: [décision|bug|session|stack]`.

## 10. Règle de maintenance de PLAN.md (IMPORTANT)

Pendant tout développement : **tenir `PLAN.md` à jour en continu** — tâches faites, en cours,
bugs (cause + correctif), reste à faire. Objectif : reprise à froid immédiate. Le journal de la
refonte monorepo (étapes 0–10, pièges) reste figé dans `PROGRESS.md`.

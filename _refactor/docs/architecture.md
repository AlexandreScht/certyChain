# Architecture cible — CertifyChain (monorepo)

> **Portée de ce document.** Ceci décrit uniquement l'**architecture cible** (arborescence, découpage en packages, conventions). Ce n'est **pas** un plan d'exécution — la migration elle-même (ordre des étapes, todo-list) ira dans `PLAN.md` le jour où elle sera lancée. `arcadex/` a servi de modèle d'inspiration ; il sera supprimé après cette analyse et **n'apparaît pas** dans l'arborescence ci-dessous.
>
> Basé sur l'analyse du repo actuel (state au 2026-07-06, 70% conformité cahier des charges, MVP complet mais non prod-ready — voir `PLAN.md`) et de `arcadex/` (monorepo Turborepo/pnpm : `apps/client/*` + `apps/server` + `shared/` + `types/`, stack Elysia/Bun/better-auth/Eden Treaty).

---

## 1. Objectifs

1. **Éliminer la duplication de code** entre `src/` (web), `wallet/`, `admin/` — aujourd'hui trois apps Next.js qui **copient-collent** le même design system, le même client API, les mêmes hooks de session.
2. **Un typage fort de bout en bout** : un changement de schéma côté API doit casser la compilation côté client immédiatement, sans resynchronisation manuelle.
3. **Un monorepo lisible pour une reprise à froid** : n'importe qui (ou futur-toi) doit comprendre en 30 secondes où vit quoi.
4. **Ne pas copier `arcadex/` bêtement** : sa stack (Elysia/Bun, better-auth, Eden Treaty, Redis, Winston) est **différente** de celle de CertifyChain (Hono/Node, JWT jose + argon2 + OTP, Zod, pino). On reprend la **forme** du monorepo (répartition apps/shared/contract, packages internes sans étape de build, conventions d'alias), pas la stack technique.
5. Rester cohérent avec les décisions déjà verrouillées dans `CLAUDE.md` §2 et `PLAN.md` §« Décisions d'architecture verrouillées » — cette réorganisation est **structurelle**, pas un changement de stack.

---

## 2. Ce qu'on reprend d'`arcadex/`, ce qu'on adapte

| Aspect arcadex | Repris tel quel ? | Pourquoi |
|---|---|---|
| `apps/client/*` (plusieurs front) + `apps/server` (un seul back) | ✅ Oui | Correspond exactement au besoin CertifyChain : 3 front (web, wallet, admin) + 1 API |
| `shared/` : package interne sans étape de build (exports → `.ts`/`.tsx`/`.css` bruts) | ✅ Oui, mécanisme identique | Le plus gros gain : zéro duplication, zéro build step supplémentaire à maintenir |
| `types/` : package 100% `.d.ts` ambiants | ⚠️ Adapté → devient `contract/` | Arcadex n'a pas besoin de valeurs runtime dans son package de types car **Eden Treaty** infère les types directement des routes Elysia. Hono n'a pas d'Eden — CertifyChain a déjà un contrat **Zod** (`server/src/contract`) qui, lui, porte de la vraie validation runtime. On garde ce contrat mais on le sort dans son propre package workspace, sans le réduire à de l'ambiant pur (voir §5). |
| Turborepo (cache, orchestration des tâches) | 🟡 **Différé** (tranché, §11.1/§12.2) | Aucun gain mesurable tant que la vérification se fait via `docker compose` et non un toolchain local quotidien — chez `arcadex` lui-même la tâche `dev` de turbo est `cache:false`. Réévaluer sur déclencheur concret (CI, >6 membres workspace, build Docker local ralenti). |
| Biome (lint + format unifié) | ❌ **Écarté pour le lint** (tranché, §11.2/§12.2) | Resterait envisageable plus tard en tant que *formatter* pur, en complément d'ESLint — jamais à sa place. Même `arcadex` (repo cité en référence) ne fait pas confiance à Biome pour le lint de son app Next : `next lint`/`eslint-config-next` reste le script exécuté chez eux aussi. |
| Elysia + Bun + Eden Treaty + better-auth + Redis + Winston | ❌ Non | Stack verrouillée différente (Hono/Node, JWT jose, argon2, OTP, Zod, pino) — voir §10 |
| `.claude/agents/*.md` par domaine métier | ❌ Hors scope | Concerne l'outillage Claude Code, pas l'architecture applicative |
| Docs ADR (`docs/architecture/decisions/`) | ✅ Bonne pratique à adopter | Format léger, utile pour tracer les choix (crypto ProofEngine, validation SIRENE+Gemini, etc.) déjà pris mais jamais formalisés en ADR |

---

## 3. Arborescence cible

```
CertifyChain/
├─ apps/
│  ├─ client/
│  │  ├─ web/                  # @certifychain/web     — landing + portail École (ex-racine src/)
│  │  ├─ wallet/                # @certifychain/wallet  — portefeuille élève (inchangé de place)
│  │  └─ admin/                 # @certifychain/admin   — back-office plateforme (inchangé de place)
│  └─ server/                   # @certifychain/server  — API Hono (ex-racine server/)
│
├─ packages/
│  ├─ shared/                   # @certifychain/shared  — UI, hooks, providers, client API générique, styles
│  │  └─ src/
│  │     ├─ ui/                 # Button, Card, Badge, Input, Field, Textarea, Select, Stat, Table,
│  │     │                       # Modal, Toast, Spinner, Skeleton, EmptyState, PageHeader, GlassPanel,
│  │     │                       # ThemeToggle — aujourd'hui triplés à l'identique dans les 3 apps
│  │     ├─ shell/               # Primitives de chrome applicatif (logo slot, logout button, background
│  │     │                       # glass/mesh, ThemeToggle+Toast déjà montés) — PAS un AdminShell/WalletShell
│  │     │                       # fusionné (layouts réellement différents : sidebar+drawer vs topbar simple)
│  │     ├─ hooks/               # useSession/useRequireRole (paramétrés par le realm cookie), useTheme
│  │     ├─ providers/           # ToastProvider, ThemeProvider, AppProviders factory (guard de rôle + shell)
│  │     ├─ api/                 # client.ts générique (fetch + CSRF double-submit + ApiClientError),
│  │     │                       # paramétré par { csrfCookieName, baseUrl } — 95% identique aujourd'hui
│  │     │                       # entre web/admin/wallet, seuls `endpoints.ts` (routes par realm) restent
│  │     │                       # dans chaque app
│  │     ├─ lib/                 # cn(), autres utils transverses (mask.ts reste server-only, voir §12.3)
│  │     └─ styles/               # globals.css : tokens glass/neumorph/grad (source unique de vérité design)
│  │
│  └─ contract/                 # @certifychain/contract — ex server/src/contract, sorti en package workspace
│     └─ src/
│        ├─ enums.ts             # DiplomaStatus, Role, SchoolStatus, VerificationResult, …
│        ├─ dto.ts               # Types des réponses API (SchoolDTO, DiplomaDTO, DiplomaListDTO, …)
│        ├─ schemas.ts           # Schémas Zod de validation des requêtes (utilisés par le serveur ET,
│        │                       # en option, par les formulaires client pour une pré-validation identique)
│        └─ errors.ts            # ErrorCode, ApiError — vocabulaire d'erreur partagé
│
├─ docs/
│  └─ architecture/
│     └─ decisions/              # ADR légers : 0001-proof-engine.md, 0002-school-validation-sirene-gemini.md, …
│
├─ docker-compose.yml, docker-compose-dev.yml   # inchangés dans l'esprit, contextes de build mis à jour (§8)
├─ pnpm-workspace.yaml            # packages: apps/client/*, apps/server, packages/*
├─ turbo.json                     # optionnel (§7)
├─ tsconfig.json                  # base racine (compilerOptions communes), pas de alias de contournement
├─ package.json                   # scripts d'orchestration (dev/build/docker), racine du workspace
├─ CLAUDE.md / PLAN.md / README.md
└─ .env.example
```

Différence volontaire avec `arcadex/` : les packages internes sont regroupés sous **`packages/`** (`packages/shared`, `packages/contract`) plutôt que posés à plat à la racine comme `shared/` et `types/` chez arcadex. C'est la convention la plus répandue dans l'écosystème Turborepo/pnpm (le split visuel `apps/` = déployable, `packages/` = bibliothèque interne est immédiat) et elle scale mieux si un jour un 3ᵉ package interne apparaît (ex. `packages/proof-engine` si la phase 2 SnarkJS mérite d'être partagée entre `server` et un futur outil CLI de vérification offline).

---

## 4. Détail par workspace

### 4.1 `apps/client/web` (ex-racine `src/`)
Reste la landing publique + le portail École (`(school)/ecole/*`) + la page publique `verify/[token]`. Ne change pas de responsabilité, seulement d'adresse : `src/` → `apps/client/web/src/`. Les imports internes (`@/*`) restent identiques ; ce qui change, c'est que `components/ui/*`, `lib/api/client.ts`, `hooks/useSession.ts` **disparaissent** de cette app au profit d'imports depuis `@certifychain/shared/*`.

### 4.2 `apps/client/wallet` et 4.3 `apps/client/admin`
Même traitement : chaque app garde son domaine métier propre (pages, `endpoints.ts` spécifiques au realm, composants métier comme `DiplomaCard`, `ScoreGauge`, `SharePanel`) mais délègue tout le design system générique + l'infrastructure API à `shared/`.

### 4.4 `apps/server` (ex-racine `server/`)
Structure interne **déjà saine, ne change pas** : `modules/{feature}/{feature}.routes.ts` + `.service.ts`, `crypto/`, `middleware/`, `lib/`, `db/`, `scripts/`. Seul changement : `src/contract/*` est retiré (déplacé vers `packages/contract`) et redevient une dépendance `workspace:*` comme les autres consommateurs, au lieu d'un sous-dossier interne référencé depuis l'extérieur par un alias `../server/src/contract`.

### 4.5 `packages/contract`
C'est le **contrat d'API** : la seule source de vérité sur la forme des requêtes/réponses. Deux sous-exports distincts (amélioration par rapport au `types/` d'arcadex, voir §5) :
- `@certifychain/contract` → enums, DTOs, codes d'erreur : **type-only**, importable partout (`import type`), erasable au build, zéro risque de fuite de code serveur vers le bundle client.
- `@certifychain/contract/schemas` → les schémas Zod eux-mêmes (valeurs runtime) : consommés par le serveur pour la validation des requêtes (`@hono/zod-validator`), et **optionnellement** par un formulaire client qui voudrait valider en local avant l'envoi, avec exactement la même règle que le serveur (ex. le pattern SIRET 14 chiffres mentionné dans le client API actuel).

### 4.6 `packages/shared`
Le cœur de l'élimination de duplication. Preuves concrètes relevées dans le repo actuel qui justifient chaque sous-dossier :
- `components/ui/Badge.tsx` est **strictement identique** (au caractère près, hors un commentaire) dans `src/`, `admin/`, `wallet/` → `shared/src/ui/Badge.tsx`, un seul fichier.
- `lib/api/client.ts` est identique à ~95 % entre les 3 apps (seule différence : le nom du cookie CSRF par realm — `cc_csrf` vs `cc_admin_csrf` — et l'ensemble des méthodes HTTP supportées) → `shared/src/api/client.ts` paramétré par `{ csrfCookieName }`, `endpoints.ts` (spécifique par realm) reste dans chaque app.
- Les CSP/security headers des 3 `next.config.ts` sont identiques à 90 % (seuls `Referrer-Policy`, `X-Robots-Tag` et `outputFileTracingRoot` diffèrent) → `shared/src/config/securityHeaders.ts`, une fonction `buildSecurityHeaders(overrides)` appelée par chaque `next.config.ts`.
- `AdminShell`/`WalletShell` (et le futur école `AppShell`) : **ne pas** les fusionner en un seul composant — leurs layouts diffèrent réellement (sidebar fixe + drawer mobile pour l'admin vs topbar simple pour le wallet). En revanche les morceaux communs (glass/mesh background, `ThemeToggle`, bouton logout qui appelle `logout()` + `useToast` + `router.replace('/login')`, le slot logo) migrent dans `shared/src/shell/` comme primitives réutilisables ; chaque app compose sa propre disposition avec ces primitives.
- `useSession`/`useRequireRole` : la logique (fetch `/auth/me`, redirection si rôle absent, polling éventuel) est identique ; seul le **realm cookie** et la route de login diffèrent → `shared/src/hooks/useSession.ts` paramétré.

### 4.7 `docs/architecture/decisions/`
Format ADR léger (voir `arcadex/docs/architecture/decisions/0001-auth-stack.md` comme modèle de structure : Contexte → Décision → Alternatives → Conséquences). Utile ici pour des choix déjà faits mais non documentés formellement : le choix `ProofEngine` Ed25519+nonce vs SnarkJS immédiat, le pipeline de validation école SIRENE+Gemini (pourquoi SIRENE en source de vérité et Gemini seulement en vérificateur conditionnel), le choix cookies séparés par realm (`cc_*` vs `cc_admin_*`).

---

## 5. Typage fort de bout en bout

Le point où on **s'écarte volontairement** d'arcadex, avec justification technique :

- **Arcadex** : Elysia expose son `App` type ; `@elysiajs/eden`'s `treaty<App>()` côté client **infère automatiquement** les types de chaque route (corps, réponse, erreurs) sans schéma dupliqué. Le package `types/` n'a donc besoin que d'ambiant (`.d.ts`) — la validation runtime réelle est un sujet séparé (`shared/middlewares/validator.ts` + `zodErrorMap.ts`).
- **CertifyChain (Hono)** n'a pas d'équivalent Eden par défaut, mais **a déjà** un contrat Zod maintenu à la main (`server/src/contract`) qui, lui, porte de la validation runtime réelle des deux côtés du réseau si on veut. C'est en réalité **plus fort** que l'approche ambiant-only d'arcadex sur ce point précis : un même schéma Zod peut valider une requête aussi bien côté serveur (source de vérité) que côté client (pré-validation d'un formulaire, message d'erreur immédiat sans aller-retour réseau) — voir §4.5.
- **Piste d'amélioration future (non bloquante, à évaluer séparément)** : Hono propose son propre client RPC typé (`hono/client`, `hc<AppType>()`), l'équivalent direct d'Eden Treaty, si les routes sont définies avec le style chaîné (`.get().post()...`) et que le type `AppType` du serveur est exporté. Ça donnerait à CertifyChain l'inférence de bout en bout automatique qu'a arcadex, **sans changer de framework**. C'est un chantier server-side non trivial (retyper les routes en chaîné) — à documenter en ADR si décidé, hors scope de cette réorganisation de dossiers.

Flux de types résultant :
```
packages/contract/src/schemas.ts (Zod)
        │
        ├─→ apps/server : @hono/zod-validator, validation des requêtes entrantes
        │
        └─→ packages/contract/src/dto.ts (types dérivés/parallèles, réponses)
                    │
                    ├─→ apps/client/web    (import type, erasable au build)
                    ├─→ apps/client/wallet (import type, erasable au build)
                    └─→ apps/client/admin  (import type, erasable au build)
```

---

## 6. Conventions transverses

- **Packages internes sans étape de build.** `packages/shared` et `packages/contract` exposent leur code source `.ts`/`.tsx`/`.css` directement via le champ `exports` du `package.json` (mécanisme vérifié dans `arcadex/shared/package.json` : `"./hooks/*": "./src/hooks/*.ts"`, `"./providers/*": "./src/providers/*.tsx"`, etc. — pas de `dist/`, pas de watch supplémentaire). Chaque app les déclare comme vraie dépendance `"@certifychain/shared": "workspace:*"` (pas un alias `../..` qui traverse le filesystem comme l'actuel `@contract/*`). Next.js doit ajouter ces packages à `transpilePackages` dans chaque `next.config.ts` client ; `apps/server` (via `tsup`) les bundle nativement.
- **Alias TS par app**, inchangés dans leur esprit : `@/*` → `./src/*` dans chaque app cliente, `@/*` → `./src/*` dans `apps/server`. Ce qui disparaît : l'alias de contournement `@contract/*` pointant hors du package (remplacé par un vrai import `@certifychain/contract`).
- **Nommage des packages** : scope npm existant `@certifychain/*` conservé et étendu (`@certifychain/web`, `@certifychain/wallet`, `@certifychain/admin`, `@certifychain/server`, `@certifychain/shared`, `@certifychain/contract`).
- **TypeScript strict partout**, y compris dans les packages internes (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` déjà en place côté serveur — à étendre à `packages/shared` et `packages/contract`).

---

## 7. Tooling monorepo

- **pnpm workspaces** reste le gestionnaire (`pnpm-workspace.yaml` : `apps/client/*`, `apps/server`, `packages/*`).
- **Turborepo** : **différé** (décision tranchée en §11.1/§12.2, pas juste « optionnel ») — aucun `turbo.json` avant que l'arborescence `apps/*`/`packages/*` soit stabilisée, et seulement sur déclencheur concret (CI, croissance réelle du nombre de membres, ralentissement mesuré du build Docker local par des reconstructions redondantes de packages internes). Peut s'ajouter **après coup**, sans toucher à l'arborescence ci-dessus.
- **Lint/format** : ESLint par app (`eslint-config-next`) conservé par défaut — le sujet Biome (unifié, plus rapide, mais migration des règles Next-spécifiques à valider) reste un **point ouvert** séparé, pas un pré-requis à cette réorganisation.
- **Scripts racine** (`package.json`) : même logique qu'aujourd'hui (`stack:dev` via `concurrently`, filtres `--filter @certifychain/*`), adaptés aux nouveaux chemins.

---

## 8. Impact Docker / déploiement

Le `docker-compose.yml` actuel construit chaque image avec `context: .` (racine du repo, pour que le lockfile pnpm du workspace soit dans le contexte) et un `dockerfile:` par app (`server/Dockerfile`, `admin/Dockerfile`, `wallet/Dockerfile`, `Dockerfile.web`). Seuls les chemins `dockerfile:` changent (ex. `server/Dockerfile` → `apps/server/Dockerfile`, `Dockerfile.web` → `apps/client/web/Dockerfile`) ; `context: .` reste la racine dans tous les cas puisque chaque Dockerfile doit désormais copier `packages/shared` et `packages/contract` en plus de son propre dossier avant `pnpm install --frozen-lockfile` (étape multi-stage à mettre à jour dans chaque Dockerfile pour inclure les nouveaux packages workspace). Le réseau, les healthchecks, le hardening (distroless non-root, `cap_drop: [ALL]`, `read_only`, ports par service) ne changent pas.

---

## 9. Correspondance ancien → nouveau chemin (extrait représentatif)

| Aujourd'hui | Demain |
|---|---|
| `src/` (racine) | `apps/client/web/` |
| `wallet/` | `apps/client/wallet/` |
| `admin/` | `apps/client/admin/` |
| `server/` | `apps/server/` |
| `server/src/contract/{enums,dto,schemas,errors}.ts` | `packages/contract/src/{enums,dto,schemas,errors}.ts` |
| `src\|admin\|wallet/src/components/ui/*` (triplé) | `packages/shared/src/ui/*` (unique) |
| `src\|admin\|wallet/src/lib/api/client.ts` (triplé à 95%) | `packages/shared/src/api/client.ts` (unique, paramétré) |
| `src\|admin\|wallet/src/lib/utils.ts` (`cn()`, triplé) | `packages/shared/src/lib/cn.ts` |
| `admin/src/hooks/useSession.ts`, `wallet/src/hooks/useSession.ts`, `src/hooks/useSchoolSession.tsx` | `packages/shared/src/hooks/useSession.ts` (paramétré par realm) |
| CSP dans les 3 `next.config.ts` | `packages/shared/src/config/securityHeaders.ts` + petit `next.config.ts` par app |
| `admin/src/components/admin/AdminShell.tsx`, `wallet/src/components/wallet/WalletShell.tsx` | Restent par app, mais composés à partir de `packages/shared/src/shell/*` |
| `@contract/*` (alias de contournement dans chaque `tsconfig.json`) | `@certifychain/contract` (dépendance workspace déclarée) |

---

## 10. Ce qui NE change PAS (stack verrouillée, cf. `CLAUDE.md` / `PLAN.md`)

- Backend **Hono** + Node — pas de bascule vers Elysia/Bun.
- Auth **JWT (jose) + argon2 (écoles) + OTP email (élèves) + TOTP (MFA admin/école)** — pas de bascule vers better-auth.
- **Zod** comme unique outil de validation — pas de perte du contrat existant, seulement un changement d'adresse.
- **Drizzle + PostgreSQL**, migrations versionnées — inchangé.
- **ProofEngine Ed25519+nonce** (phase 1), couture vers SnarkJS/Groth16 (phase 2) — inchangé.
- Design system **glass/neumorph/grad** — les classes Tailwind restent les mêmes, seul leur fichier source (`globals.css`) est dédupliqué.
- Docker durci (distroless non-root, `cap_drop: [ALL]`, réseau `backend` interne pour la DB) — inchangé dans l'esprit.

---

## 11. Points ouverts — tranchés (analyse comparative du 2026-07-06)

Les 4 questions laissées ouvertes dans la version précédente de ce document ont été tranchées par une analyse comparative dédiée (CertifyChain actuel vs `arcadex/` vs cahier des charges — méthode et détail complet en §12). Ces décisions n'affectent toujours pas l'arborescence cible décrite en §3 — elles portent sur *comment* et *quand* y arriver ; le séquencement d'exécution concret (dates, PR) reste du ressort de `PLAN.md` le jour où la migration est lancée.

### 11.1 Turborepo : maintenant, après, ou jamais ?

**Différé, sans date fixe.** Ne pas écrire `turbo.json` avant la réorganisation de dossiers. Ne l'ajouter que sur un déclencheur concret parmi :
1. une CI apparaît et le temps de build agrégé y devient un coût perçu ;
2. le nombre de membres workspace dépasse significativement les 6 actuels ;
3. `docker compose up --build` devient perceptiblement lent à cause de reconstructions redondantes de `packages/*` (vérifier d'abord l'ordre des `COPY` dans les Dockerfiles avant de conclure qu'il faut turbo — c'est souvent la vraie cause).

Preuve décisive : chez `arcadex` lui-même, la tâche `dev` de turbo est déclarée `cache: false` — turbo n'y apporte donc **aucun** gain au quotidien, seulement un multiplexage de logs que `concurrently` (déjà utilisé ici pour `stack:dev`) fait tout aussi bien. Le seul vrai bénéfice de turbo (cache de build/lint/test) n'a de valeur mesurable qu'en CI ou avec des artefacts lourds répétés à l'identique — deux conditions absentes tant que la vérification se fait via `docker compose` et non un toolchain pnpm/tsc local quotidien. Écrire la config maintenant, avant que le graphe de dépendances de build (`contract`→`server`/apps, `shared`→apps) soit stabilisé, reviendrait à la rédiger deux fois pour rien.

### 11.2 ESLint ou Biome ?

**Garder ESLint** (`eslint-config-next`) comme linter dans les 3 apps clientes. Biome reste une option future, mais **uniquement** comme *formatter* pur en complément d'ESLint (jamais à sa place), pour combler l'absence actuelle de tout formatter — non urgent, optionnel.

Preuve décisive, empirique et non théorique : `arcadex` — le repo cité en référence pour l'adoption de Biome — ne lui fait **pas** confiance pour le lint de sa propre app Next (`apps/client/hub/package.json` : le script `lint` reste `next lint`, jamais `biome lint`/`biome check`) et dégrade ses propres règles Biome les plus sensibles (`suspicious.noExplicitAny`, `correctness.useExhaustiveDependencies`) en simple avertissement (`biome.json`). `eslint-config-next` porte des règles React 19/RSC/App Router (`rules-of-hooks`, `exhaustive-deps`, conventions App Router) sans équivalent officiel Biome à ce jour. Basculer serait copier un choix que le modèle lui-même n'a pas fait, avec un vrai risque de régression sur ces garde-fous pour un solo dev sans reviewer pour rattraper les violations à la main.

### 11.3 Explorer `hono/client` (équivalent Eden Treaty) ?

**Différé, non prioritaire.** Le confort d'inférence automatique qu'apporterait `hc<AppType>()` reste marginal face au client fetch typé actuel (`@contract/*` en `import type`). Si exploré un jour, une règle stricte s'impose : n'importer que le **client typé généré** (des types, jamais un runtime), toujours depuis `packages/shared`/`packages/contract`, jamais le framework serveur Hono lui-même — voir l'anti-pattern identifié chez `arcadex` en §12.5, à ne surtout pas reproduire.

### 11.4 Ordre de migration pour `packages/shared` — par quoi commencer ?

Confirmé par des preuves de fraîcheur mesurées en direct dans le `git status` du repo au moment de l'analyse (détail complet en §12.4) : la duplication n'est plus un risque théorique, c'est une dérive **active**. Ordre retenu, en 3 vagues, sans étape de build (package `workspace:*`, exports par sous-chemin vers les fichiers source, comme en §6) :

1. **Maintenant** — `ui` (`Badge.tsx`, `Input.tsx`) + les tokens CSS partagés de `globals.css` : les deux zones où la dérive vient d'être observée en direct.
2. **Ensuite** — les helpers API triplés (`client.ts`, le petit helper `toQuery()`) : mécaniques et à faible risque.
3. **Plus tard, non urgent** — `shell` (background glass/mesh, `ThemeToggle`, logo slot) et un composant partagé pour le pattern de formulaire OTP (login vs claim) : demandent une vraie réflexion de composition (props/slots), et la duplication y reste aujourd'hui plus locale (intra-app pour l'OTP), donc moins pressante.

---

## 12. Analyse technologique complémentaire — cahier des charges, `arcadex/`, état réel du code (2026-07-06)

> **Méthode.** Workflow multi-agents : 5 audits indépendants (backend actuel, patterns réutilisables de `arcadex/`, tooling monorepo, écarts vs cahier des charges, fraîcheur de la duplication front) ayant lu le **code réel** des deux projets (pas seulement leur documentation), puis une synthèse qui réconcilie l'ensemble. Objectif : trancher, pour chaque axe technique, entre *garder tel quel*, *faire évoluer en place* (sans nouvelle dépendance), *adopter une dépendance externe*, *différer*, ou *rejeter une suggestion du cahier des charges* — toujours du point de vue d'un développeur **solo, contraint en budget**, qui vérifie ce projet via `docker compose` et non un toolchain local quotidien. Ces axes touchent au code d'exécution (sécurité, fiabilité, tests), pas à l'arborescence de dossiers décrite en §3 — leur mise en œuvre concrète (migrations, séquencement, dates) relève de `PLAN.md`, conformément à la portée de ce document.

### 12.1 Cahier des charges vs implémentation réelle

Le cahier des charges (§4) suggère une stack cible différente sur plusieurs points (Elysia/NestJS, SnarkJS/Circom ou Polygon ID, Supabase, Vercel+Railway/Fly, HSM/Vault). Vérifié point par point contre le code réel :

| Exigence du cahier des charges | Verdict | Justification |
|---|---|---|
| Backend « Elysia / NestJS ou équivalent » | ✅ Remplie autrement | Le cahier des charges dit lui-même « ou équivalent » — Hono est un équivalent direct, et même préférable pour un solo dev buildant via Docker (moins de boilerplate DI, image plus petite). Zod systématique + contrat typé partagé respectent l'esprit visé. |
| ZKP réel (SnarkJS/Circom Groth16 ou Polygon ID) | ❌ Suggestion à ne pas suivre maintenant | Investissement disproportionné pour un pilote solo dev (trusted setup, circuits à auditer, temps de preuve plus longs). Le protocole Ed25519+nonce actuel remplit déjà les garanties opérationnelles utiles (authenticité, anti-rejeu, non-divulgation, révocation temps réel), honnêtement documenté comme tel en §4. Le vrai chantier à faire maintenant n'est pas Groth16 lui-même mais préparer l'interface `ProofEngine` à son arrivée (§12.2). |
| HSM / Vault HashiCorp pour les clés privées école | ⚠️ Écart réel, mais partiel | Les clés privées école sont déjà chiffrées au repos (enveloppe AES-256-GCM) — défense en profondeur réelle. Le vrai trou : la clé racine PKI et la master key de chiffrement elle-même vivent en variable d'environnement Docker en clair. Un HSM matériel ou un Vault complet serait disproportionné pour un pilote solo ; remédiation adaptée en §12.2. |
| Base de données Supabase | ❌ Suggestion à ne pas suivre | Ajouterait une dépendance opérationnelle externe (compte tiers, facturation, migration hors contrôle) sans gain net face au Postgres self-hosted déjà isolé sur réseau Docker interne, avec ORM typé et migrations versionnées — important pour la maîtrise RGPD des données d'identité. |
| Infrastructure Vercel + Railway/Fly.io (split par service) | ✅ Remplie autrement | Le split reste une option ouverte (Next.js standalone le permettrait), mais le déploiement unifié via `docker-compose` est plus simple à opérer en solo (un seul endroit à surveiller, pas de CORS/cookies cross-origin entre 3 domaines, pas de facturation multi-provider). |
| TLS 1.3 en transit | ⚠️ Écart réel | Le `docker-compose.yml` actuel n'inclut aucun reverse proxy TLS ; les ports sont exposés en HTTP direct. Pas un défaut de conception (terminer TLS au niveau reverse-proxy est standard) mais un vrai gap opérationnel avant tout pilote avec de vraies PII. Remédiation en §12.2. |
| Audit log (date, identifiant anonymisé, résultat) | ✅ Remplie et dépassée | Table `audit_log` typée (enum Drizzle), séparation school/diploma, anonymisation IP salée dédiée. Aucun gap. |
| Résultat de vérification binaire pour le recruteur (Vérifié/Introuvable) | ⚠️ Écart réel, mineur | 5 états exposés publiquement (`verified/not_found/revoked/expired/invalid`) au lieu de 2. Argument sécurité/RGPD légitime : ne pas renseigner un attaquant sur le *pourquoi* d'un échec. Fusionner l'affichage **public** en 2 états, garder les 5 en interne (dashboard école + audit log) — couche de présentation uniquement, effort trivial. |
| Fonctionnalités hors périmètre ajoutées (SIRENE+Gemini, Stripe, ProConnect, MFA TOTP, claim élève) | ℹ️ Hors scope, mais cohérent | Ajouts de valeur produit qui renforcent des exigences implicites du cahier des charges (SIRENE renforce la véracité de l'établissement — condition implicite pour que « l'école » du protocole soit une entité de confiance réelle). Aucune action requise ; garder conscience que ce périmètre élargi consomme du temps qui pourrait sinon aller aux gaps prioritaires ci-dessous. |

### 12.2 Axes techniques à faire évoluer (hors réorganisation de dossiers)

Aucun de ces axes ne remet en cause la stack verrouillée en §10 (Hono/JWT+OTP/Zod/Drizzle/Docker durci) — ce sont des évolutions à l'intérieur de cette stack.

| Axe | État actuel | Décision | Priorité |
|---|---|---|---|
| TLS en transit | Aucun reverse proxy TLS dans `docker-compose.yml`, ports exposés en HTTP direct | **Adopter Caddy** comme service optionnel du compose PROD (TLS automatique Let's Encrypt, config ~10 lignes) avant toute mise en ligne publique — seule nouvelle dépendance opérationnelle justifiée par cette analyse | 🔴 Haute |
| Secrets racine (clé privée PKI + master key AES) | En variable d'environnement Docker en clair | **Migrer vers des Docker secrets** (fichier monté en tmpfs, invisible via `docker inspect`/`/proc/environ`) + documenter une cérémonie de génération/rotation. Pas de HSM/Vault complet pour l'instant (disproportionné pour un pilote solo) | 🔴 Haute |
| Rotation / réutilisation du refresh-token | `refresh_sessions` sans `family_id` ; un token déjà tourné et un token inconnu prennent le même chemin (401) — aucune détection de vol de session | **Faire évoluer en place** (aucune nouvelle dépendance) : ajouter `family_id`/`replaced_by_id`, détecter la réutilisation (token trouvé mais déjà révoqué) → révoquer toute la famille + événement d'audit dédié | 🔴 Haute |
| Rate-limiting entrant | Fenêtre fixe en mémoire (`Map`), clé IP/compte selon la route, mono-instance par construction | **Faire évoluer en place** : passer à un sliding-window log en mémoire (ferme le seul vrai défaut algorithmique) et étendre le seau par-identifiant (déjà présent sur le login) aux routes signup/OTP/forgot-password. N'introduire Redis que le jour où une 2ᵉ instance API est déployée | 🟠 Moyenne |
| Typage `ProofEngine` (préparation Phase 2 Groth16) | Types Ed25519 concrets exposés (`publicKeyPem`, `signatureB64`…), pas de discriminant — le swap Groth16 casserait `verify.routes.ts` | **Faire évoluer en place** : discriminated union sur un champ `engine` littéral, à traiter dans une fenêtre calme, sans démarrer SnarkJS/Circom maintenant | 🟠 Moyenne |
| États de vérification publics (5 → 2) | `verified/not_found/revoked/expired/invalid` tous exposés à `/verify` | Fusionner en 2 états côté présentation publique uniquement (Vérifié/Introuvable), garder les 5 en interne | 🟠 Moyenne |
| Provider email production | Client SMTP maison (déjà 100 % compatible Resend SMTP sans changer une ligne) ; aucun provider prod souscrit | Garder le client maison. Action réellement nécessaire : souscrire un provider (Resend ou équivalent) avant tout envoi commercial — pas un chantier de code | 🔴 Haute (action hors-code) |
| Logging applicatif | Logger maison ~60 lignes, JSON→stdout, redaction PII par allowlist, niveau figé sur `NODE_ENV` | Garder l'architecture (pas de winston/pino — la rotation sur disque casserait le rootfs read-only des conteneurs, cf. §5). Faire évoluer : niveau configurable via `LOG_LEVEL`, propager le `request-id` dans chaque log | 🟢 Basse |
| Stratégie de tests | 59 tests `node:test` natif côté serveur (fonctions pures : crypto, rate-limit, TOTP, IP RGPD…) ; zéro test d'intégration sur les routes à écriture DB ; zéro test frontend | Garder `node:test` natif (pas de vitest/jest). Étendre le pattern `app.request()` déjà utilisé (`rate-limit.test.ts`) à quelques tests d'intégration sur les routes sensibles (login+OTP, `verify.routes.ts`, émission de diplôme) | 🟠 Moyenne |
| Validation d'environnement | Zod fait-maison (`env.ts`), gère déjà les pièges classiques (coercion stricte des booléens, fail-fast) | Garder tel quel — ne pas adopter `envalid` : introduirait un 2ᵉ paradigme de validation pour un gain nul (Zod est déjà l'outil utilisé partout ailleurs dans le projet) | 🟢 Basse |
| Throttle des appels sortants (SIRENE/INSEE, Gemini) | Aucun plafonnement identifié | Porter un petit token-bucket in-process (~40 lignes, zéro dépendance, pattern vu chez `arcadex`) pour lisser les appels et maîtriser les coûts/quotas | 🟢 Basse |
| Documentation ADR | Aucun `docs/architecture/decisions/` | Adopter le gabarit (voir §12.5) | 🟠 Moyenne |

### 12.3 Duplication frontend — fraîcheur confirmée + nouvelles découvertes

Les constats de duplication déjà documentés en §4.6 ont été revérifiés contre l'état réel du code et le `git status` en cours au moment de l'analyse (qui montrait `Badge.tsx`/`Input.tsx`/`globals.css` modifiés simultanément dans les 3 apps). Résultat : **la dérive n'est plus théorique, elle est active et mesurée en direct.**

- **`Badge.tsx`** : toujours identique au caractère près (confirmé), à l'exception d'un commentaire qui a déjà légèrement divergé entre `src/` et `admin/`+`wallet/`.
- **`Input.tsx`** *(nouveau constat, non cité en §4.6)* : identique à 100 % dans les 3 apps, y compris les commentaires — le cas le plus « pur » de triplication, corrigé récemment par 3 éditions manuelles identiques (même hash Git dans les 3 fichiers).
- **`globals.css` (tokens dark mode)** : la triple édition en cours est la **2ᵉ vague** de synchronisation manuelle sur les mêmes tokens en moins d'un mois (ajout initial du dark mode le 2026-06-24) — et une dérive s'est **déjà** glissée entre les deux vagues (rayon du halo curseur : 280px dans `src/`, 250px dans `admin/`+`wallet/`). Preuve vivante que la synchronisation manuelle à 3 n'est déjà plus fiable.
- **`wallet/src/app/claim/[token]/page.tsx`** *(nouvelle duplication détectée, non anticipée par §3/§4.6)* : reproduit quasi mot pour mot le shell et la logique du flux OTP à 2 étapes de `wallet/src/app/login/page.tsx` — une duplication de page entière, **intra-app** cette fois (pas seulement entre apps). Le futur `packages/shared/src/shell/*` couvrirait le chrome visuel mais pas ce flux OTP lui-même.
- **`toQuery()`** *(nouveau constat mineur)* : petit helper dupliqué à l'identique dans les 3 `endpoints.ts` — même famille de problème que `client.ts`, déjà noté en §4.6.
- **`server/src/lib/mask.ts`** *(correction d'une anticipation de §3)* : c'est aujourd'hui un utilitaire **strictement serveur** (masquage d'email pour `ClaimInfoDTO`), sans aucune logique équivalente côté frontend — aucune preuve actuelle ne justifie de le ranger dans `packages/shared` (qui doit rester consommable par les 3 apps clientes uniquement). Il reste dans `server/src/lib/` tant qu'un besoin de partage réel n'apparaît pas ; le classer prématurément créerait une dépendance croisée non justifiée.

Conséquence sur l'ordre de migration : voir §11.4.

### 12.4 Anti-pattern identifié chez `arcadex` — à ne pas reproduire

`arcadex/shared/package.json` déclare en dépendances `elysia`, `@elysiajs/eden` et `better-auth` — c'est-à-dire le **framework backend lui-même** — alors que ce package est documenté (`arcadex/.github/copilot-instructions.md`) comme frontend-safe (« Shared has no direct imports from apps »). C'est nécessaire chez eux pour permettre l'inférence de types d'Eden Treaty, mais ça couple structurellement `shared` au serveur et contredit leur propre doc de frontière.

**Pour CertifyChain** : `packages/shared` doit rester strictement exécutable navigateur — aucune dépendance vers `argon2`, Drizzle, Hono, ou tout module de `apps/server`. C'est exactement la discipline déjà en place aujourd'hui avec `@contract/*` en `import type` uniquement (effacé au build). Si `hono/client` est un jour exploré (§11.3), il faudra veiller à n'importer que le client typé généré, jamais Hono lui-même, sous peine de reproduire exactement cette fuite.

### 12.5 Documentation ADR — gabarit adopté

Aucun `docs/architecture/decisions/` n'existe encore dans ce repo. Le gabarit d'`arcadex/docs/architecture/decisions/0001-auth-stack.md` (Contexte → Décision → Alternatives considérées → Conséquences → Implications sécurité → Impact déploiement → Monitoring → ADR liées → Références) est adopté tel quel — il correspond exactement à ce que §4.7 appelait déjà « bonne pratique à adopter » sans être encore concrétisé.

Une première ADR a été rédigée sur ce modèle et ajoutée au repo : [`docs/architecture/decisions/0001-proof-engine-crypto-stack.md`](./docs/architecture/decisions/0001-proof-engine-crypto-stack.md) — elle documente la décision déjà prise (Ed25519+nonce en Phase 1, SnarkJS/Groth16 en Phase 2) avec ses alternatives rejetées (RSA-PSS, zk-SNARK day-1, ancrage blockchain, Verifiable Credentials W3C, HMAC symétrique). Prochaines ADR à rédiger sur ce même gabarit, par ordre de valeur : validation SIRENE+Gemini (pourquoi SIRENE en source de vérité), cookies isolés par réalm (`cc_*` vs `cc_admin_*`), et — une fois implémentée — la remédiation secrets (Docker secrets pour la clé racine).

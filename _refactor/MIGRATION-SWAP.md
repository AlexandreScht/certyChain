# MIGRATION-SWAP.md — Bascule ancien arbre → monorepo (effectuée le 2026-07-07)

> Ce document décrit **ce que le swap a fait** (traçabilité), comment **revenir en arrière**,
> et comment **aplatir** plus tard `_refactor/` à la racine du dépôt si souhaité.

## 1. Ce qui a été fait

La refonte a été construite et validée **en parallèle** dans `_refactor/` (étapes 0→10,
journal : [`PROGRESS.md`](./PROGRESS.md)), puis l'ancien arbre a été supprimé. État final du dépôt :

```
CertyChain/                       # racine du dépôt git
├─ .git/  .gitignore  .claude/    # infrastructure conservée
├─ GUIDE_PROCONNECT_STRIPE.md     # guides pratiques conservés (demande utilisateur)
├─ GUIDE_TEST.md
├─ GUIDE_TEST_VERIFICATION.md
├─ portal.md
└─ _refactor/                     # ★ LE projet (monorepo apps/ + packages/)
```

Supprimé de la racine (tout le reste), notamment : `src/`, `server/`, `wallet/`, `admin/`,
`public/`, `dev/`, `docs/`, `arcadex/` (repo d'inspiration, plan D11), `.next/`,
`Dockerfile.web`, `docker-compose*.yml`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
`next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`,
`CLAUDE.md`, `PLAN.md`, `README.md`, `AGENTS.md`, `architecture.md`, `audit.md`, `memory.md`,
`CertifyChain_CahierDesCharges.docx.txt`, `.env`/`.env.example` racine, `package-lock.json`,
`tsconfig.tsbuildinfo`, `next-env.d.ts`.

**Rien d'irrécupérable n'a été perdu :**
- Les fichiers **trackés** supprimés restent dans l'historique git (`git log --all -- <chemin>`).
- Les documents **non trackés** de valeur ont été copiés avant suppression :
  `architecture.md` → [`docs/architecture.md`](./docs/architecture.md) ·
  ADR 0001 → [`docs/architecture/decisions/`](./docs/architecture/decisions) ·
  `audit.md` (pré-refonte, 26 constats) → [`docs/audit-2026-07-05-legacy.md`](./docs/audit-2026-07-05-legacy.md).
- `.env` racine : `_refactor/.env` en est la copie (étape 0) — mêmes secrets dev.
- `arcadex/` (non tracké) : repo d'inspiration externe, supprimé conformément au plan (D11) —
  son analyse est archivée dans `docs/architecture.md` §2/§12.

**Docker :** l'ancien projet compose s'appelait `certychain` (nom de dossier), le nouveau est
`certifychain` (name: explicite). Les réseaux de l'ancien projet ont été supprimés (conflit de
subnet `172.29.7.0/24` avec l'overlay dev) et son volume `certychain_pgdata` + images/containers
orphelins purgés au swap. Le volume **actif** est `certifychain_pgdata`.

**`.gitignore` racine conservé tel quel** : ses patterns non ancrés (`node_modules/`, `.next/`,
`dist/`, `.env*`…) couvrent `_refactor/` à toute profondeur — c'est lui qui protège
`_refactor/.env`. Ne pas ajouter de `.gitignore` par package (convention documentée en tête du fichier).

## 2. Rollback (si nécessaire)

Tant que le commit de swap n'est pas poussé/perdu :
```bash
git checkout <commit-avant-swap> -- .   # restaure l'ancien arbre tracké
# puis : corepack pnpm install (racine) pour reconstituer node_modules
```
Les éléments non trackés supprimés (arcadex/) ne reviennent pas par git — arcadex était une copie
d'un dépôt externe. Les docs non trackées vivent désormais dans `_refactor/docs/`.

## 3. Aplatir `_refactor/` à la racine plus tard (optionnel)

Le workspace est **autoporté** (tous les chemins sont relatifs à sa racine : `--env-file=../../.env`
depuis `apps/server`, `context: ../../..` des composes par app, `outputFileTracingRoot`) — le
déplacer d'un bloc ne casse rien. Procédure recommandée :

```bash
# 1) S'assurer que la stack est down et que le working tree est committé.
docker compose -f _refactor/docker-compose.yml down
git add -A && git commit -m "pre-flatten checkpoint"

# 2) UN SEUL commit de déplacement (préserve la détection de renames par git) :
git mv _refactor/* _refactor/.dockerignore _refactor/.env.example .   # (.env est non tracké : le déplacer à la main)
mv _refactor/.env .env
rmdir _refactor
git commit -m "flatten: move monorepo to repo root"

# 3) Réinstaller + revalider :
corepack pnpm install
pnpm typecheck && pnpm test && docker compose build
```

Points d'attention à l'aplatissement :
- Déplacer **aussi** les fichiers cachés (`.dockerignore`, `.env`, `.env.example`).
- `node_modules/` : ne pas le déplacer — relancer `pnpm install`.
- Les liens `../GUIDE_*.md` du README redeviennent `./GUIDE_*.md`.
- Aucun chemin interne au workspace ne change (ils sont tous relatifs à sa racine).

## 4. Références de validation du swap

Avant suppression de l'ancien arbre, le monorepo a été intégralement validé :
typecheck ×6 = 0 · lint = 0 erreur · **68/68 tests** (host **et** étage builder Docker) ·
`docker compose build` 4/4 · stack dev 5/5 healthy · seed · **smoke E2E 44/44** (rejoué après
les correctifs d'audit). Détail et commandes reproductibles : [`PROGRESS.md`](./PROGRESS.md).

# CertifyChain

Plateforme **SaaS B2B** de délivrance et de vérification de **diplômes numériques infalsifiables**.
Une école émet des diplômes signés cryptographiquement (Ed25519, clé propre à l'établissement sous
racine PKI CertifyChain), l'élève les partage depuis son wallet via un lien, et un recruteur vérifie
l'authenticité en moins de 10 secondes — **sans compte, sans accéder au document** (divulgation
minimale, nonce anti-rejeu à usage unique).

```
École (émetteur)      →   Élève (wallet)      →   Recruteur (vérification publique)
signe le diplôme          reçoit + partage        clique le lien → « Vérifié » / « Introuvable »
:3000 /ecole              :3001                   :3000 /verify/[token]
```

## Monorepo

| Workspace | Package | Rôle | Port |
|---|---|---|---|
| `apps/client/web` | `@certifychain/web` | Landing + portail École + page publique `/verify/[token]` | 3000 |
| `apps/client/wallet` | `@certifychain/wallet` | Portefeuille élève (OTP email, claim, partage) | 3001 |
| `apps/client/admin` | `@certifychain/admin` | Back-office plateforme (validation écoles, IA, audit) | 3002 (loopback) |
| `apps/server` | `@certifychain/server` | API Hono (Node 22) — exporte `AppType` (RPC typé) | 4000 |
| `packages/contract` | `@certifychain/contract` | Contrat d'API : DTO, enums, erreurs, schémas Zod | — |
| `packages/shared` | `@certifychain/shared` | Design system (ui ×18, styles), hooks, client API CSRF | — |

Stack : Next.js 16 · React 19 · Tailwind v4 · Hono · Drizzle + PostgreSQL · Zod · JWT (jose) +
scrypt + OTP + TOTP · Docker distroless durci · pnpm workspace. Typage **bout-en-bout** : les
fronts consomment l'API via `hc<AppType>` (`hono/client`) — un changement de route/schéma casse la
compilation cliente (voir `docs/architecture/decisions/0003-hono-rpc-typed-client.md`).

## Démarrage rapide

```bash
# Prérequis : Node 22+ (corepack), Docker Desktop.
cp .env.example .env          # renseigner les secrets (voir commentaires du fichier)
corepack pnpm install

# Tout le stack en dev local (web + wallet + admin + api)
pnpm dev

# Ou en Docker (stack DEV : + Mailpit :8025, pgweb :8081, mocks ProConnect/DNS, DB publiée)
docker compose -f docker-compose.yml -f docker-compose-dev.yml up --build
pnpm db:seed                  # école démo approuvée + diplôme signé + lien de partage
```

Comptes de démo (seed) : école `admin@ecole-demo.fr` / `DemoPassw0rd!24` (TOTP affiché par le
seed) · wallet élève `alex.dubois@example.com` (OTP capturé par Mailpit) · admin plateforme :
`ADMIN_BOOTSTRAP_EMAIL`/`ADMIN_BOOTSTRAP_PASSWORD` du `.env` (enrôlement TOTP au 1ᵉʳ login).

## Tests

```bash
pnpm test        # 68 tests node:test (crypto, TOTP, OTP, rate-limit, throttle, PII…)
pnpm smoke       # 44 checks E2E contre la stack Docker (stack dev up + db:seed d'abord) :
                 # verify challenge→proof→verified + anti-rejeu, login MFA école, émission,
                 # invitation claim → OTP → wallet → partage → révocations, realm admin.
```

Le typecheck de chaque app cliente couvre aussi le câblage RPC (routes serveur incluses au build).

## Production

```bash
docker compose up --build            # stack complète durcie (db interne non publiée)
docker compose up db server          # API seule
docker compose -f apps/client/web/docker-compose.yml up --build   # un front, indépendamment
```

Conteneurs distroless non-root (`cap_drop: ALL`, rootfs read-only), en-têtes durcis, CORS
crédentiel restreint, rate-limits par compte ciblé, secrets chiffrés au repos (AES-256-GCM).
⚠️ Terminer TLS devant l'API avant toute mise en ligne publique (reverse-proxy — voir `PLAN.md`).

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — règles projet + conventions (RPC typé, design system, sécurité).
- [`PLAN.md`](./PLAN.md) — plan vivant (état, roadmap priorisée).
- [`PROGRESS.md`](./PROGRESS.md) — journal de la refonte monorepo 2026-07 (étapes, pièges).
- [`docs/architecture.md`](./docs/architecture.md) — architecture cible + analyse technologique.
- [`docs/architecture/decisions/`](./docs/architecture/decisions) — ADR (crypto ProofEngine,
  layout monorepo, RPC typé).
- [`docs/audit-refonte-2026-07-07.md`](./docs/audit-refonte-2026-07-07.md) — audit bugs utilisateurs.
- [`MIGRATION-SWAP.md`](./MIGRATION-SWAP.md) — bascule ancien arbre → monorepo (2026-07-07).
- Guides pratiques (racine du dépôt) : `../GUIDE_TEST.md`, `../GUIDE_TEST_VERIFICATION.md`,
  `../GUIDE_PROCONNECT_STRIPE.md`, `../portal.md`.

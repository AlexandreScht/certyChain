# CertifyChain

> **Plateforme SaaS B2B de délivrance et de vérification de diplômes numériques par preuve cryptographique.**
> Une école émet des diplômes signés cryptographiquement, l'élève les partage via un lien, et un recruteur en vérifie l'authenticité en moins de 10 secondes — **sans créer de compte** et **sans accéder au contenu du diplôme**.

**Statut :** 🟡 MVP full-stack fonctionnel de bout en bout en dev, **pas encore prêt pour la production** (activation, facturation, emails et vérification SIRET restent à câbler). Voir [`PLAN.md`](./PLAN.md) pour l'avancement détaillé et [`CLAUDE.md`](./CLAUDE.md) pour le *quoi/pourquoi* du projet.

---

## Les 3 acteurs

```
École (émetteur)      →   Élève (wallet)      →   Recruteur (vérif. publique)
signe le diplôme          reçoit + partage        clique le lien → résultat
(clé privée Ed25519)      un lien (≠ diplôme)     (nonce unique, < 2s)
```

Aucun acteur n'a besoin d'être en ligne en même temps : **la preuve est autonome**.

---

## Stack technique

| Couche | Choix |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 |
| Animations | Framer Motion · GSAP + ScrollTrigger (`prefers-reduced-motion` respecté) |
| Backend | Hono + TypeScript (`@hono/node-server`, Node 22) dans `server/` |
| Validation | Zod (contrat partagé `server/src/contract`, importé par le web en `import type`) |
| DB / ORM | PostgreSQL + Drizzle ORM (migrations versionnées) |
| Auth | JWT (jose) en cookies `httpOnly`/`Secure`/`SameSite` · scrypt (admins écoles) · OTP email (élèves) |
| Crypto | Ed25519 + nonce (phase 1) derrière l'interface `ProofEngine` → SnarkJS/Circom Groth16 (phase 2) |
| Infra | Docker multi-stage distroless non-root · `docker-compose` durci |
| Package manager | pnpm (workspace), épinglé `pnpm@9.12.0` |

---

## Structure du monorepo

```
CertyChain/
├─ src/                         # FRONTEND (Next.js, reste à la racine)
│  ├─ app/
│  │  ├─ page.tsx               # landing (Hero, Pricing, …)
│  │  ├─ (school)/ecole/        # portail École : login, register/KYB, dashboard, diplômes
│  │  ├─ (wallet)/wallet/       # portail Élève : login OTP, liste, partage
│  │  └─ verify/[token]/        # page publique de vérification (recruteur)
│  ├─ components/               # sections landing + primitives UI (ui/)
│  ├─ hooks/                    # useSession, useRequireRole
│  └─ lib/api/                  # client API typé (import type du contrat serveur)
│
├─ server/                      # BACKEND (Hono) — @certifychain/server
│  └─ src/
│     ├─ contract/              # DTO, enums, schémas Zod, codes d'erreur (source de vérité API)
│     ├─ config/ middleware/ db/ crypto/ lib/
│     ├─ modules/               # auth · schools · diplomas · wallet · verify · audit
│     └─ scripts/               # gen-root-keys, migrate-cli, seed
│
├─ docker-compose.yml           # postgres (interne) + server + web (durci)
├─ Dockerfile.web               # Next.js standalone, non-root
├─ .env.example                 # variables d'environnement documentées
└─ CLAUDE.md / PLAN.md
```

---

## Prérequis

- **Node.js 22+**
- **pnpm** via Corepack : `corepack enable` (la version `pnpm@9.12.0` est épinglée dans `package.json`)
- **PostgreSQL** (fourni par `docker-compose`, ou une instance locale pour le dev)
- **Docker** + Docker Desktop (optionnel, pour la stack tout-en-un)

---

## Démarrage rapide

### 1. Installer & configurer

```bash
pnpm install                                    # installe le web (racine) + le server (workspace)
cp .env.example .env                            # crée la config locale

# Génère les secrets crypto (clé racine PKI, MASTER_ENC_KEY, OTP_PEPPER, secrets JWT)
# et colle la sortie dans .env :
pnpm --filter @certifychain/server keys:root
```

> Renseigne aussi `POSTGRES_PASSWORD` et `DATABASE_URL` dans `.env` (le script `keys:root`
> ne génère **pas** le mot de passe Postgres). Voir [`.env.example`](./.env.example) pour le détail
> de chaque variable.

### Option A — Docker (stack tout-en-un)

```bash
# DÉV (Mailpit + pgweb, cookies http://) — recommandé pour tester en local :
docker compose -f docker-compose.yml -f docker-compose-dev.yml up --build

# PROD (db/server/web/admin uniquement, cookies Secure) :
docker compose up --build
```

- Web → http://localhost:3000 · API → http://localhost:4000 · admin → http://localhost:3002
- En dév : Mailpit → http://localhost:8025 · pgweb → http://localhost:8081
- L'API **applique les migrations automatiquement** au démarrage.
- Le service `db` est sur un **réseau interne** (aucun port publié) — durcissement volontaire.
- Config : variables **non sensibles** dans les `docker-compose*.yml`, **secrets** dans `.env`.

### Option B — Dev local (hot reload)

Nécessite un PostgreSQL en écoute sur `localhost:5432`. Pour en lancer un rapidement :

```bash
docker run -d --name certify-pg \
  -e POSTGRES_USER=certify -e POSTGRES_PASSWORD=certify_dev_pw -e POSTGRES_DB=certifychain \
  -p 5432:5432 postgres:16-alpine
```

Puis :

```bash
pnpm db:migrate                  # applique les migrations
pnpm db:seed                     # données de démo (comptes + diplôme signé + lien de vérif)
pnpm stack:dev                   # web (3000) + API (4000) en parallèle
```

---

## Comptes de démo (après `pnpm db:seed`)

- **École (admin)** : `admin@ecole-demo.fr` / `DemoPassw0rd!24` → `/ecole/login`
- **Élève (wallet, OTP)** : `alex.dubois@example.com` → `/wallet/login`
  *(code OTP visible dans Mailpit — voir ci-dessous — et, en secours, dans les logs de l'API)*
- **Lien de vérification public** : imprimé par le seed → `/verify/<token>`

### Tester les emails (codes OTP, notifications)

Un service **Mailpit** (boîte mail de dev) intercepte tous les emails sortants :

```bash
docker compose -f docker-compose.yml -f docker-compose-dev.yml up mailpit -d   # boîte mail seule
# → ouvre http://localhost:8025 pour lire les codes OTP / notifications
```

- En **stack Docker dév** (`-f docker-compose.yml -f docker-compose-dev.yml`), l'API pointe déjà vers Mailpit.
- En **dev local** (`pnpm stack:dev`), mets `SMTP_HOST=localhost` et `SMTP_PORT=1025` dans `.env`
  (déjà le cas par défaut) puis lance Mailpit comme ci-dessus.
- Laisse `SMTP_HOST` vide pour revenir au mode « console » (codes affichés dans les logs).
- Pour un envoi réel en production : renseigne `SMTP_HOST/PORT/USER/PASSWORD` + `SMTP_SECURE=true`
  vers un provider (Resend, etc.).

---

## Les portails

| Portail | URL | Pour qui |
|---|---|---|
| Landing | `/` | public |
| École | `/ecole/login`, `/ecole/register`, `/ecole/dashboard`, `/ecole/diplomes` | établissements |
| Wallet élève | `/wallet/login`, `/wallet` | élèves |
| Vérification | `/verify/[token]` | recruteurs (sans compte) |

---

## Commandes principales

### Frontend (racine)

```bash
pnpm dev          # Next.js sur http://localhost:3000
pnpm build        # build standalone
pnpm start        # prod
pnpm lint         # eslint
```

### Stack & base de données (orchestration depuis la racine)

```bash
pnpm stack:dev    # web + API en parallèle (concurrently)
pnpm db:generate  # drizzle : génère les migrations
pnpm db:migrate   # applique les migrations
pnpm db:seed      # données de démo
pnpm docker:dev   # stack DÉV (prod + Mailpit/pgweb/mocks) — recommandé en local
pnpm docker:up    # stack PROD (db/server/web/admin) — docker compose up --build
pnpm docker:down  # arrête la stack
```

### Backend (`server/`, via filtre pnpm)

```bash
pnpm --filter @certifychain/server dev         # API en watch (tsx)
pnpm --filter @certifychain/server build       # bundle (tsup)
pnpm --filter @certifychain/server typecheck   # tsc --noEmit
pnpm --filter @certifychain/server test        # tests crypto (node:test)
pnpm --filter @certifychain/server keys:root   # génère les secrets pour .env
```

---

## Protocole de vérification (phase 1 — Ed25519 + nonce)

1. **Émission** — l'école signe `hash(payload canonique du diplôme)` avec sa clé privée Ed25519 (chiffrée au repos via AES-256-GCM).
2. **Partage** — l'élève génère un lien de délégation contenant un identifiant de capacité, **jamais le diplôme**.
3. **Déclenchement** — la page de vérification demande un **nonce à usage unique** (TTL court).
4. **Vérification** — la signature est validée contre la clé publique de l'école **et** le certificat de l'école contre la **racine CertifyChain** ; contrôle de révocation + nonce non rejoué → **« Vérifié »** (champs minimaux) ou **« Introuvable »**.

> La phase 1 garantit authenticité, anti-rejeu, non-divulgation du document et divulgation sélective — pas la zero-knowledge mathématique d'un zk-SNARK (phase 2). L'interface `ProofEngine` rend la montée en gamme indolore. Détails dans [`CLAUDE.md`](./CLAUDE.md) §4.

---

## Sécurité

Défense en profondeur (voir [`CLAUDE.md`](./CLAUDE.md) §5) : CSP stricte + en-têtes durcis, JWT courts en cookies `httpOnly`/`Secure`/`SameSite`, protection CSRF (double-submit), validation Zod systématique, rate-limiting par IP/compte + lockout login, clés privées des écoles chiffrées au repos (AES-256-GCM, enveloppe KMS-ready), logs structurés avec redaction PII, conteneurs distroless non-root (`cap_drop: ALL`, `no-new-privileges`, rootfs read-only).

---

## Tests & qualité

- **Crypto** : `pnpm --filter @certifychain/server test` (suite `node:test` — envelope, hash canonique, Ed25519, chaîne PKI, `ProofEngine`).
- **Lint web** : `pnpm lint` · **Typecheck server** : `pnpm --filter @certifychain/server typecheck`.
- Un parcours E2E live a validé la vérif publique, l'anti-rejeu, la non-divulgation RGPD et le chaînage école → émission → wallet → partage → vérif *(driver de dev local, non versionné)*.
- **Guide de test pas-à-pas** (parcours normal + scénarios de falsification) : [`GUIDE_TEST.md`](./GUIDE_TEST.md).

---

## Statut & roadmap

Le flux technique fonctionne de bout en bout en dev. Avant un pilote en production, il reste le sprint **« Production Unblock »** (activation école, transport email, facturation, vérification SIRET, clé racine en secret managé). L'avancement complet, les écarts vs cahier des charges et le journal des bugs/décisions vivent dans [`PLAN.md`](./PLAN.md).

Roadmap : crypto phase 2 (Groth16 via SnarkJS/Circom derrière `ProofEngine`), intégration LinkedIn / SSO / API publique (offre Enterprise), ancrage blockchain optionnel.

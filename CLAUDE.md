# CertifyChain — Project Instructions & Context

> **Reprise rapide :** lis d'abord [`PLAN.md`](./PLAN.md) (plan de développement vivant : ce qui est fait, en cours, les bugs rencontrés, ce qui reste). Ce fichier-ci décrit *le projet et ses règles* ; `PLAN.md` décrit *l'avancement*.

---

## 1. Présentation du projet

**CertifyChain** est une plateforme **SaaS B2B** de **délivrance et de vérification de diplômes numériques** par preuve cryptographique. Elle rend la fraude aux diplômes techniquement impossible : un établissement émet des diplômes signés cryptographiquement, l'élève les partage via un lien, et un recruteur en vérifie l'authenticité en moins de 10 secondes **sans créer de compte** et **sans accéder au contenu du diplôme** (divulgation minimale / ZKP).

### But
- **Écoles** : émettre des diplômes infalsifiables, signés par une clé privée propre à l'établissement, sous une chaîne de confiance PKI signée par CertifyChain.
- **Élèves** : un wallet numérique sans mot de passe (email + OTP) pour consulter et partager des liens de vérification.
- **Recruteurs** : une page publique qui répond **« Diplôme vérifié »** ou **« Diplôme introuvable »**, sans fuite de données personnelles, non rejouable.

### Les 3 acteurs et le flux asynchrone
```
École (émetteur)      →   Élève (wallet)      →   Recruteur (vérif. publique)
signe le diplôme          reçoit + partage        clique le lien → résultat
(clé privée Ed25519)      un lien (≠ diplôme)     (nonce unique, < 2s)
```
Aucun acteur n'a besoin d'être en ligne en même temps : **la preuve est autonome**.

---

## 2. Stack technique

| Couche | Choix | Notes |
|---|---|---|
| Frontend | **Next.js 16.2** (App Router) · **React 19** · **TypeScript** | Server Components par défaut |
| Styling | **Tailwind CSS v4** (`@tailwindcss/postcss`) | design system maison (glass/neumorph/grad) |
| Animations | **Framer Motion** (déclaratif/scroll) · **GSAP + ScrollTrigger** (`@gsap/react`) (timelines complexes) | `prefers-reduced-motion` respecté partout |
| Icons | **Lucide React** | |
| Backend | **Hono + TypeScript** (`@hono/node-server`, Node 22) dans `/server` | léger, rapide, durci |
| Validation | **Zod** (`@hono/zod-validator`) | contrat partagé `server/src/contract` (web : `import type` only) |
| DB / ORM | **PostgreSQL** + **Drizzle ORM** | migrations versionnées |
| Auth | **JWT (jose)** en cookies `httpOnly`/`Secure`/`SameSite` · **argon2** (admins écoles) · **OTP** email (élèves) | |
| Crypto | **Ed25519 + nonce** (phase 1) derrière l'interface `ProofEngine` → **SnarkJS/Circom Groth16** (phase 2) | secrets chiffrés AES-256-GCM (enveloppe, KMS/Vault-ready) |
| Infra | **Docker** multi-stage, distroless non-root, least-privilege · **docker-compose** durci | déployable Vercel (web) + Railway/Fly (API) + Postgres managé, ou full self-host |
| Package manager | **pnpm** (workspace) | membres : `server`, `admin` |
| Admin & IA | **Front admin autonome** (`admin/`, Next.js, port privé) · **MFA TOTP** (RFC 6238, `node:crypto`) · **API SIRENE/INSEE** (vérité officielle SIRET) + **Google Gemini Flash** (vérificateur) | 4ᵉ service ; clés serveur uniquement ; SIRENE = source de vérité, Gemini appelé seulement si SIRENE confirme (coût minimal) ; dégradation propre sans clés |

---

## 3. Architecture (monorepo pnpm)

```
CertyChain/
├─ pnpm-workspace.yaml          # membres : server
├─ package.json                 # app web (racine) + scripts d'orchestration
├─ next.config.ts               # security headers, output standalone
├─ docker-compose.yml           # postgres + server + web (durci)
├─ Dockerfile.web               # build Next.js standalone, non-root
├─ .env.example                 # variables d'environnement documentées
├─ CLAUDE.md / PLAN.md
│
├─ src/                         # FRONTEND (Next.js)
│  ├─ app/
│  │  ├─ (marketing)/           # landing existante (Hero, Pricing, …)
│  │  ├─ (school)/ecole/        # portail École : login, dashboard, diplômes, émission, KYB
│  │  └─ verify/[token]/        # page publique de vérification (recruteur)
│  │     # ⚠️ le portail Élève (wallet) est désormais un SERVICE séparé `wallet/` (voir note 5ᵉ service)
│  ├─ components/               # sections landing + composants UI réutilisables
│  │  └─ ui/                    # primitives (Button, Card, Input, Badge, Stat, Table, …)
│  └─ lib/
│     ├─ api/                   # client API typé (fetch + `import type` du contrat serveur)
│     └─ utils.ts               # cn(), helpers
│
└─ server/                      # BACKEND (Hono) — @certifychain/server
   ├─ Dockerfile                # multi-stage, distroless:nonroot, least-privilege
   ├─ drizzle.config.ts
   └─ src/
      ├─ server.ts              # bootstrap @hono/node-server
      ├─ app.ts                 # composition des middlewares + routes
      ├─ contract/              # DTO, enums, schémas Zod, codes d'erreur (source de vérité API)
      ├─ config/                # env (zod-validated), constantes
      ├─ middleware/            # secure-headers, rate-limit, auth(jwt), csrf, error, request-id, audit
      ├─ db/                    # client drizzle, schema.ts, migrations/, seed
      ├─ crypto/                # proof-engine (interface + ed25519-nonce), envelope-encryption, hashing, keys
      ├─ modules/
      │  ├─ auth/               # login école (argon2) + OTP élève
      │  ├─ schools/            # inscription/KYB, génération keypair, stats dashboard
      │  ├─ diplomas/           # émission (signature), liste/filtre, révocation, import CSV
      │  ├─ wallet/             # diplômes de l'élève, création de lien de partage
      │  ├─ verify/             # protocole nonce + vérification publique
      │  ├─ audit/              # journal d'audit (traçabilité légale)
      │  └─ admin/              # stats globales, validation écoles (approve/reject/revoke), settings, audit global
      └─ lib/                   # mailer (dev console), otp, tokens, ids, logger (pino + redaction PII)
```

> **Le frontend reste à la racine** (conformément à la demande « dossier `server` à la racine »). Le contrat d'API (types + Zod) vit dans `server/src/contract` ; le web n'en importe que les **types** (`import type` via l'alias `@contract/*`), effacés au build — aucune dépendance runtime web→server.

> **4ᵉ service — Portail d'administration `admin/`** (ajouté 2026-06-25) : app **Next.js autonome** (membre du workspace pnpm, port **3002**, sous-domaine privé non-indexé) dédiée à l'**admin plateforme**. Design system **copié** (100 % découplée du web public). Réutilise le même contrat (`@contract/*`) et la même API Hono. Fonctions : stats globales, **validation des écoles** (approuver/refuser/révoquer — remplace l'auto-activation dev), supervision diplômes + audit globaux, et **validation assistée par IA**. Auth **réalm isolé** (`cc_admin_*`) avec **MFA TOTP** (étendu aussi aux comptes école). Voir `PLAN.md` › Phase 9.

> **5ᵉ service — Portail Élève `wallet/`** (extrait 2026-06-30) : app **Next.js autonome** (membre du workspace pnpm, package `@certifychain/wallet`, port **3001**), sur le même modèle qu'`admin/`. Auparavant un route-group `(wallet)/wallet/` du web public, désormais **service séparé à origine propre** → ses routes sont **en racine** : `/` (portefeuille), `/[id]` (détail + partage), `/login` (OTP email). Le **web public ne contient donc plus que** la landing, le **portail école** et la page publique `/verify` (recruteur). Design system + `lib/api` + hooks **copiés** (duplication maîtrisée, comme l'admin) ; réalm cookie public `cc_*` partagé avec l'API. Le lien email « diplôme émis » pointe vers `WALLET_ORIGIN` ; les liens de partage restent sur `WEB_ORIGIN/verify/:token`. CORS serveur autorise `:3001`.

---

## 4. Protocole de vérification (crypto)

**Phase 1 — Ed25519 + nonce (NIZK pragmatique, implémenté maintenant) :**
1. **Émission** : l'école signe `hash(payload canonique du diplôme)` avec sa **clé privée Ed25519** (clé privée **chiffrée au repos**). Stockés : hash + signature + clé publique + métadonnées.
2. **Partage** : l'élève génère un **lien de délégation** contenant un identifiant de capacité — **jamais le diplôme**. Option : durée de validité limitée.
3. **Déclenchement** : la page de vérification charge ; le serveur génère un **nonce à usage unique** (TTL court, stocké).
4. **Construction de la preuve** : le serveur lie `nonce + preuve titulaire (secret candidat) + signature école` ; rien de secret ne transite en clair.
5. **Vérification** : signature vérifiée contre la **clé publique** de l'école **et** certificat validé contre la **racine CertifyChain** ; contrôle révocation diplôme/école + nonce non rejoué/non expiré → **« Vérifié »** (champs minimaux divulgués) ou **« Introuvable »**.

**Phase 2 — SnarkJS/Circom Groth16 (futur) :** remplace l'implémentation de `ProofEngine` par un vrai zk-SNARK, sans toucher aux appelants. Voir `PLAN.md` › roadmap.

> ⚠️ Honnêteté technique : la phase 1 garantit **authenticité, anti-rejeu (nonce), non-divulgation du document et divulgation sélective** — pas la zero-knowledge mathématique d'un zk-SNARK. C'est volontaire pour livrer le MVP ; la couture `ProofEngine` rend la montée en gamme indolore.

---

## 5. Modèle de sécurité (DevSecOps — défense en profondeur)

- **Transport** : TLS 1.3 (terminé par le reverse proxy/hébergeur), HSTS.
- **En-têtes** : CSP stricte, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`/frame-ancestors, COOP/CORP (via `secure-headers` Hono + headers Next).
- **Auth/session** : JWT courts en cookies `httpOnly`+`Secure`+`SameSite=strict`, refresh rotation, `scrypt` (node:crypto) pour mots de passe admin école & plateforme, OTP à usage unique + TTL pour les élèves, **protection CSRF** (double-submit) sur les routes mutatives à cookie. **MFA TOTP** (RFC 6238, secret chiffré AES-256-GCM) sur les comptes admin plateforme **et** école. **Cookies isolés par réalm** : public `cc_*` (école/élève) vs admin `cc_admin_*` — un navigateur peut tenir les deux sessions sans collision.
- **Entrées** : validation **Zod** systématique (body/query/params), limites de taille de requête, allowlist de types pour l'upload CSV.
- **Abus** : **rate-limiting** par IP + par compte (login, OTP, vérification), lockout progressif.
- **Secrets** : clés privées des écoles **chiffrées au repos** (AES-256-GCM, enveloppe via `KeyVault` — abstraction KMS/HashiCorp Vault). Aucune clé en clair en base ni en logs.
- **RGPD** : données personnelles candidat jamais transmises au recruteur sans consentement ; minimisation ; `audit_log` (date, identifiant anonymisé, résultat) ; pas de tracking du recruteur au-delà du log.
- **Logs** : structurés (pino), **redaction PII**, pas de secrets.
- **Conteneurs (moindre privilège)** : images **distroless non-root** (uid non-0, pas de shell), `cap_drop: [ALL]`, `no-new-privileges`, **read-only rootfs** + tmpfs, healthchecks, réseau interne pour la DB (non exposée), ressources limitées, dépendances de prod uniquement.

---

## 6. Commandes principales

```bash
pnpm install                 # installe web (racine) + server (workspace)

# Frontend web public (racine)
pnpm dev                     # Next.js sur http://localhost:3000
pnpm build                   # build Next.js (standalone)
pnpm start                   # prod Next.js
pnpm lint                    # eslint

# Portail Élève (wallet/) — service autonome, port 3001
pnpm wallet:dev              # ou : pnpm --filter @certifychain/wallet dev
pnpm wallet:build

# Portail Admin (admin/) — service autonome, port 3002
pnpm admin:dev               # ou : pnpm --filter @certifychain/admin dev
pnpm admin:build

# Tout le stack en dev (web + wallet + admin + api en parallèle)
pnpm stack:dev

# Backend (depuis /server ou via filtre)
pnpm --filter @certifychain/server dev      # API en watch
pnpm --filter @certifychain/server build
pnpm --filter @certifychain/server db:generate   # drizzle: génère migrations
pnpm --filter @certifychain/server db:migrate     # applique migrations
pnpm --filter @certifychain/server db:seed        # données de démo

# Docker — stack PROD durcie (db + server + web + wallet + admin)
docker compose up --build
# Docker — stack DÉV (ajoute Mailpit, pgweb, mocks ProConnect/DNS/Stripe ; cookies http://)
docker compose -f docker-compose.yml -f docker-compose-dev.yml up --build
# Convention : variables NON sensibles dans les docker-compose*.yml ; SECRETS dans .env.
```

---

## 7. Conventions de code

- **TypeScript strict** : typer les props des composants et les retours de fonctions ; pas de `any` non justifié.
- **Composants** en **PascalCase** ; fichiers utilitaires en camelCase.
- `"use client"` **uniquement** si nécessaire (état, hooks, animations Framer/GSAP). Server Components par défaut.
- **Lint avant chaque PR** (`pnpm lint`) ; le backend doit `build` sans erreur TS.
- **Animations** : Framer Motion pour le déclaratif/scroll, GSAP pour les timelines complexes ; **toujours** gérer `prefers-reduced-motion`.
- **Sécurité d'abord** : valider toute entrée, ne jamais logger de secret/PII, principe du moindre privilège partout.
- **Next.js 16** : attention aux breaking changes ; lire `node_modules/next/dist/docs/` si besoin avant d'écrire du code lié au framework.

---

## 8. Design system (à réutiliser tel quel)

Le style est **liquid glassmorphism + neumorphism subtil**, fond ivoire, accents indigo→cyan→magenta→orange. Classes utilitaires déjà définies dans `src/app/globals.css` — **réutilise-les pour la cohérence**, ne réinvente pas :

- **Verre** : `glass`, `glass-strong`, `glass-tint-{indigo,cyan,magenta}`, `glass-sheen`
- **Neumorphisme** : `neumorph`, `neumorph-sm`, `neumorph-inset`, `neumorph-pill`
- **Dégradés/fonds** : `grad-text`, `grad-text-cool`, `grad-ring`, `bg-mesh`, `bg-dots`, `noise`
- **CTA / interactions** : `cta-primary`, `cta-ghost`, `lift`, `tilt-3d`, `hover-glow`, `cursor-glow`
- **Animations** : `animate-{float-slow,float-slower,drift-chip-*,spin-slow,spin-slower,pulse-soft,pulse-ring,scan,shimmer,marquee,dash,arrow-wave,morph}`
- **Typo** : `font-display` (Space Grotesk), `font-body` (Inter), `font-elegant` (Outfit)
- **Palette tokens** : `ink`, `ink-soft`, `muted`, `muted-soft`, `hairline`, `indigo-{600,500,100}`, `cyan-{500,100}`, `magenta-{500,100}`, `success`, `danger`, `ivory`, `surface`

Patterns récurrents : cartes `rounded-[1.75rem]`, badges pilule avec point `pulse-ring`, anneau conique `grad-ring` derrière les éléments mis en avant, tuiles KPI `neumorph-sm`, révélations au scroll (GSAP) + entrées (Framer Motion).

---

## 9. Logging automatique dans Obsidian

Vault : `C:\Users\alexa\Documents\obsidian\CertyChaine`

- **Début de session** : lire `vault/context/stack.md` et `vault/logs/session-courante.md` s'ils existent.
- **Décision technique** : `vault/decisions/[sujet]-[date].md` (problème, options, décision + pourquoi).
- **Bug résolu** : append dans `vault/logs/bugs.md` (description, cause, solution).
- **Fin de session** : mettre à jour `vault/context/session-courante.md` (fait / en cours / blocages / prochaines étapes).
- **Nouvelle dépendance** : mettre à jour `vault/context/stack.md`.
- **Frontmatter YAML** en tête de chaque note : `date`, `projet`, `tags: [décision|bug|session|stack]`.

> Le suivi d'avancement **principal** vit dans `PLAN.md` (repo) ; le vault Obsidian reste le journal long terme.

---

## 10. Règle de maintenance de PLAN.md (IMPORTANT)

Pendant tout développement : **tenir `PLAN.md` à jour en continu** — marquer les tâches faites, noter ce qui est en cours, consigner chaque bug/problème détecté (avec cause + correctif pour ne pas le refaire), et la liste de ce qui reste. Objectif : permettre une reprise du projet immédiate et optimisée.

# PLAN.md — Plan de développement vivant (CertifyChain, monorepo)

> Règle (CLAUDE.md §10) : tenir ce fichier à jour en continu — fait / en cours / bugs (cause +
> correctif) / reste à faire. Le journal détaillé de la refonte monorepo vit dans
> [`PROGRESS.md`](./PROGRESS.md) ; l'historique complet pré-refonte (phases 1→9, ~88 Ko) est dans
> l'ancien `PLAN.md` racine, consultable via git : `git log --all --oneline -- PLAN.md`.

---

## 1. État au 2026-07-07 — MVP complet sur monorepo refondu ✅

**Produit (tout fonctionnel, prouvé par le smoke E2E 44 checks) :**
- **Landing** publique + design system glass/neumorph (dark mode inclus).
- **Portail École** : inscription KYB (SIRENE source de vérité + Gemini vérificateur conditionnel,
  dégradation propre sans clés), login mot de passe + **MFA TOTP**, preuve de contrôle de
  l'établissement (**DNS TXT / courrier postal payant Stripe / ProConnect**, mocks dev fournis),
  clés PKI générées à l'approbation seulement, émission unitaire + **import CSV** (erreurs par
  ligne), registre filtrable/paginé, révocation, stats, **billing Stripe** (starter/pro).
- **Wallet Élève** (app dédiée :3001) : login **OTP email** sans mot de passe, **claim** (liaison
  adresse d'école → e-mail personnel, fusion de wallets, renvoi de lien), détail diplôme, **liens
  de partage** (expiration, révocation, QR).
- **Vérification publique** (recruteur) : challenge → **nonce à usage unique** (consommation
  atomique, anti-rejeu prouvé) → signature Ed25519 **+ certificat contre la racine PKI** +
  contrôles de révocation → attestation minimale. Audit RGPD (IP pseudonymisée salée).
- **Portail Admin** (app dédiée :3002, loopback) : stats globales, validation/rejet/révocation
  d'écoles, re-scoring IA, supervision diplômes + audit global, settings (auto-validation).

**Technique :**
- Monorepo `apps/` + `packages/` (ADR-0002) — duplication frontend éliminée (ui ×18, styles,
  hooks, client API : **une seule source**).
- **RPC typé bout-en-bout** `hc<AppType>` (ADR-0003) + contrat Zod partagé (`packages/contract`).
- Docker durci : 4 images distroless non-root, compose racine + **compose par app cliente**,
  overlay dev complet (Mailpit, pgweb, mock ProConnect, CoreDNS, Stripe CLI).
- Qualité : typecheck strict ×6 workspaces = 0 · lint = 0 erreur · **68 tests** node:test ·
  **smoke E2E 44 checks** (`pnpm smoke`) · tests rejoués dans l'étage builder Docker.
- Swap effectué : l'ancien arbre racine est **supprimé** (guides conservés à la racine du dépôt),
  voir [`MIGRATION-SWAP.md`](./MIGRATION-SWAP.md). Audit bugs utilisateurs :
  [`docs/audit-refonte-2026-07-07.md`](./docs/audit-refonte-2026-07-07.md) (2 corrigés, R1–R6 ouverts).

## 2. Décisions d'architecture verrouillées

Hono/Node 22 (pas d'Elysia/Bun) · JWT jose + scrypt + OTP + TOTP (pas de better-auth) · Zod
partout · Drizzle + PostgreSQL, migrations SQL manuscrites · ProofEngine Ed25519+nonce (phase 1)
→ Groth16 (phase 2) · design system Tailwind v4 maison · pnpm workspace sans Turborepo (différé,
déclencheurs en `docs/architecture.md` §11.1) · ESLint (Biome écarté pour le lint, §11.2) ·
RPC typé Hono natif (ADR-0003) · un compose par app cliente (ADR-0002).

## 3. Roadmap priorisée (reprise de `docs/architecture.md` §12.2 + audit 2026-07-07)

### 🔴 Avant toute mise en ligne avec de vraies données
| # | Chantier | Détail |
|---|---|---|
| P1 | **TLS en transit** | Ajouter Caddy (ou équivalent) en service compose PROD optionnel — TLS auto Let's Encrypt ; passer `TRUST_PROXY=true` derrière le proxy ; `API_BIND=127.0.0.1`. |
| P2 | **Secrets racine en Docker secrets** | Clé privée PKI + `MASTER_ENC_KEY` hors variables d'env (fichiers tmpfs) + cérémonie de génération/rotation documentée. |
| P3 | **Rotation refresh par famille** | `family_id`/`replaced_by_id` sur `refresh_sessions` : réutilisation d'un token déjà tourné → révocation de toute la famille + événement d'audit (détection de vol de session). |
| P4 | **Provider e-mail production** | Souscrire (Resend ou équiv.) et renseigner `SMTP_*` — le client SMTP maison est déjà compatible. Sans ça, OTP/claims ne partent pas (action hors-code). |
| P5 | `AUDIT_IP_SALT` distinct | Générer une valeur dédiée (le fallback actuel = `OTP_PEPPER`). |

### 🟠 Ensuite
| # | Chantier | Détail |
|---|---|---|
| P6 | États publics de vérification **5 → 2** | Fusionner l'affichage public en « Vérifié / Introuvable » (couche présentation seulement, garder les 5 états en interne) — audit R1, cahier des charges. |
| P7 | Rate-limit sliding-window | Remplacer la fenêtre fixe en mémoire ; Redis seulement le jour d'une 2ᵉ instance API. |
| P8 | `ProofEngine` discriminated union | Champ `engine` littéral (`"ed25519-nonce-v1"`) avant d'entamer Groth16 — préalable ADR-0001. |
| P9 | UX TOTP pré-enrôlement | Ne pas régénérer le secret à chaque étape 1 tant que l'enrôlement n'est pas finalisé (audit R2). |
| P10 | Tests d'intégration routes sensibles | Étendre le pattern `app.request()` (login+OTP, verify, émission) — le smoke couvre déjà le E2E réel. |

### 🟢 Confort / plus tard
- `LOG_LEVEL` configurable + request-id propagé dans chaque log ; token-bucket sur les appels
  sortants (SIRENE/Gemini) ; purge/pagination des liens de partage (audit R4) ; toast générique
  sur exceptions inattendues wallet (R3) ; UI 429 « réessayez dans Xs » (R6) ; inscription école
  asynchrone si volume (R5) ; Turborepo/Biome-formatter sur déclencheurs concrets (§11.1/§11.2).

### 📘 Spécifiées, prêtes à implémenter — voir [`features.md`](./features.md) (specs du 2026-07-11)
| # | Feature | Résumé |
|---|---|---|
| F1 | **Accrochage CDC (Passeport de compétences)** | Automatisation de l'obligation légale L6113-8 : tables `cdc_*` (migration 0011), NIR chiffré KeyVault + purge, module serveur `accrochage`, page `/ecole/accrochage`, toggle admin, smoke +6. **Étape 0 bloquante** : télécharger le kit XSD officiel (format refondu en 2026) dans `docs/cdc/`. |
| F2 | **Export EUDI Wallet (eIDAS 2.0)** | Émission **SD-JWT VC** via **OpenID4VCI** (pre-authorized code + tx_code, ES256, Token Status List dérivée de la révocation existante) : migration 0012, module `vc` (well-known à la racine), bouton + QR côté wallet, smoke +8. Hors périmètre v1 : OID4VP, QEAA, mdoc. |

### Phase 2 (produit)
- **Groth16 (SnarkJS/Circom)** derrière `ProofEngine` (après P8) — cérémonie de setup, circuits audités.
- ~~Interop Verifiable Credentials W3C~~ → spécifiée : **F2** dans [`features.md`](./features.md).
  Reste à réévaluer sur besoin : split hébergement par service.

## 3bis. Audit bugs 2026-07-10 (`audit.md`) — 24 constats, tous corrigés sauf mémos

Audit visuel/fonctionnel complet (serveur + packages + 3 fronts) : voir [`audit.md`](./audit.md).
Corrigés dans la même session (typecheck ×6 = 0 · tests 68/68 · lint 0 erreur) :
- **C1** (le plus important) : les fronts n'appelaient jamais `/auth/refresh` → sessions
  mortes en 15 min. Corrigé dans `packages/shared/api/client.ts` (`createCsrfFetch(...,
  { refreshPath })` : refresh single-flight sur 401 + un seul retry) — branché web/wallet/admin.
- **S1** : la vérification publique n'excluait que `revoked` → une école `rejected`
  ex-approuvée restait « Vérifié ». Porte alignée sur `status === "approved"`.
- **W1** : waitlist landing factice → nouvelle route `POST /schools/waitlist` (mail à
  `ADMIN_NOTIFY_EMAIL`) + formulaire réellement branché.
- S2 (register transactionnel), S3 (en-têtes CSV validés), S4+W6 (confirmation avant
  d'abandonner un envoi postal payé), S5 (Stripe `current_period_end` Basil), S6 (attempts
  atomiques), W2/W3/W4 (landing), W5 (recherche e-mail), W7/W8 (dev gating + statut
  d'inscription), W9 (anti double-abonnement → Billing Portal), W10 (retour TOTP), W11
  (contrastes chips), WA1/WA2 (wallet), A1–A4 (admin), C2 (aria-required).
- Restent ouverts : R1–R6 (audit 2026-07-07) + mémos S7/WA3.
- ✅ Vérification finale Docker **rejouée le 2026-07-11** après tous les correctifs (audit
  2026-07-10 + fix login-throttle) : `docker compose build` 4/4 images · stack dev 9
  conteneurs healthy · `db:seed` OK · **smoke 44/44, 0 échec**.
  ⚠️ Piège pnpm : les scripts racine `db:seed`/`smoke` ré-invoquent `pnpm` nu (shim
  corepack → v11, qui refuse le `packageManager` 9.12.0) → appeler directement
  `corepack pnpm@9.12.0 --filter @certifychain/server db:seed|smoke`.

**Suite Jest ajoutée** ([`plan-tests-jest.md`](./plan-tests-jest.md)) : runner racine
`pnpm test:jest`, 5 projets (server/node + shared/web/wallet/admin en jsdom), specs sous
`tests/jest/**/*.spec.ts(x)` — **30 suites, 278 tests, 0 échec** (2ᵉ vague 2026-07-10).
Couvre les régressions d'audit C1 (refresh 401), C2 (aria-required), S3 (en-têtes CSV),
A2 (labels audit), W1 (waitlist réellement envoyée, client + mailer), W4 (footer sans
lien mort), WA1 (copy Ed25519 wallet) + le cœur crypto/auth/webhook, le kit UI complet
(Modal/Toast/thème/contrôles), les en-têtes de sécurité, les cookies par réalm et le
throttle login. `*.test.ts` reste réservé aux 68 tests node:test du serveur.
La 2ᵉ vague a **révélé et corrigé un bug sécurité réel** (login-throttle, voir §4).

## 4. Bugs récents (cause → correctif) — ne pas re-tomber dedans

- **Login-throttle : plus aucun verrouillage possible après le 1ᵉʳ lockout expiré**
  (trouvé par la suite Jest, corrigé 2026-07-10) : dans `recordLoginFailure`, la branche
  « nouvelle fenêtre » remettait `fails = 0` mais laissait `lockedUntil` non nul dans le
  passé → la condition se re-déclenchait à **chaque** échec suivant et le compteur ne
  dépassait plus jamais 1 : brute-force illimité post-lockout (jusqu'au GC ~15 min
  d'inactivité). Correctif : remettre aussi `lockedUntil = 0`
  (`apps/server/src/lib/login-throttle.ts`, régression `tests/jest/server/login-throttle.spec.ts`).
- **Liens e-mails hors config validée** : 4 sites `process.env.*_ORIGIN ?? défaut` au lieu de
  `env.*` (zod fail-fast) → e-mails `localhost` silencieux possibles hors compose. Corrigé
  2026-07-07 (audit §1.1). Règle : jamais `process.env` en code produit serveur.
- **SharePanel wallet** : lien expiré badgé « Actif » + QR vedette potentiellement expiré + tri
  incohérent après rechargement. Corrigé 2026-07-07 (audit §1.2).
- **Outillage Windows** : corepack sous Git Bash échoue **avec exit 0** (chemins MSYS mangés) →
  toujours PowerShell pour pnpm ; réseaux Docker de l'ancien projet `certychain` en conflit de
  subnet avec l'overlay dev → purgés au swap. (PROGRESS.md › Pièges.)

## 5. Comment vérifier (référence)

```bash
corepack pnpm install
pnpm typecheck && pnpm lint && pnpm test                  # 0 erreur · 68/68
docker compose build                                       # 4/4 images
docker compose -f docker-compose.yml -f docker-compose-dev.yml up -d
pnpm db:seed && pnpm smoke                                 # 44/44
```

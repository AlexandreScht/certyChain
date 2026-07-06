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

### Phase 2 (produit)
- **Groth16 (SnarkJS/Circom)** derrière `ProofEngine` (après P8) — cérémonie de setup, circuits audités.
- À réévaluer sur besoin : interop Verifiable Credentials W3C, split hébergement par service.

## 4. Bugs récents (cause → correctif) — ne pas re-tomber dedans

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

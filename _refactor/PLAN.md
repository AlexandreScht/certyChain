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

## 1 bis. 🚨 Verrou de mise en ligne (2026-07-12)

La copie des fronts décrit désormais le produit **final** ([`copy.md`](./copy.md)) : vérification
navigateur + choix des champs (**V1**), coffre matériel (**V2**), registre public ancré Bitcoin
(**V3**), post-quantique (**V4**), accrochage CDC (**F1**), export EUDI (**F2**). **F1, F2, V1
(divulgation sélective + vérificateur navigateur, 2026-07-13), V2 (couture Signer/KMS, 2026-07-14)
et V3 (journal de transparence, 2026-07-15) sont implémentées et la Gate C Docker passe 67/67 ;
seul V4 (post-quantique) n'est pas livré.** ⇒ **Pas de mise en ligne publique ni d'ouverture des
paiements avant V4.** En cas de sortie anticipée : rétrograder d'abord la copie sur les lignes
`[LIVE]` de `copy.md`. Décision assumée par l'utilisateur.

## 2. Décisions d'architecture verrouillées

Hono/Node 22 (pas d'Elysia/Bun) · JWT jose + scrypt + OTP + TOTP (pas de better-auth) · Zod
partout · Drizzle + PostgreSQL, migrations SQL manuscrites · ProofEngine Ed25519+nonce (phase 1)
→ **`ed25519-sd-v2` / divulgation sélective SD-JWT** (phase 2 — ~~Groth16 abandonné~~, voir
[`v2.md`](./v2.md)) · design system Tailwind v4 maison · pnpm workspace sans Turborepo (différé,
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
| P8 | `ProofEngine` discriminated union | Champ `engine` littéral (`"ed25519-nonce-v1"`), résolu **par diplôme** — préalable du chantier **V1** de [`v2.md`](./v2.md) (consommé par V1-a). |
| P9 | UX TOTP pré-enrôlement | Ne pas régénérer le secret à chaque étape 1 tant que l'enrôlement n'est pas finalisé (audit R2). |
| P10 | Tests d'intégration routes sensibles | Étendre le pattern `app.request()` (login+OTP, verify, émission) — le smoke couvre déjà le E2E réel. |

### 🟢 Confort / plus tard
- `LOG_LEVEL` configurable + request-id propagé dans chaque log ; token-bucket sur les appels
  sortants (SIRENE/Gemini) ; purge/pagination des liens de partage (audit R4) ; toast générique
  sur exceptions inattendues wallet (R3) ; UI 429 « réessayez dans Xs » (R6) ; inscription école
  asynchrone si volume (R5) ; Turborepo/Biome-formatter sur déclencheurs concrets (§11.1/§11.2).

### 📘 Features réglementaires — voir [`features.md`](./features.md) (implémentation démarrée le 2026-07-12)
| # | Feature | Résumé |
|---|---|---|
| F1 | **Accrochage CDC (Passeport de compétences)** — terminé, Gate C 59/59 | Kit officiel du 30/03/2026 figé dans `docs/cdc/` (namespace 1.0.0, XSD 1.1.5) ; migrations 0011/0013, contrat partagé, NIR validé/chiffré/purgé, XML déterministe non stocké, configuration figée par lot, CRT, routes école/admin et page école complète. |
| F2 | **Export EUDI Wallet (eIDAS 2.0)** — terminé, Gate C 59/59 ; interop réelle à planifier | OpenID4VCI 1.0 Final, RFC 9901, SD-JWT VC draft-17 et Token Status List draft-21 figés ; migration 0012, clés ES256 chiffrées/rotatives, flux pre-authorized + proof holder, statut dérivé, UI QR/`tx_code` wallet. |

### Journal d'implémentation F1/F2 — session 2026-07-12

**Terminé :**
- analyse intégrale de `features.md`, du monorepo, des frontières `packages/contract` / `packages/shared`
  et des surfaces sécurité, réalisée en parallèle par trois audits indépendants ;
- baseline rejouée avant modification : typecheck workspace 0 erreur, node:test **68/68**, Jest
  **278/278** ;
- référentiels officiels CDC et EUDI téléchargés, versionnés et documentés ;
- écarts du canevas corrigés dans la conception : CSRF sur toutes les mutations cookie, redaction
  dans le vrai logger, journal Drizzle pour 0011/0012/0013, limites de corps route-aware, preuve EUDI
  vérifiée avant consommation atomique et maintien du JWKS/statut des credentials historiques ;
- F1 complet : migrations 0011/0013, contrat, service/routes, activation admin, UI école, purge,
  parseurs CSV/CRT bornés, XML déterministe validé par golden/XSD et configuration immuable figée
  dans chaque lot ;
- F2 complet : migration 0012, provisionnement/rotation ES256, metadata et endpoints OpenID4VCI,
  SD-JWT VC/RFC 9901, Token Status List, route interne et UI wallet ;
- validation hôte finale : typecheck ×6, **118/118 node:test (26 suites)**, **297/297 Jest
  (32 suites)**, lint 0 erreur, builds de production **4/4** ; compose fusionné valide ;
- Gate C Docker finale : images **4/4**, stack dev healthy, migrations 0011/0012/0013 appliquées,
  clé ES256 provisionnée et smoke **59/59, 0 échec** (+7 CDC, +8 EUDI).

Le builder XML utilise volontairement un petit AST fermé et un sérialiseur central strictement
échappé plutôt qu'une nouvelle dépendance ; aucun paquet natif ni modification de lockfile.

**Reste hors Gate C locale :** le test avec un wallet EUDI tiers réel doit être exécuté depuis une
origine HTTPS publique stable (P1 ou tunnel) ; ne pas le considérer comme effectué. Le dépôt d'un
fichier sur l'environnement CDC doit de même être coordonné avec la CDC, aucun bac à sable public
n'étant documenté dans le kit officiel.

### Audit de clôture F1/F2 (`verdict.md`) — session 2026-07-13

**Terminé :** les 14 constats ont été vérifiés dans le code. Les manques confirmés ont été
corrigés : tests HTTP CDC/OpenID4VCI, détail des rejets CRT dans l'UI, minimisation et purge de
`reject_reason`, redaction centralisée, limites/rate-limits CDC, tokenizer CSV partagé, erreurs
publiques EUDI, cache HTTP status list, gestion des pannes front et téléchargement blob robuste.
Le multi-proof reste volontairement hors v1 : l'issuer n'annonce pas la capacité optionnelle
`batch_credential_issuance`, donc l'émission mono-proof est conforme au profil publié.

**Preuves rejouées sur l'état corrigé :** typecheck ×6 = 0 · lint = 0 erreur · **129/129
node:test (28 suites)** · **300/300 Jest (32 suites)** · XML synthétique validé par `xmllint`
contre le XSD CDC 1.1.5 · build Docker **4/4** · stack dev healthy · seed OK · smoke **59/59**.
Le smoke CDC porte désormais sur deux identités, compare le SHA-256 au DTO et au contenu réel,
et vérifie l'absence de NIR dans toutes les réponses JSON du flux.

### Mise en avant marketing F1/F2 sur la landing — session 2026-07-13

Landing `apps/client/web` rendue plus vendeuse sur les deux features **réellement livrées** (F1
accrochage CDC, F2 export EUDI), en complément du contenu existant et strictement dans les
formulations de [`copy.md`](./copy.md) (aucun terme garde-fou) : complétion des placements prévus
(chip marquee `FeaturesGrid` → « Accrochage CDC · Passeport de compétences », mot-clé SEO `SD-JWT VC`
dans `layout.tsx`) + nouveau bandeau « Conformité & interopérabilité » dans `PricingSection`
(deux cartes glass reprenant les accroches de `copy.md` §C : « Votre obligation légale d'accrochage,
automatisée » / « Compatible portefeuille d'identité européen »). Design system réutilisé, aucun
style global, `--filter @certifychain/web typecheck` = 0 erreur.

Passe copie complémentaire (même session) : retrait du terme garde-fou « EQAR » (non implémenté,
`copy.md` §D) des descriptions KYB de `CryptoSection.tsx` et `HowItWorksSection.tsx`, et
restauration de la ligne Enterprise `[LIVE]` « IA : scoring, traduction » dans `PricingSection.tsx`
(`copy.md` B.6). Typecheck web = 0 erreur.

### Chantier V1 (`ed25519-sd-v2` + vérificateur navigateur) — session 2026-07-13/14 ✅ TERMINÉ

Orchestration en 3 phases (1 agent serveur Opus, puis 2 agents front en parallèle, puis gates) :

**Serveur + crypto partagée** : `crypto/disclosures.ts` (mécanique RFC 9901 **extraite de F2**
`modules/vc/sd-jwt.ts` qui l'importe désormais — un seul module, §0.4 respecté) ·
`hashSdPayloadV2` (v1 intact) · migration `0014_selective_disclosure` + miroir schéma (CHECK
v2⇒disclosures, `share_links.disclosed_fields`) · `proof-engine` en union discriminée
`engineFor(proofVersion)` par diplôme (**préalable P8 clos**, moteur nonce v1 intact) · émission
v2 (7 disclosures y c. null, `_sd` trié, sels chiffrés KeyVault) · **une seule** implémentation de
vérification `packages/shared/src/crypto/verify-bundle.ts` (WebCrypto + fallback `@noble/ed25519`
pur JS) importée par le serveur ET le navigateur · route publique `GET /verify/revocation/:id`
(rate-limitée IP, 404 uniforme anti-énumération) · ADR **0004** (renumérotée, 0002/0003 prises ;
ADR-0001 Phase 2 `Superseded`).

**Fronts** : `/verify/[token]` → verdict piloté par la vérification **client** (jamais « Vérifié »
sur la seule crypto : révocation d'abord), compteur de champs masqués, « Télécharger la preuve
(JSON) », nouvelle page **`/verifier`** hors ligne · wallet `SharePanel` → 7 cases à cocher,
`holderEmail`/`externalId` décochés par défaut, aperçu « le recruteur verra », `disclosedFields`
envoyé en ordre canonique.

**Gates (tout vert)** : typecheck -r 0 · lint 0 erreur (15 warnings pré-existants) · node:test
**158/158** (+29) · Jest **35 suites / 318 tests** (+`verify-bundle` jsdom, `verify-page`,
`share-fields`) · build Docker **4/4** · migration appliquée · **smoke 64/64** (+5 V1 : bundle
2 disclosures · vérif locale · fuite par sous-chaîne · révoqué = crypto valide mais status revoked ·
oracle 200→404).

**Bug attrapé par la Gate C** : le Dockerfile serveur ne copiait pas `packages/shared` (nouvelle
dépendance du bundle tsup) → `COPY packages/shared` ajouté. Les diplômes existants restent en
`proof_version='v1'` et se vérifient comme avant (test de non-régression dédié) ; toute nouvelle
émission est v2. Reste hors gate locale : rien pour V1.

### Chantier V2 (couture Signer + KMS) — session 2026-07-14 ✅ TERMINÉ

Orchestration en 2 phases (1 agent recherche KMS Sonnet, puis 1 agent serveur Opus, revue/gates
par l'orchestrateur Fable) :

**Étape 0 (V2-0) + décision** : `docs/kms/README.md`, comparatif sourcé au 2026-07-14. AWS KMS
signe désormais Ed25519 (`ECC_NIST_EDWARDS25519`, disponible depuis le 2025-11-07 — écart vs
l'hypothèse de `v2.md`, documenté) ; GCP `EC_SIGN_ED25519` GA ; Azure Key Vault/Managed HSM : non.
**HashiCorp Vault Transit / fork OpenBao retenu** (Ed25519 open source, API REST pure sans SDK ⇒
compatible distroless, coût VPS) ; YubiHSM 2 écarté (780 € TTC, SDK natif incompatible distroless).
**Décision : option (c) de `v2.md` §V2-0** — la couture `Signer` est livrée maintenant, l'infra KMS
réelle se branche plus tard, backend désigné = Vault/OpenBao, bascule **école par école**, jamais
big-bang.

**Livrables serveur** : `apps/server/src/crypto/signer.ts` — interface `Signer` (`kind`,
`createSchoolKey`, `sign`) ; `EnvelopeSigner` (défaut, comportement identique à l'ancien chemin) ;
`KmsSigner` = client Vault Transit en `fetch` pur (aucun SDK, `fetchImpl` injectable pour les
tests), erreurs sans fuite du token ; `rawEd25519PublicKeyToSpkiPem` ; `signerFor(kind)` (kms
paresseux, miroir de `engineFor`) ; `resolveSchoolSigner(school)` — résolution **par école** avec
fallback legacy (`signerRef ?? encryptedPrivateKey` pour envelope). Migration
`0015_signer_seam.sql` + journal + miroir `db/schema.ts` : `schools.signer_kind` (défaut
`'envelope'`), `schools.signer_ref`, CHECK `schools_kms_needs_ref` (kms ⇒ ref) — **zéro migration
de données**, les écoles existantes restent envelope sur `encrypted_private_key` (legacy en
jsdoc). `env.ts` : `SIGNER_KIND` (Zod enum, défaut `envelope`) + `VAULT_ADDR`/`VAULT_TOKEN`/
`VAULT_TRANSIT_MOUNT`/`VAULT_KEY_PREFIX`, `superRefine` fail-fast (kms ⇒ `VAULT_ADDR` http(s)
valide + `VAULT_TOKEN` non vide) ; `.env.example` + `docker-compose.yml` câblés.

**Refactor — plus aucun PEM privé hors de `signer.ts`** : les 2 seuls sites qui manipulaient un
PEM privé d'école sont refaits — `schools.service.ts` (approbation → `signerFor(env.SIGNER_KIND)
.createSchoolKey`, écrit `signerKind`/`signerRef`, n'écrit plus `encryptedPrivateKey`) et
`diplomas.service.ts` (émission → `resolveSchoolSigner(school)` intégré à la garde
`schoolNotApproved`, signature via `await signing.signer.sign(...)`, bit-à-bit identique pour
envelope ; l'import CSV passe par le même `issueDiploma`, un seul site de signature). Le DoD
« grep de garde » de `v2.md` est rendu **exécutable** : un test node:test lit récursivement
`modules/schools` + `modules/diplomas` et rejette toute occurrence de `decryptToString`/
`signDiplomaHash`.

**Tests** : `apps/server/test/crypto/signer.test.ts` + helper `test/helpers/fake-vault.ts` (faux
Vault Transit en mémoire qui exerce le VRAI `KmsSigner` sans réseau) — vecteur de non-régression
figé (même clé + même hash ⇒ même signature b64 que `signDiplomaHash`), matrice
`resolveSchoolSigner`, e2e kms, grep de garde. `tests/jest/server/signer.spec.ts` (nouvelle
suite). Zéro nouvelle dépendance npm, zéro nouvelle route API, contrat/clients intacts.

**Défaut attrapé en revue** : le vecteur `HASH_HEX` du test faisait 65 caractères hex (longueur
impaire, dernier quartet silencieusement ignoré par `Buffer.from(...,"hex")`) → ramené à 64 +
garde-fou `assert HASH_HEX.length===64` / `HASH_BYTES.length===32`.

**Gates (tout vert)** : typecheck -r 0 (×6 workspaces) · node:test **181/181 (42 suites, +23)** ·
Jest **326/326 (36 suites, +8 tests / +1 suite)** · lint 0 erreur (15 warnings pré-existants) ·
Docker build **4/4** · stack dev healthy · `db:seed` (skip idempotent) · **smoke 64/64, 0 échec**
(inchangé — V2 n'ajoute pas de check smoke) · migration 0015 appliquée (host + conteneur via
`MIGRATE_ON_START`) · vérification SQL post-smoke : l'école seedée est `envelope` avec
`signer_ref` NULL et `encrypted_private_key` non NULL ⇒ le **fallback legacy a été exercé de bout
en bout en Docker** (émissions du smoke signées via ce chemin).

Ce que V2 achète (`v2.md` §0.5) : empêche l'exfiltration de la clé (dump DB + master key ne
suffisent plus) + journal d'usage côté KMS. Ce qu'elle n'achète pas : elle n'empêche pas un
attaquant en RCE de faire signer pendant qu'il est là — l'antidote est **V3** (journal de
transparence).

**Reste hors gate locale** : rien pour V2 tant que `SIGNER_KIND=envelope` ; le jour du branchement
Vault réel : provisionner le VPS + token, et batcher/limiter la concurrence des imports CSV
(latence réseau par signature).

### Chantier V3 (journal de transparence — registre public horodaté) — session 2026-07-15 ✅ TERMINÉ

Orchestration multi-agents (crypto/serveur d'abord, puis 2 agents front en parallèle, revue + gates
par l'orchestrateur ; ADR **0005**). But (`v2.md` §V3, antidote au trou laissé par V2) : rendre
l'émission **inaltérable et auditable** — une école détecte un diplôme émis en son nom qu'elle n'a pas
signé, et CertifyChain ne peut plus réécrire/supprimer une émission a posteriori.

**Crypto partagée (navigateur + serveur, `packages/shared`)** : `crypto/primitives.ts` (encodage /
canonicalize / Ed25519 **extraits** de `verify-bundle.ts` sans changer son comportement — spec
`verify-bundle.spec` restée verte) · `crypto/merkle.ts` — RFC 6962 pur (`merkleLeafHash` préfixe
`0x00`, `merkleNodeHash` `0x01`, `merkleRootHex`, `inclusionProofHex`, `consistencyProofHex`,
`verifyInclusion`, `verifyConsistency`), vecteurs figés reproduisant **8 racines CT historiques** ·
`crypto/verify-transparency.ts` — `verifyTransparency(bundle)` : recalcule la feuille (binding
`"full"`) ou pin le `leafHash` seul (binding `"hash-only"` quand `issuedAt` est masqué — **jamais**
deviner une valeur masquée), vérifie l'inclusion RFC 6962 **ET** la signature racine du checkpoint.
**Une seule** implémentation partagée serveur/navigateur (règle §3, anti-divergence).

**Serveur** : migration `0016_transparency_log` (+ miroir `db/schema.ts`) — `issuance_log` (une feuille
**HACHÉE** par diplôme, AUCUNE PII, `leaf_index` unique ≥ 0), `log_checkpoints` (STH signés,
`ots_proof` bytea, `ots_upgraded_at`, `timestamp` = `created_at` stocké pour égaler ce qui est signé),
`schools.issuance_frozen_at` (gel = **colonne**, PAS un 6ᵉ statut), +2 valeurs d'audit
(`transparency_report`, `school_unfrozen`, ajoutées sans être **utilisées** dans la même migration —
piège §6.10) · `modules/transparency/merkle.ts` (`buildIssuanceLeaf`, sans PII) ·
`modules/transparency/ots.ts` — client **OpenTimestamps écrit de zéro** en TS pur (parseur /
sérialiseur `.ots`, varint LEB128, soumission calendrier + upgrade Bitcoin ; **zéro dépendance npm**
⇒ compatible distroless, `javascript-opentimestamps` écarté) · `checkpoint.service.ts` (STH signé
racine, **single-flight + debounce**) · `journal.service.ts` (journal école paginé + signalement) ·
`crypto/keys.ts` `signLogCheckpoint` (miroir **exact** d'`issueSchoolCertificate`) · routes publiques
chaînées `GET /log/{checkpoint,inclusion/:id,consistency}` (rate-limitées IP, **404 uniforme**
anti-énumération, CORS public zéro-cookie) + `GET /schools/journal` + `POST /schools/journal/report`
(auth école + CSRF) + `POST /admin/schools/:id/unfreeze` (auth admin + CSRF).

**Intégrité transactionnelle (décisions D1/D2)** : le `leaf_index` est attribué **DANS** la transaction
d'émission sous `pg_advisory_xact_lock` + `COALESCE(MAX+1,0)` — préfixes **contigus sans trou**,
robustes au MVCC (**pas** une `bigserial` : un rollback laisserait des trous et l'ordre de commit
pourrait diverger de l'ordre de séquence) ; un échec d'insert du journal **annule toute l'émission**
(le diplôme n'a jamais existé — pas de rattrapage asynchrone). Le champ `transparency` du bundle v2 est
construit **sans jamais** divulguer un champ masqué.

**Fronts** : *web* — 4 wrappers `endpoints.ts` (checkpoint / inclusion / journal / report),
`TransparencyPanel` (verdict recalculé **dans le navigateur**, jamais « ancré » avant
`ots_upgraded_at`, note « liaison partielle » en hash-only, avertissement **non bloquant** en échec)
câblé sur `/verify/[token]` **ET** la page hors-ligne `/verifier`, nouvelle page **`/ecole/journal`**
(tableau paginé + signalement avec modale expliquant le **gel** + bannière de gel persistante) +
entrée nav `AppShell` ; *admin* — `unfreezeSchool`, badge/carte de gel + bouton « Dégeler les
émissions » **conditionnel** avec modale sur `schools/[id]`, 2 libellés d'audit. Copie conforme
`copy.md` (« registre public horodaté », « racine ancrée dans Bitcoin — zéro donnée personnelle
on-chain » ; aucun terme garde-fou : ni « blockchain » seul, ni « NFT », ni « ZKP »).

**Gates (tout vert, rejoués par l'orchestrateur)** : typecheck -r **0 × 6** · lint **0 erreur**
(warnings pré-existants `set-state-in-effect`) · node:test **229/229** (+48 : merkle oracle/vecteurs,
`buildIssuanceLeaf`, `verifyTransparency`, `checkpoint.service` single-flight/debounce, émission
transactionnelle rollback, ots) · Jest **353/353 (40 suites, +4)** (merkle-verify shared, journal-page
+ transparency-panel web, school-detail-page admin) · build Docker **4/4** · stack dev **9 conteneurs
healthy** · migration 0016 appliquée au boot (`MIGRATE_ON_START`) · seed OK · **smoke 67/67** (+3 V3 :
inclusion RFC 6962 vérifiée **localement** contre la racine · bundle v2 porte `transparency` binding
`"full"` · consistency append-only + **zéro PII** transparency).

Ce que V3 achète (`v2.md` §0.5) : l'**inaltérabilité + l'auditabilité** de l'émission — antidote au
trou de V2 (un attaquant en RCE qui fait signer devient **détectable** par l'école via son journal, et
CertifyChain ne peut pas réécrire l'historique). **Reste hors gate locale** : l'**ancrage Bitcoin
réel** (upgrade OpenTimestamps = quelques heures/jours) et un **CRON** de soumission/upgrade calendrier
à câbler en prod ; jusque-là le vérificateur affiche honnêtement « ancrage en attente de confirmation »
tant que `ots_upgraded_at` est nul (jamais de fausse promesse « ancré »).

### Phase 2 (produit)
- ~~**Groth16 (SnarkJS/Circom)**~~ → **abandonné** le 2026-07-12 (achète de la confidentialité, pas
  de la sécurité ; BN254 < Ed25519 en bits ; preuves malléables ; trusted setup ; ~96 % des vulns
  SNARK = circuits sous-contraints). **Remplacé par le socle V2** → [`v2.md`](./v2.md) :
  ✅ **V1** divulgation sélective (`ed25519-sd-v2`, SD-JWT/RFC 9901) + vérificateur navigateur
  (**terminé 2026-07-13**, voir journal ci-dessus) ·
  ✅ **V2** clés hors-base (`Signer` + KMS/HSM) (**terminé 2026-07-14**, option c : couture livrée,
  infra Vault/OpenBao à brancher plus tard) ·
  ✅ **V3** journal de transparence (Merkle RFC 6962 + ancrage OpenTimestamps/Bitcoin) (**terminé
  2026-07-15**, voir journal ci-dessus ; ancrage Bitcoin réel = upgrade asynchrone à câbler en prod) ·
  **V4** post-quantique hybride (ML-DSA) · **V5** BBS+ (sous conditions, pas avant).
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
`tests/jest/**/*.spec.ts(x)` — **32 suites, 300 tests, 0 échec** (étendu après l'audit F1/F2 le 2026-07-13).
Couvre les régressions d'audit C1 (refresh 401), C2 (aria-required), S3 (en-têtes CSV),
A2 (labels audit), W1 (waitlist réellement envoyée, client + mailer), W4 (footer sans
lien mort), WA1 (copy Ed25519 wallet) + le cœur crypto/auth/webhook, le kit UI complet
(Modal/Toast/thème/contrôles), les en-têtes de sécurité, les cookies par réalm et le
throttle login, la page Accrochage CDC et l'export EUDI du wallet. `*.test.ts` reste réservé aux
**129 tests node:test** du serveur.
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
corepack pnpm@9.12.0 install
corepack pnpm@9.12.0 -r typecheck
corepack pnpm@9.12.0 -r lint
corepack pnpm@9.12.0 --filter @certifychain/server test   # 229/229
corepack pnpm@9.12.0 test:jest                            # 353/353 (40 suites)
docker compose build                                       # 4/4 images
docker compose -f docker-compose.yml -f docker-compose-dev.yml up -d
corepack pnpm@9.12.0 --filter @certifychain/server db:seed
corepack pnpm@9.12.0 --filter @certifychain/server smoke  # 67/67 validés le 2026-07-15
```

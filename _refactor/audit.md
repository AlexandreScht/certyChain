# audit.md — Audit d'état CertifyChain · 2026-07-21

> **Nature** : audit **en lecture seule** réalisé le 2026-07-21 sur la branche `temp_refactor`
> (pointe `91425bf`, arbre propre). Aucun fichier n'a été modifié pendant l'audit.
> **Méthode** : 6 analyses parallèles indépendantes (fonctionnalités F1/F2, feuille de route
> `v2.md`, dispositif de test, 3 apps clientes, serveur + paiement + ProConnect, cohérence
> documentaire), chaque constat vérifié dans le code avec `fichier:ligne`.
> **Objet de ce fichier** : servir de **bon de travail** pour la session de correction suivante.
>
> Ce fichier remplace l'ancien `audit.md` (24 constats du 2026-07-10) supprimé au commit `91425bf`
> et vers lequel [`PLAN.md`](./PLAN.md) §3bis pointe encore dans le vide. **Voir C4.**

---

## 0. Protocole d'orchestration (à lire en premier par le chef d'orchestre)

### 0.1 Répartition des agents

| Agent | Périmètre | Critère |
|---|---|---|
| **Chef d'orchestre** | Découpe, séquence, relit, coche ce fichier, tient `PLAN.md` à jour | Ne code pas lui-même |
| **Sonnet 5** | Implémentation, tests, retraits de copie, synchronisation de docs, refactors mécaniques | Défaut pour tout lot |
| **Opus 4.8** | Tous Bugs à corriger, sécurité, cryptographie, verrouillage, inférence de types cassée | Sur escalade ou marquage explicite ci-dessous |

### 0.2 Règle d'escalade Sonnet 5 → Opus 4.8

Escalader **immédiatement**, sans troisième tentative, si l'une de ces conditions est vraie :

1. Un test passe au rouge et la cause n'est pas comprise en une lecture ;
2. Le correctif touche : sessions/jetons, MFA/TOTP, cryptographie, verrous base de données,
   ou la chaîne de typage RPC (§0.5) ;
3. Le correctif oblige à modifier un fichier listé en §0.5 « garde-fous » ;
4. L'item est marqué **`→ OPUS`** dans les lots ci-dessous.

Les items marqués **`→ OPUS`** partent directement chez Opus 4.8, sans passer par Sonnet.

### 0.3 Cycle de travail par item

1. Lire l'item (constat + correction attendue + critère d'acceptation) ;
2. Corriger ;
3. Rejouer `typecheck` + les suites concernées ;
4. Vérifier le **critère d'acceptation** littéralement (souvent une commande de recherche) ;
5. Cocher la case dans ce fichier + ligne dans le **journal §11** ;
6. Répercuter dans [`PLAN.md`](./PLAN.md) (règle CLAUDE.md §10).

**Ne jamais cocher un item sans avoir exécuté son critère d'acceptation.**

### 0.4 Garde-fous — ne PAS casser (lecture obligatoire avant d'éditer le serveur)

Ces règles viennent de `CLAUDE.md` §4/§7 et de `PROGRESS.md`. Les enfreindre casse le projet de
façon parfois silencieuse :

- **Routes chaînées obligatoires.** Toute route s'enregistre en style chaîné
  (`new Hono().get(...).post(...)`). Les déclarations se hissent **au-dessus** de la chaîne.
- **Ne pas annoter** le type de retour de `createApp()` ni des handlers — cela efface l'inférence
  et casse le client typé des 3 apps.
- **Ne pas retirer le cast** `as typeof honoZValidator` dans `apps/server/src/lib/validator.ts`.
- La sonde `apps/server/src/rpc.type-test.ts` **doit** rester : elle casse le typecheck si une
  route sort du style chaîné. Si elle casse, c'est un signal, pas un obstacle à contourner.
- **Ne pas toucher `hashDiplomaPayload`** (`apps/server/src/crypto/hashing.ts`) : les diplômes
  déjà émis en `ed25519-nonce-v1` deviendraient invérifiables. Le moteur v2 vit à côté
  (`hashSdPayloadV2`), résolu **par diplôme** via `engineFor(proofVersion)`.
- `packages/shared` reste **sans dépendance serveur** (jamais `hono`, jamais `drizzle`, jamais
  d'import depuis `apps/server`).
- **Migrations manuscrites** dans `apps/server/drizzle/` — **jamais** `db:generate`.
- **Jamais `process.env.X` en code produit** : toujours `config/env.ts` (Zod, fail-fast). *(Une
  entorse subsiste, voir B6.)*
- **Toolchain** : lancer pnpm **en PowerShell**. Sous Git Bash le shim `corepack` échoue **avec
  code de sortie 0** — un enchaînement « tout vert » peut n'avoir rien exécuté.
- **Juge de paix** = Docker, pas l'hôte : `docker compose build` puis tests dans l'étage builder.

---

## 1. Verdict d'ensemble

Le produit est **nettement plus abouti que ce que les documents de suivi laissent croire**. Les 6
analyses convergent sur trois points :

1. **Aucune coquille vide.** 23 écrans clients et 12 modules serveur : tout est réellement câblé.
   Recherche `TODO|FIXME|XXX|HACK|WIP|not implemented` sur `apps/` + `packages/` : **zéro résultat
   exploitable**. Zéro `any`, zéro `@ts-ignore`. Le paiement Stripe et ProConnect sont
   **réellement implémentés**, pas des bouchons.
2. **Le risque principal n'est pas technique, il est contractuel** : six affirmations affichées
   aux visiteurs et aux clients payants **ne correspondent pas au produit livré** (lot A).
3. **Les documents de suivi ne sont plus fiables** : deux fichiers d'instructions se contredisent,
   trois documents donnent trois comptes de tests différents, plusieurs liens pointent vers des
   fichiers supprimés ou jamais créés (lot C).

Fait notable et inversé par rapport à l'attendu : `features.md` (cahier des charges F1/F2) a
**toutes ses cases de « Definition of Done » décochées** alors que le code correspondant est fait
à ~95 % et dépasse parfois la spécification. Ici c'est la documentation qui est en retard sur le
travail.

---

## 2. Tableau de bord des lots

| Lot | Sujet | Items | Gravité max | Agent par défaut |
|---|---|---|---|---|
| **A** | Promesses affichées non tenues | 8 | 🔴 Contractuel | Sonnet 5 |
| **B** | Sécurité | 6 | 🔴 Critique | Opus 4.8 sur B1–B3 |
| **C** | Cohérence documentaire | 8 | 🟠 Pilotage | Sonnet 5 |
| **D** | Mise en production | 8 | 🔴 Bloquant | Mixte |
| **E** | Tests | 5 | 🟠 Assurance | Sonnet 5 |
| **F** | Confort et dette | 13 | 🟢 Mineur | Sonnet 5 |

**Ordre d'exécution recommandé : E0 (préalable) → A → B → D1/D3/D4 → C → E → D5–D8 → F.**

Justification : le lot A est le seul à porter un risque juridique immédiat et coûte peu ; le lot B
contient une faille signalée deux fois et jamais corrigée ; D3 (e-mails) rend le produit
inutilisable en production s'il est oublié.

---

## 3. Lot A — Promesses affichées non tenues 🔴

**Contexte.** `copy.md` §9-11 pose la règle du projet : *« Une ligne taguée `[V3]` ne part pas en
prod avant que V3 soit en prod … une promesse non tenue n'est pas une maladresse marketing, c'est
un litige commercial. »* **Cette règle est aujourd'hui violée dans le dépôt.** C'est exactement le
piège du « ZKP » que le projet dit avoir voulu éviter — et qu'il a effectivement évité côté
cryptographie (§B.5 : zéro occurrence de ZKP/Groth16 dans la copie affichée), mais pas ailleurs.

**Deux options par item** : (a) retirer la promesse, (b) livrer la fonctionnalité. Tant que (b)
n'est pas fait, (a) est obligatoire.

- [ ] **A1 — « coffre matériel » affiché à chaque école cliente** 🔴 **le plus grave du lot**
  `apps/client/web/src/app/(school)/ecole/dashboard/page.tsx:307-311`
  Texte affiché : *« Votre clé ne quitte jamais son coffre matériel — même nous ne pouvons pas
  l'extraire »*, sans condition sur le mode de signature réel de l'école.
  **Réalité** : `SIGNER_KIND` vaut `envelope` par défaut (`apps/server/src/config/env.ts:155`,
  `docker-compose.yml:102`, `.env.example:53`) et **aucun service Vault/OpenBao n'existe dans
  `docker-compose.yml`**. Les clés sont chiffrées AES-256-GCM **en base** : extractibles avec un
  dump de la base + `MASTER_ENC_KEY`. L'affirmation « même nous ne pouvons pas l'extraire » est
  donc **fausse**, et adressée à un client payant sur son propre tableau de bord.
  **Correction** : soit conditionner l'affichage au `signerKind` réel de l'école (nécessite de
  l'exposer dans le DTO), soit reformuler sur ce qui est vrai aujourd'hui (chiffrement fort au
  repos, clé jamais transmise à un tiers). Ne pas laisser d'inconditionnel.
  **Acceptation** : la chaîne « coffre matériel » n'apparaît plus, ou n'apparaît que dans une
  branche gardée par `signerKind === "kms"`. Lié à **D5**.

- [ ] **A2 — badge « Clés privées HSM » sur la page d'accueil publique** 🔴
  `apps/client/web/src/components/WaitlistSection.tsx:177`
  Même écart que A1, mais visible de **tout visiteur non authentifié**.
  **Correction** : retirer le badge (V2 non déployé).

- [ ] **A3 — badge « Chiffrement TLS 1.3 » sur la page d'accueil publique** 🔴
  `apps/client/web/src/components/WaitlistSection.tsx:176`
  **Réalité** : recherche `Caddyfile|caddy|nginx` sur tout le dépôt → **aucun fichier, aucun
  service**. `docker-compose.yml:148` expose le port 4000 **en clair**. Le TLS est listé comme
  chantier P1 « avant toute mise en ligne » dans `PLAN.md`.
  **Correction** : retirer le badge jusqu'à **D1**.

- [ ] **A4 — « Post-quantique · ML-DSA » dans le bandeau d'accueil** 🔴
  `apps/client/web/src/components/FeaturesGrid.tsx:402`
  Affiché inconditionnellement, mélangé sans distinction visuelle à des éléments réellement
  livrés (Ed25519, RNCP, révocation). `copy.md:113` tague explicitement cette ligne `[V4]`.
  **Réalité** : recherche `ML-DSA|ml_dsa|Dilithium|post-quantum|@noble/post-quantum|PQ_POLICY` sur
  `apps/` + `packages/` → **zéro occurrence**. Aucune dépendance, aucune migration. V4 est le
  **seul chantier de `v2.md` jamais commencé**.
  **Correction** : retirer la mention. Lié à **D8**.

- [ ] **A5 — formulation bannie dans l'aperçu de partage social** 🟠
  `apps/client/web/src/app/layout.tsx:48`
  `openGraph.description` : *« Rendez la fraude aux diplômes techniquement impossible. »*
  Correspond **mot pour mot** à la formulation que `copy.md` §D liste comme fausse et bannie
  (« La fraude aux diplômes devient impossible »). Visible dans tout partage LinkedIn/X/Facebook.
  **Correction** : reformuler sur la vérifiabilité, pas sur l'impossibilité de la fraude.

- [ ] **A6 — fonctionnalités d'IA vendues dans la grille tarifaire** 🔴
  `apps/client/web/src/components/PricingSection.tsx:34-37,55`
  Vend : *« IA Beta : extraction, anomalies »*, *« Assistant Élève LinkedIn »*, *« scoring,
  traduction »*. **Aucune de ces fonctionnalités n'existe** dans les trois applications auditées.
  Aggravant : ces lignes sont attachées à des **paliers tarifaires payants**.
  **Correction** : retirer, ou marquer explicitement « à venir » et non inclus dans le prix.

- [ ] **A7 — maquette « Extraction intelligente PDF & Excel » présentée comme fonctionnalité** 🟠
  `apps/client/web/src/components/SchoolFocusSection.tsx:180`
  `apps/client/web/src/components/FeaturesGrid.tsx:138-161`
  La page d'émission réelle (`/ecole/diplomes/nouveau`) ne propose **que** le formulaire unitaire
  et l'import CSV. Aucune extraction PDF/Excel.
  **Correction** : aligner la maquette sur ce que fait réellement la page d'émission.

- [ ] **A8 — garde-fou automatisé contre la récidive** 🟠 *(nouveau — recommandé)*
  Le projet a déjà connu ce problème (« ZKP »), l'a corrigé, et il est réapparu ailleurs. Une
  règle écrite dans `copy.md` n'a pas suffi.
  **Correction** : ajouter une spec Jest qui balaie les sources des 3 apps clientes et **échoue**
  si une chaîne interdite y apparaît. Liste initiale : `ML-DSA`, `post-quantique`, `HSM`,
  `coffre matériel`, `TLS 1.3`, `techniquement impossible`, `ZKP`, `Groth16`, `zero-knowledge`.
  La liste doit être dérivée des tags `[V2]`/`[V3]`/`[V4]` de `copy.md` et commentée pour qu'on
  **retire** une entrée le jour où le chantier correspondant est livré.
  **Acceptation** : la spec échoue si on réintroduit volontairement une des chaînes, puis passe
  une fois A1–A7 corrigés.

---

## 4. Lot B — Sécurité 🔴

- [ ] **B1 — enrôlement MFA détournable** 🔴 **→ OPUS** *(signalé 2× depuis le 5 juillet)*
  `apps/server/src/modules/auth/auth.routes.ts:90-96` (`mfaPlan`), appelé `:160` (école) et
  `:751` (admin plateforme).
  **Constat** : tant que `totpEnabledAt` est `null`, **chaque** passage à l'étape 1 génère un
  **nouveau** secret TOTP et l'écrase en base (`.set({ totpSecret: plan.encrypted })`).
  **Deux conséquences** :
  (a) un attaquant en possession du mot de passe peut **s'enrôler à la place du titulaire** ;
  (b) un utilisateur légitime qui recommence l'étape 1 **invalide silencieusement** le QR code
  qu'il vient de scanner.
  **Historique** : identifié comme `Sec#4` dans `docs/audit-2026-07-05-legacy.md`, **puis à
  nouveau** comme `R2` dans `docs/audit-refonte-2026-07-07.md`, **puis** listé `P9` dans
  `PLAN.md`. Toujours ouvert au 2026-07-21.
  **Pourquoi Opus** : la correction touche la sémantique d'état de l'enrôlement et doit couvrir
  les deux réalms (école + admin) sans casser le parcours de première connexion ni le smoke E2E.
  **Piste** : figer le secret candidat pour la durée d'une fenêtre d'enrôlement (secret persisté
  une seule fois puis réutilisé tant que non confirmé), et exiger une preuve de possession avant
  tout remplacement.
  **Acceptation** : un test qui échoue sur le comportement actuel — deux étapes 1 successives
  doivent produire **le même** secret tant que l'enrôlement n'est pas confirmé — et qui passe
  après correctif, pour les deux réalms.

- [ ] **B2 — politique de sécurité navigateur permissive** 🟠 **→ OPUS**
  `packages/shared/src/config/security-headers.ts:49` : `script-src 'self' 'unsafe-inline'` sur
  les 3 applications. `Sec#5` de l'audit legacy, explicitement différé, toujours actif.
  **Pourquoi Opus** : passer en nonce/hash impacte les 3 apps Next.js simultanément, avec un
  risque réel de casser le rendu en production sans que ça se voie en développement.

- [ ] **B3 — vol de session non détecté** 🟠 **→ OPUS** *(P3)*
  Pas de rotation par **famille** de jeton de rafraîchissement : un jeton volé puis rejoué
  n'entraîne pas la révocation de la famille de sessions correspondante.
  **Pourquoi Opus** : logique d'état distribuée, forte capacité à provoquer des déconnexions en
  cascade si mal implémentée.

- [ ] **B4 — sel d'anonymisation partagé** 🟡 *(P5)* — Sonnet
  `apps/server/src/config/env.ts:145-148` : `AUDIT_IP_SALT` retombe sur `OTP_PEPPER` s'il n'est
  pas renseigné, et `.env.example` le laisse vide. Deux usages cryptographiques distincts
  partagent alors le même secret.
  **Correction** : valeur dédiée obligatoire, documentée dans `.env.example`, avant tout
  traitement de données réelles.

- [ ] **B5 — identifiants de démonstration documentés publiquement** 🟡 — Sonnet
  `apps/server/src/scripts/seed.ts:31,34` et `apps/server/src/scripts/smoke.ts:64` contiennent
  `DemoPassw0rd!24` / `AdminPassw0rd!24`, **repris tels quels dans `../portal.md`**.
  Le script n'est jamais lancé automatiquement au démarrage — mais un `pnpm db:seed` exécuté par
  erreur contre une base de production créerait des comptes dont le mot de passe est public.
  **Correction** : refus explicite d'exécution si `NODE_ENV=production` (ou si l'URL de base ne
  correspond pas à un environnement local), avec message clair.

- [ ] **B6 — entorse à la règle de configuration** 🟢 — Sonnet
  `apps/server/src/lib/logger.ts:12` lit `process.env.NODE_ENV` directement au lieu de
  `env.NODE_ENV`. **Seule** entorse trouvée à la règle CLAUDE.md §7 dans tout le serveur. Sans
  risque de sécurité (niveau de log uniquement), mais c'est le genre d'exception qui se propage.

---

## 5. Lot C — Cohérence documentaire 🟠

Ce lot ne change aucun comportement produit, mais **chaque reprise à froid coûte du temps** tant
qu'il n'est pas fait, et il a déjà produit une erreur réelle : le lot A est passé en partie parce
qu'un fichier d'instructions périmé affirmait que V2 n'était pas livrée.

- [ ] **C1 — `CLAUDE.md` périmé** 🟠
  `CLAUDE.md:41-43` affirme *« F1/F2 et V1 sont implémentées — Gate C Docker 64/64 ; V2–V4 ne sont
  pas encore implémentées »*. **Faux** : `PLAN.md:44-49` (plus récent, vérifié conforme au code)
  établit que V2 (couture Signer/KMS, 2026-07-14) et V3 (journal de transparence, 2026-07-15) sont
  livrées, Gate C 67/67, et que **seul V4** manque.
  **Correction** : resynchroniser `CLAUDE.md` sur l'état réel. Nuancer V2 : la **couture** est
  livrée, **l'infrastructure ne l'est pas** (voir A1/D5) — cette nuance est précisément celle qui
  s'est perdue.

- [ ] **C2 — `AGENTS.md` contredit `CLAUDE.md`** 🟠
  `AGENTS.md` (195 lignes) est un quasi-doublon de `CLAUDE.md`, **figé au 2026-07-13**, ajouté
  dans le **même commit** `91425bf` que le `CLAUDE.md` à jour. Il affirme encore que V2–V4 ne sont
  pas implémentées et son arborescence liste `MIGRATION-SWAP.md`, supprimé dans ce même commit.
  **Deux fichiers d'instructions projet se contredisent, committés ensemble.**
  **Correction** : trancher — source unique (`CLAUDE.md`) avec `AGENTS.md` réduit à un renvoi, ou
  génération de l'un depuis l'autre. Ne pas laisser deux copies éditées à la main.

- [ ] **C3 — trois comptes de tests divergents** 🟠 *(dépend de **E0**)*
  `README.md` : 129 / 300 / smoke 59 · `CLAUDE.md` : 181 / 326 (36 suites) / smoke 64 ·
  `PLAN.md` : 229 / 353 (40 suites) / smoke 67. Le comptage de fichiers sur disque (40 specs Jest)
  donne raison à `PLAN.md`.
  **Correction** : après `pnpm install`, **exécuter** les suites et propager le chiffre réel
  partout. Ne pas recopier un chiffre non exécuté.

- [ ] **C4 — lien mort vers ce fichier** 🟢
  `PLAN.md:327,329` renvoie vers `./audit.md` (24 constats du 2026-07-10), **supprimé** au commit
  `91425bf`. Contenu récupérable via `git show 0404edb:_refactor/audit.md`.
  **Correction** : pointer §3bis vers le présent fichier, ou restaurer l'ancien sous un nom daté
  (`docs/audit-2026-07-10.md`) et corriger le lien.

- [ ] **C5 — référence fantôme `verdict.md`** 🟢
  `PLAN.md` §« Audit de clôture F1/F2 » cite `verdict.md` (session 2026-07-13). Ce fichier
  **n'a jamais été committé** (`git log --all -- verdict.md` : aucun résultat). Référence
  invérifiable.
  **Correction** : supprimer la référence ou reconstituer le document.

- [ ] **C6 — `README.md` liste un fichier supprimé** 🟢
  `MIGRATION-SWAP.md` figure toujours en section Documentation ; supprimé dans le même commit qui
  a modifié `README.md`.

- [ ] **C7 — journal de bord interrompu** 🟠
  `PROGRESS.md` s'arrête à l'étape 11 (2026-07-07 = commit `452168d`). Les 8 jours suivants —
  **F1, F2, V1, V2, V3, soit l'essentiel de la feuille de route cryptographique** — ne sont
  journalisés nulle part, et tiennent en **deux commits massifs** (`0404edb`, puis `91425bf` :
  183 fichiers, +41 008/−687 lignes) sans granularité par chantier.
  **Correction** : soit reprendre le journal en étapes 12+ (reconstitution depuis `PLAN.md` et
  l'historique git), soit acter explicitement que `PLAN.md` devient le journal unique — et le
  dire dans `CLAUDE.md` §10. Le pire état est l'ambiguïté actuelle.

- [ ] **C8 — chemins d'une autre machine** 🟢
  `CLAUDE.md` §9 et l'en-tête de `PROGRESS.md` renvoient vers `C:\Users\alexa\...` (vault Obsidian,
  fichier de plan approuvé), alors que la session courante tourne sous `AlexandreSCHECHT`. Le
  logging automatique décrit en §9 est donc inopérant ici.
  **Correction** : rendre le chemin configurable, ou retirer la consigne si le vault n'est plus
  utilisé.

---

## 6. Lot D — Mise en production 🔴

- [ ] **D1 — connexion chiffrée absente** 🔴 *(P1)* — Sonnet, revue Opus
  Aucun `Caddyfile`, aucun service TLS, aucune mention de 443 dans `docker-compose.yml`. L'API est
  exposée en clair (`docker-compose.yml:148`). Bloque aussi **D4-bis** (interopérabilité EUDI, qui
  exige une origine HTTPS publique) et rend A3 mensonger.

- [ ] **D2 — secrets racine en variables d'environnement** 🔴 *(P2)* — Opus recommandé
  Clé privée de la racine PKI + `MASTER_ENC_KEY` injectées par variables d'env
  (`docker-compose.yml:63`), pas via un gestionnaire de secrets. Aucune cérémonie de rotation.

- [ ] **D3 — aucun envoi d'e-mail réel** 🔴 **produit inutilisable si oublié** — Sonnet
  `apps/server/src/lib/mailer.ts:28-34` : sans `SMTP_HOST`, les e-mails sont **abandonnés avec un
  simple `logger.warn("mail.dropped_no_smtp")`**. En production, cela signifie : **aucune
  invitation élève, aucun code de connexion, aucun lien de récupération ne part** — et rien ne le
  signale à l'utilisateur.
  **Correction** : souscrire un fournisseur réel **et** faire échouer le démarrage (ou au minimum
  émettre une alerte de niveau erreur) si `SMTP_HOST` est absent alors que `NODE_ENV=production`.
  Un envoi silencieusement perdu est pire qu'un démarrage refusé.

- [ ] **D4 — pages légales absentes** 🔴 **obligation réglementaire** — Sonnet
  `apps/client/web/src/components/Footer.tsx:17-38` : 10 liens en `href: null` (proprement grisés
  « Bientôt disponible »), dont **Conditions, Confidentialité, Cookies, RGPD**. Aucune de ces
  pages n'existe. Bloquant absolu avant toute ouverture au public, d'autant que le produit traite
  des données personnelles d'élèves (et des NIR chiffrés côté accrochage CDC).

- [ ] **D5 — coffre de clés réel non déployé** 🟠 — Opus recommandé
  La couture est réelle et de qualité : `apps/server/src/crypto/signer.ts` contient un **vrai**
  client HashiCorp Vault Transit (appels HTTP réels, gestion d'erreurs sans fuite de jeton,
  encodage SPKI correct). Mais `SIGNER_KIND` vaut `envelope` par défaut et **aucun service Vault
  n'existe dans `docker-compose.yml`**. `docs/kms/README.md:46-52` l'assume explicitement.
  **Correction** : déployer Vault/OpenBao, basculer au moins les nouvelles écoles en `kms`,
  définir la stratégie de migration des écoles existantes. **Conditionne A1.**

- [ ] **D6 — ancrage public : durabilité du processus** 🟠 — Sonnet
  Le client OpenTimestamps est réel (réimplémentation binaire complète du format `.ots`, appels
  réseau réels aux calendriers publics configurés par défaut, `docker-compose.yml:109`). Mais la
  planification tourne **en mémoire dans une seule instance**
  (`apps/server/src/modules/transparency/checkpoint.service.ts:302-319`).
  **Correction** : processus de production durable pour `runOtsMaintenance` ; puis laisser tourner
  plusieurs jours pour obtenir de vraies confirmations (`ots_upgraded_at` non nul) — délai
  intrinsèque, non compressible. L'interface n'affiche jamais « ancré » avant confirmation : ce
  comportement est correct, ne pas le « corriger ».

- [ ] **D7 — limitation de débit mono-instance** 🟡 *(P7)* — Sonnet
  `apps/server/src/middleware/rate-limit.ts:30` : compteurs en mémoire. Bloquant uniquement le
  jour où l'API tourne en plusieurs exemplaires. Redis prévu et documenté.

- [ ] **D8 — V4 post-quantique : décider** 🟠 — Opus si implémenté
  Seul chantier de `v2.md` jamais commencé. **Deux voies, à trancher explicitement** : l'implémenter
  (signature hybride ML-DSA, `@noble/post-quantum`, `PQ_POLICY` — spécifié en `v2.md` §V4), ou
  acter son report et **maintenir A4 corrigé**. Le verrou de mise en ligne documenté dans
  `CLAUDE.md` §1 est actuellement adossé à V4 : si la décision est de reporter, **le verrou doit
  être redéfini explicitement**, sinon il bloque indéfiniment.

---

## 7. Lot E — Tests 🟠

- [ ] **E0 — PRÉALABLE : réinstaller et établir la ligne de base** 🔴
  Voir §0.3. **Aucun chiffre de test de ce fichier n'est confirmé par exécution.**

- [ ] **E1 — 7 modules serveur sur 12 sans test dédié** 🟠 *(P10, ouvert dans `PLAN.md`)*
  Sans aucune couverture propre : **`auth`** (service, routes, claim — seules les briques
  bas-niveau TOTP/OTP/jetons/cookies sont testées, pas leur orchestration), **`schools`** (dont
  `validation.service.ts` : auto-validation SIRENE/Gemini, **zéro référence** dans tout test),
  **`admin`**, **`audit`**, **`wallet`**, **`billing`** (seule `verifyWebhookSignature` est
  testée), **`verify`** (la route publique du recruteur n'est couverte qu'indirectement).
  **Priorité suggérée** : `auth` > `verify` > `schools/validation` > le reste. Ce sont les
  chemins où une régression est à la fois la plus probable et la plus coûteuse.
  `packages/contract` (schémas Zod, source de vérité du contrat) n'a lui non plus aucun test propre.

- [ ] **E2 — deux fichiers de tests verts sans rien tester** 🟠 **piège de lecture**
  `apps/server/test/modules/accrochage/service.test.ts:51` et
  `apps/server/test/modules/vc/flow.test.ts:39` appellent `requireIntegration(t)` → `t.skip()`
  quand PostgreSQL est injoignable. **Ils skippent alors la totalité de leurs sous-tests tout en
  apparaissant « verts »** dans un résumé de run.
  **Correction** : rendre le skip bruyant (résumé explicite en fin de run) et le **transformer en
  échec** quand une variable de CI est présente. Sinon un jour on livrera en croyant ces
  parcours testés.

- [ ] **E3 — parcours paiement et ProConnect non rejoués de bout en bout** 🟡
  `apps/server/src/scripts/smoke.ts` : recherche `stripe|billing|checkout|postal` → **0 résultat**.
  La correction cryptographique de la signature du webhook est testée unitairement (7 cas), et le
  parcours complet est documenté manuellement dans `../GUIDE_TEST_VERIFICATION.md` §4 — mais rien
  d'automatique ne couvre encaissement → webhook → activation d'abonnement.

- [ ] **E4 — aucun outil de couverture configuré** 🟢
  Ni istanbul, ni nyc, ni `--coverage` nulle part. Tous les jugements de couverture de cet audit
  sont des inventaires fichier par fichier, **pas des pourcentages de lignes**.

- [ ] **E5 — guides de test manuels périmés** 🟢
  `../GUIDE_TEST.md` (annexe) annonce **32 tests** automatisés — chiffre très ancien, sans aucune
  mention de la suite Jest. À resynchroniser avec C3.

---

## 8. Lot F — Confort et dette 🟢

Les six premiers items sont les recommandations `R1`–`R6` de `docs/audit-refonte-2026-07-07.md`,
déclarées « non bloquantes ». **Vérification du 2026-07-21 : aucune des six n'a été appliquée.**

- [ ] **F1** *(=R1/P6)* — 5 états publics de vérification à fusionner en 2 —
  `apps/client/web/src/components/verify/FailedCard.tsx:9-49` (`not_found`/`revoked`/`expired`/
  `invalid` + `verified`). Distinguer publiquement ces cas donne de l'information à un attaquant.
- [ ] **F2** *(=R3)* — exceptions avalées sans retour utilisateur —
  `apps/client/wallet/src/app/claim/[token]/page.tsx:86-90,100-104,120-127` : chaque `catch` ne
  traite que `ApiClientError`, aucune branche générique. Une panne réseau est donc silencieuse.
- [ ] **F3** *(=R4)* — pas de pagination ni d'archivage des liens de partage —
  `apps/client/wallet/src/components/wallet/SharePanel.tsx:405-428`.
- [ ] **F4** *(=R5)* — inscription école synchrone —
  `apps/server/src/modules/schools/schools.routes.ts:120-151` : SIRENE puis Gemini appelés **dans**
  la requête d'inscription. Lenteur perçue, et échec externe = échec d'inscription.
- [ ] **F5** *(=R6)* — en-tête `RateLimit-Remaining` posé côté serveur
  (`apps/server/src/middleware/rate-limit.ts:61`) mais **jamais lu** côté client. Aucun message
  « réessayez dans X s ».
- [ ] **F6 — empreinte décorative trompeuse** 🟡
  `apps/client/wallet/src/components/wallet/DiplomaDetailCard.tsx:113` : l'« empreinte »
  affichée (`0x{id}…Ed25519 ✓`) est **fabriquée à partir de l'identifiant du diplôme**, ce n'est
  pas une empreinte cryptographique calculée. Purement cosmétique — mais dans un produit dont
  l'argument **est** la preuve cryptographique, afficher une fausse empreinte est un mauvais
  signal. La vraie vérification, elle, est correcte (`/verify/[token]`).
- [ ] **F7 — libellé brut dans le back-office** 🟢
  `apps/client/admin/src/app/schools/[id]/page.tsx:524` affiche le code technique `e.type` au lieu
  de passer par `AUDIT_LABELS`, utilisé partout ailleurs.
- [ ] **F8 — code mort** 🟢
  `apps/client/web/src/lib/api/endpoints.ts:72-78` (`requestOtp`, `verifyOtp` — logique élève sans
  objet dans l'app école) et `:283-293` (`getLogCheckpoint`, `getInclusionProof` — jamais
  appelées). Ces deux dernières suggèrent qu'une page « explorateur du registre public » (`v2.md`
  §V3) a été prévue puis abandonnée : **trancher** — la construire ou retirer les fonctions.
- [ ] **F9 — pas de pages d'erreur dédiées** 🟢
  Aucun `loading.tsx` / `error.tsx` / `not-found.tsx` dans les 3 apps (chaque page gère son propre
  chargement, ce qui fonctionne). Conséquences : une adresse inexistante tombe sur la 404 générique
  non habillée, et un plantage de rendu n'a aucun filet.
- [ ] **F10 — adresse commerciale non confirmée** 🟢
  `apps/client/web/src/app/(school)/ecole/parametres/page.tsx:23-25` : commentaire explicite
  *« Placeholder — confirm the real address before going live »* sur `SALES_EMAIL`.
- [ ] **F11 — pas de « mot de passe oublié »** 🟡
  Ni pour les écoles, ni pour les administrateurs. Aucune interface ne le promet (donc aucun lien
  mort), mais la fonctionnalité n'existe pas — chaque oubli deviendra une intervention manuelle.
- [ ] **F12 — prix affichés en dur** 🟢
  `apps/server/src/modules/billing/billing.service.ts:19-46` (`PLAN_CATALOG`) : libellés
  « 49 €/mois », « 149 €/mois », « 399 €/mois ». Le code reconnaît lui-même que Stripe fait foi
  sur le montant réellement facturé — un changement de prix côté Stripe ferait diverger l'affichage.
- [ ] **F13 — bibliothèques prescrites remplacées par du code maison** 🟢 **décision à acter**
  `features.md` prescrivait `fast-xml-parser` (F1-5.3) et `@sd-jwt/core` / `@sd-jwt/sd-jwt-vc` /
  `@owf/token-status-list` (F2-5). Aucune n'est installée : l'équivalent a été écrit à la main,
  **testé et documenté** (`docs/eudi/README.md:77-84` — refus d'une dépendance native `cbor-x`).
  Ce n'est pas un défaut, mais c'est un écart à la spécification écrite : **l'acter formellement**
  dans une décision d'architecture, faute de quoi un audit de conformité externe s'attendant à ces
  bibliothèques le relèvera.

---

## 9. Confirmé FAIT — ne pas re-travailler

Vérifié dans le code pendant cet audit. **Un agent qui « corrige » ces points fait une régression.**

| Sujet | Preuve |
|---|---|
| **V1** divulgation sélective + vérificateur navigateur | `apps/server/src/crypto/{disclosures,hashing,sd-emission,proof-engine}.ts`, `packages/shared/src/crypto/verify-bundle.ts:51-111`. Les 7 étapes de vérification sont conformes à la spec. **La vérification a bien lieu dans le navigateur** et le verdict affiché dépend du résultat client, jamais du seul mot du serveur (`VerifyExperience.tsx:59-66`) — corrige le bug legacy #9. |
| **F1** accrochage CDC | XML **validé contre le XSD officiel** via `xmllint` (`docs/cdc/README.md:84-93`). Le dépôt manuel **est** le protocole officiel actuel (Phase A/B) — l'absence d'appel API vers la CDC est conforme, ce n'est **pas** un bouchon. Phase B (compte-rendu) livrée **en avance**. |
| **F2** export EUDI | OpenID4VCI 1.0 final + SD-JWT VC + Token Status List réels. La preuve est vérifiée **avant** consommation du jeton à usage unique (`vc.service.ts:346-484`) — plus strict que la spec. |
| **V3** journal de transparence | Merkle RFC 6962, insertion transactionnelle sous verrou consultatif, checkpoints signés, client OpenTimestamps binaire complet avec appels réseau réels. |
| **Paiement Stripe** | Client REST réel ; **signature de webhook vérifiée en temps constant** avec anti-rejeu et rotation de secret (`apps/server/src/lib/stripe.ts:145-179`) ; abonnements réellement persistés ; `handlePostalPaid` idempotent. 7 cas de test dédiés. |
| **ProConnect** | Vrai client OIDC : découverte dynamique, `state`+`nonce`, **vérification cryptographique** de l'`id_token` via JWKS distant, `userinfo` signé également vérifié, comparaison stricte du SIRET. Le mock `dev/proconnect-mock/` est un faux **serveur** isolé au compose de développement, jamais un faux client — aucune branche « si dev alors valider ». |
| **Les 12 modules serveur** | Aucun squelette, aucune route renvoyant une réponse fixe déguisée. |
| **Les 23 écrans clients** | Tous câblés, chargement/erreurs/états vides gérés, confirmations avant action destructive. |
| **Base de données** | 17 migrations cohérentes avec leur journal, 25 tables, **aucune table orpheline**, aucune fonctionnalité sans table. |
| **Propreté du code** | Zéro `TODO`/`FIXME`/`any`/`@ts-ignore` dans `apps/` + `packages/`. Zéro `console.log` hors scripts CLI (tous avec désactivation explicite). |
| **Purge « ZKP »** | Zéro occurrence dans toute copie affichée. Les 2 mentions de `Groth16` sont des commentaires de code qui **documentent l'abandon** — les conserver. |
| **Durcissement conteneurs** | Distroless non-root confirmé, `TRUST_PROXY` et bind admin/API en `127.0.0.1` toujours en place (Sec#7/#8 corrigés). |

---

## 10. Bloqué par des tiers — ne pas tenter, ne pas prétendre

- **Dépôt réel sur l'environnement de test CDC** — aucun environnement public de préproduction
  n'est documenté ; nécessite une coordination avec la Caisse des Dépôts.
- **Interopérabilité avec un portefeuille EUDI tiers réel** — exige une origine HTTPS publique,
  donc **dépend de D1**.

Les deux sont honnêtement documentés comme reportés dans `PLAN.md:116-119`. `features.md` autorise
explicitement le report motivé. **Règle : ne jamais cocher ces items sans preuve externe.**

---

## 11. Journal des corrections

À remplir au fil de l'eau. Une ligne par item traité, quel que soit le résultat.

| Date | Item | Agent | Correctif appliqué | Vérification (commande + résultat) |
|---|---|---|---|---|
| | E0 | | ligne de base : `pnpm test` = ? · `pnpm test:jest` = ? · `typecheck` = ? | |

---

## 12. Commandes de validation

```powershell
# Toolchain — PowerShell obligatoire (piège corepack sous Git Bash, cf. §0.5)
$env:PATH = "$env:APPDATA\fnm\node-versions\v24.16.0\installation;" + $env:PATH
corepack pnpm -v                # 9.12.0

corepack pnpm install           # PRÉALABLE (node_modules absent)
corepack pnpm typecheck         # -r sur tout le workspace
corepack pnpm test              # node:test (serveur)
corepack pnpm test:jest         # Jest, 5 projets
corepack pnpm lint

# Juge de paix = Docker
docker compose config -q ; docker compose build
docker build --target builder -t certifychain-server-builder -f apps/server/Dockerfile .
docker run --rm -v "${PWD}/.env:/app/.env:ro" -w /app/apps/server certifychain-server-builder pnpm test

# Smoke E2E — stack dev + seed d'abord
docker compose -f docker-compose.yml -f docker-compose-dev.yml up -d
corepack pnpm db:seed ; corepack pnpm smoke
```

### Vérifications propres au lot A

```bash
# Doit ne renvoyer AUCUN résultat une fois A1-A7 corrigés
grep -rn "coffre matériel\|ML-DSA\|Post-quantique\|HSM\|TLS 1\.3\|techniquement impossible" apps/client/*/src
```

---

## 13. Sources de cet audit

Documents lus intégralement : `PLAN.md`, `PROGRESS.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`,
`copy.md`, `features.md` (871 l.), `v2.md` (870 l.), `plan-tests-jest.md`, `usage_features.md`,
`docs/audit-refonte-2026-07-07.md`, `docs/audit-2026-07-05-legacy.md`, `docs/architecture.md`,
ADR 0001-0005, `docs/{cdc,eudi,kms}/README.md`, et à la racine `../GUIDE_TEST.md`,
`../GUIDE_TEST_VERIFICATION.md`, `../GUIDE_PROCONNECT_STRIPE.md`, `../portal.md`.

Historique git analysé : `452168d` (étape 11, 07-07) → `0404edb` (« v1 finished », 07-12) →
`91425bf` (« v2 part 1, 2 and 3 », 07-15, 183 fichiers).

Volume du code audité : ~39 000 lignes — serveur 15 919 · web 9 752 · portefeuille 2 291 ·
back-office 2 502 · bibliothèques partagées 4 209 · tests 4 633.

**Limites assumées** : aucune commande n'a pu être exécutée (dépendances absentes) — les
compteurs de tests, de builds et de smoke ne sont pas vérifiés. Les 14 constats qualité de
l'audit legacy 2026-07-05 déclarés corrigés n'ont pas été re-vérifiés un par un (deux
vérifications ponctuelles positives : libellé « ZKP » et liens morts du pied de page).

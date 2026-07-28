# reste-a-faire.md — Ce qu'il reste à corriger, implémenter, sécuriser et optimiser

> **Ce que ce fichier est.** L'unique inventaire du travail restant sur CertifyChain. Il remplace
> `audit.md`, `copy.md`, `features.md`, `PLAN.md` et `v2.md`, supprimés après vérification de
> **chacun** de leurs points contre le code réel.
>
> **Ce que ce fichier n'est pas.** Un journal. Ce qui est fait, testé et validé n'y figure pas —
> sauf dans §0.2 (« confirmé fait »), qui existe uniquement pour éviter qu'on re-travaille du
> terrain déjà couvert.
>
> **Méthode.** Chaque entrée a été confrontée au code par un agent de vérification indépendant, à
> partir des chaînes de caractères réelles (jamais des numéros de ligne des anciens documents, qui
> avaient bougé). Un point déclaré corrigé dans les anciens documents mais toujours présent dans le
> code est ici marqué **OUVERT** ; un point encore listé comme à faire mais réellement livré depuis
> a été **retiré**.
>
> **Voisins.** [`dette-technique.md`](./dette-technique.md) = dettes assumées avec leur déclencheur ·
> [`infra.md`](./infra.md) = actions hors-code (provisionnement, souscription, tiers). Ce fichier-ci
> renvoie vers eux plutôt que de les recopier.

---

## 0. État de la consolidation

### 0.1 Sources absorbées

| Source | Vérifiée | Absorbée | Supprimée |
|---|---|---|---|
| `audit.md` (2026-07-21, 6 lots, 48 items) | ✅ | ✅ | ✅ |
| `copy.md` (deck de copie, 11 surfaces + tableau claim→preuve) | ✅ | ✅ | ✅ |
| `features.md` (cahiers des charges F1 CDC + F2 EUDI, DoD + pièges) | ✅ | ✅ | ✅ |
| `PLAN.md` (chantiers P1–P10, lot Confort, limites consignées, mémos) | ✅ | ✅ | ✅ |
| `v2.md` (spécifications V1→V4, socle commun, 4 DoD) | ✅ | ✅ | ✅ |

**Consolidation terminée.** Les cinq sources ont été vérifiées contre le code, absorbées ici, puis
supprimées. Il ne reste que trois documents de pilotage : ce fichier, `dette-technique.md` et
`infra.md`.

### 0.2 Ordre d'exécution recommandé

Le produit est **techniquement bien plus abouti que ce que les anciens documents laissaient
croire** : les six chantiers cryptographiques (F1, F2, V1→V4) sont réellement implémentés, conformes
à leur spécification, et couverts par des tests. **Le risque dominant n'est pas technique — il est
contractuel et réglementaire.**

| Ordre | Lot | Pourquoi d'abord |
|---|---|---|
| 1 | `SEC-0` (e-mail en clair dans les logs) | Fuite de PII active, en production, correctif de 5 lignes |
| 2 | `COPY-1` → `COPY-8`, `COPY-11` | Risque juridique immédiat, coût faible, aucune dépendance |
| 3 | `LEGAL-1` (pages légales) | Bloquant absolu et long à produire — à lancer tôt, en parallèle |
| 4 | `PROD-1` (e-mails perdus en silence) + `infra.md` §2 | Sans ça le produit ne fonctionne pas en production |
| 5 | `SEC-1` (rétrogradation PQ) puis `SEC-2`, `SEC-3` | Une garantie annoncée est fausse ; les deux suivants sont du durcissement |
| 6 | `TEST-1`, `TEST-5`, `TEST-6` | Filets sur les chemins où une régression coûte le plus cher |
| 7 | `COPY-3`/`PROD-2` + `infra.md` §3 (TLS, domaine) | Débloque aussi l'interopérabilité EUDI réelle |
| 8 | `DEC-1` (levée du verrou) | Ne peut être décidé qu'une fois 1→7 faits |
| 9 | `DOC-*`, `QUAL-*`, `UX-*`, `PROD-3`/`PROD-4` | Confort, dette et exploitation — utile, jamais urgent |

**Un mot sur la nature du travail restant** : rien de ce qui suit ne demande de reprendre une
décision d'architecture. Ce sont des correctifs bornés, des pages à écrire et des tests à ajouter.

### 0.3 Confirmé fait — ne pas re-travailler

Vérifié dans le code au 2026-07-28. Ces points étaient listés comme ouverts dans `audit.md` et ne
le sont plus :

- **Post-quantique ML-DSA-65 réellement livré** (`packages/shared/src/crypto/ml-dsa.ts`,
  `PQ_POLICY` défaut `require` dans `config/env.ts:281`, migrations `0017`/`0018`, moteur
  `ed25519-sd-v3`, suites de tests dédiées). L'affichage « Post-quantique · ML-DSA » du bandeau
  d'accueil est donc **devenu vrai** — ne pas le retirer.
- **Rotation des jetons de rafraîchissement par famille** (migration `0019_refresh_families`,
  `isRotationRace` + fenêtre de grâce 10 s, révocation de famille + audit, testée bout-en-bout).
- **`AUDIT_IP_SALT` dédié** — champ Zod obligatoire, plus aucun repli sur `OTP_PEPPER`.
- **Règle « jamais `process.env` en code produit serveur »** — 0 occurrence restante hors
  `config/env.ts` (résolution volontaire des Docker secrets) et `scripts/`.
- **Secret TOTP stable en pré-enrôlement** — corrigé pour les **deux** réalms (école et admin) ;
  seul le test d'acceptation manque (voir `TEST-1`).
- **Secrets racine en Docker secrets** — `docker-compose.secrets.yml` + convention `<VAR>_FILE`
  + cérémonie documentée.
- **États publics de vérification fusionnés** — `FailedCard.tsx` ne rend plus qu'un seul verdict
  « Diplôme introuvable » pour tous les cas d'échec.
- **Retour utilisateur sur exception générique** (wallet `claim`) et **message « réessayez dans
  X s »** sur 429 (`Retry-After` / `RateLimit-Reset` lus par `unwrap()`).
- **`getLogCheckpoint` / `getInclusionProof`** retirés du client web (code mort supprimé).
- **`AGENTS.md`** supprimé du disque (la suppression reste à committer).
- **F1 — accrochage CDC : cahier des charges vérifié ligne à ligne, conforme.** NIR validé (clé de
  contrôle + cas Corse 2A/2B testés par mutation des 13 positions), chiffré lié au `diplomaId`
  (anti-substitution), purgé par `cleanup.ts`, et **absent de tout DTO, log et message d'erreur**.
  XML déterministe, échappé, golden test byte-exact, validé XSD 1.1.5, jamais stocké, configuration
  figée par lot. CRT XXE-safe. Routes en realm école avec CSRF, `bodyLimit` et rate-limits dédiés.
- **F2 — export EUDI : cahier des charges vérifié ligne à ligne, conforme.** Clé ES256 en base
  (verrou consultatif, chiffrement `keyVault`, refus si clé active sauf `--rotate`), preuve du
  holder vérifiée **avant** consommation atomique du code (testé : « une preuve forgée ne brûle pas
  le token »), `tx_code` à compteur d'essais atomique, SD-JWT VC et Token Status List sur vecteurs
  officiels, mécanique de disclosure **partagée** avec `crypto/disclosures.ts` sans duplication, et
  `batch_credential_issuance` correctement **non annoncé** dans la metadata.
- **Chantiers P1 à P10 et lot Confort : toutes les déclarations d'achèvement sont VRAIES.**
  Vérification item par item, **zéro écart** entre ce qui était déclaré et ce que fait le code —
  fait notable, c'est rare. En particulier : la fusion des états de vérification est bien une
  **couche de présentation seule** (les 5 états restent distincts dans le DTO et dans l'audit
  interne) ; le rate-limit est bien une **fenêtre glissante pondérée à deux compartiments** (pas une
  fenêtre fixe déguisée) avec `VERIFY_IP=240` / `VERIFY_REVOCATION_IP=120` ; `engineFor` résout bien
  le moteur **par diplôme** ; le request-id est injecté dans **chaque** log via `AsyncLocalStorage`.
- **Les diplômes anciens (`proof_version='v1'`) restent vérifiables** — test de non-régression dédié
  (`test/crypto/sd-v2.test.ts:236-259`) qui rejoue une vérification v1 à l'octet près. Les trois
  moteurs (`ed25519-nonce-v1`, `ed25519-sd-v2`, `ed25519-sd-v3`) coexistent sans que l'ajout des
  suivants n'ait touché le premier.
- **Mémos S7 et WA3 tranchés** — voir `DOC-10`. Aucun des deux n'est un défaut.
- **V1 — divulgation sélective `ed25519-sd-v2` : format conforme à la spécification, à l'octet
  près.** Sel de 16 octets base64url, digest SHA-256 de la **chaîne** base64url, `_sd` trié
  lexicographiquement, 7 champs toujours signés y compris `null`, sels chiffrés AES-256-GCM au
  repos. Racine de confiance lue **depuis la configuration** serveur **et** navigateur, jamais
  depuis le bundle vérifié (le piège de la racine auto-signée est refermé). Route de révocation en
  404 uniforme et rate-limitée. `holderEmail` bien **décoché par défaut**. Une seule implémentation
  de vérification, partagée.
- **V2 — le « grep de garde » est réel et exécutable.** Un test `node:test` lit récursivement
  `modules/schools` et `modules/diplomas` et rejette toute manipulation de PEM privé hors de
  `signer.ts` — avec une auto-vérification que le scan trouve bien les fichiers avant de conclure.
  `KmsSigner` en `fetch` pur sans SDK, testé pour ne jamais laisser fuiter le token dans une erreur.
  Un signer `kms` sans `signer_ref` renvoie `null` — **jamais** de repli silencieux sur la clé
  legacy.
- **V3 — journal de transparence conforme RFC 6962.** Préfixes `0x00`/`0x01`, preuves d'inclusion
  testées sur n∈[1,64], preuves de cohérence sur toutes les paires n≤16, vecteurs CT historiques
  figés. Feuille **hachée, zéro PII** (testé par recherche de sous-chaîne). `leaf_index` attribué
  **dans** la transaction d'émission sous verrou consultatif — et un test force l'échec d'insertion
  du journal pour prouver que **toute l'émission** est annulée. Le bundle ne devine **jamais** une
  valeur masquée (mode `hash-only`). « Ancré » n'est jamais affiché avant `ots_upgraded_at`.
- **V4 — les impacts que la spécification demandait de mesurer l'ont été.** Consignés dans
  `docs/architecture/decisions/0006-post-quantum-hybrid.md` §5 : clé publique 1952 o, clé privée
  4032 o, signature 3309 o, ~6,3 ms par signature et ~1,8 ms par vérification, soit ≈12,6 s pour un
  import CSV au plafond de 2000 lignes. C'était le point le plus susceptible d'avoir été sauté ; il
  ne l'a pas été.
- **Règles transversales du socle vérifiées conformes** : RPC Hono chaîné sur les 12 fichiers de
  routes (sonde `rpc.type-test.ts` présente, cast `validator.ts` intact, `hono ^4.6.14` aligné sur
  les 4 apps) · CSRF sur **toutes** les mutations authentifiées par cookie (les 3 exceptions —
  OAuth bearer F2, webhook Stripe signé, callback ProConnect par `state` — sont légitimes) ·
  limites de corps route-aware · `packages/shared` sans aucun import serveur · migrations
  manuscrites numérotées **en continu 0000→0020** avec miroir `schema.ts` à jour · piège
  `ALTER TYPE … ADD VALUE` jamais réutilisé dans la même migration · **une seule** implémentation
  de vérification partagée serveur/navigateur · 4 images distroless non-root.

---

## 1. 🔴 Promesses affichées non tenues — risque contractuel

**La règle du projet** (héritée de `copy.md`, à conserver après sa suppression) : une fonctionnalité
ne s'affiche pas avant d'être en production. Le produit a déjà affiché « ZKP Groth16 » sans
zero-knowledge implémenté ; la landing prend des paiements, donc une promesse non tenue n'est pas
une maladresse marketing mais un litige commercial.

**Deux issues par item : (a) retirer la promesse, (b) livrer la fonctionnalité. Tant que (b) n'est
pas fait, (a) est obligatoire.**

### COPY-1 — 🔴 « Coffre matériel » affiché inconditionnellement à chaque école cliente
`apps/client/web/src/app/(school)/ecole/dashboard/page.tsx:304-307`
Texte affiché : *« Votre clé ne quitte jamais son coffre matériel — même nous ne pouvons pas
l'extraire »*, sans aucune condition.
**Réalité** : `SIGNER_KIND` vaut `envelope` par défaut (`apps/server/src/config/env.ts:252`) et
aucun service Vault n'est déployé — les clés sont chiffrées **en base**, donc extractibles avec un
dump + `MASTER_ENC_KEY`. L'affirmation est fausse, et elle est adressée à un client payant sur son
propre tableau de bord.
Aggravant : le DTO consommé par ce dashboard n'expose même pas `signerKind`
(`packages/contract/src/dto.ts:29,566` — seul `hasKeys` sort).
**À faire** : exposer `signerKind` dans le DTO école, puis conditionner le texte à
`signerKind === "kms"` — sinon reformuler sur ce qui est vrai aujourd'hui (chiffrement fort au
repos, clé jamais transmise à un tiers). Ne laisser aucune formulation inconditionnelle.
**Dépend de** : `infra.md` §1 (déploiement Vault).

### COPY-2 — 🔴 Badge « Clés privées HSM » sur la page d'accueil publique
`apps/client/web/src/components/WaitlistSection.tsx:173`
Même écart que COPY-1, mais visible de **tout visiteur non authentifié**. Aucun HSM matériel
n'existe dans le dépôt — seulement un KMS logiciel (Vault Transit) optionnel et non déployé.
**À faire** : retirer le badge.

### COPY-3 — 🔴 Badges « Chiffrement TLS 1.3 » affichés alors que TLS n'est pas actif par défaut
`apps/client/web/src/components/WaitlistSection.tsx:172` ·
`apps/client/web/src/components/PricingSection.tsx:245`
**Réalité** : le `Caddyfile` et le service `caddy` existent bien (`docker-compose.yml:334-377`),
mais sous un **profil optionnel** (`--profile proxy`) qui n'est pas actif par défaut, et le
Caddyfile ne termine TLS que pour l'**API** — les 3 fronts restent commentés
(`Caddyfile:37-48`). Sans le profil, le port 4000 est publié en clair (`docker-compose.yml:171`).
**À faire** : soit compléter le `Caddyfile` (3 fronts) et faire du profil `proxy` le mode de
déploiement de production documenté, soit retirer les badges jusque-là.
**Dépend de** : `infra.md` §3 (domaine public + ports 80/443).

### COPY-4 — 🟠 Formulation bannie dans l'aperçu de partage social
`apps/client/web/src/app/layout.tsx:48`
`openGraph.description` contient toujours mot pour mot : *« Rendez la fraude aux diplômes
techniquement impossible. »*
**Pourquoi c'est faux** : la cryptographie empêche la **falsification** d'un diplôme ; elle
n'empêche pas une école malhonnête d'émettre un **vrai** diplôme à un imposteur. Cette formulation
est visible dans tout partage LinkedIn / X / Facebook.
**À faire** : reformuler sur la vérifiabilité — « un document falsifié n'aura jamais une signature
valide » ou « un faux diplôme ne passe plus ».

### COPY-5 — 🔴 Fonctionnalités d'IA vendues dans la grille tarifaire
`apps/client/web/src/components/PricingSection.tsx:34-37,55`
Vend, sur des paliers **payants** : *« IA Beta : extraction, anomalies »*, *« Assistant Élève
LinkedIn »*, *« IA : scoring, traduction »*.
**Réalité** : aucune de ces fonctionnalités n'existe. Recherche `anomal|traduction|LinkedIn|scoring`
sur `apps/server` → néant. Le seul usage réel de Gemini est
`modules/schools/validation.service.ts` (vérification SIRET à l'inscription école), sans aucun
rapport.
**À faire** : retirer ces lignes, ou les marquer explicitement « à venir — non inclus dans le
prix ». C'est le mensonge le plus coûteux juridiquement : une fonctionnalité facturée qui n'existe
pas.

### COPY-6 — 🟠 Maquette « Extraction intelligente PDF & Excel » présentée comme fonctionnalité
`apps/client/web/src/components/FeaturesGrid.tsx:135-145` ·
`apps/client/web/src/components/SchoolFocusSection.tsx`
La page d'émission réelle (`/ecole/diplomes/nouveau`) n'importe que `createDiploma` (formulaire
unitaire) et `importDiplomasCsv`. Aucune route ni fonction d'extraction PDF/Excel n'existe.
Un badge « École · Beta » a été ajouté depuis l'audit — **insuffisant** : la fonctionnalité est
inexistante à 0 %, « Beta » suppose un embryon.
**À faire** : aligner la maquette sur le réel (formulaire + CSV), ou implémenter l'extraction
avant de la montrer.

### COPY-7 — 🟠 Aucun garde-fou automatisé contre la récidive
Le projet a déjà connu ce problème (« ZKP »), l'a corrigé, et il est réapparu ailleurs (COPY-1 à
COPY-6). Une règle écrite dans un document n'a pas suffi — et le document qui la portait
(`copy.md`) n'existe plus.
Recherche `Groth16|coffre matériel|ZKP|zero-knowledge` dans les 49 specs Jest → **0 fichier**.
**À faire** : une spec Jest qui balaie les sources des 3 apps clientes et **échoue** si une chaîne
interdite y apparaît. Liste initiale : `ZKP`, `Groth16`, `zero-knowledge`, `preuve à divulgation
nulle`, `SnarkJS`, `HSM`, `coffre matériel`, `techniquement impossible`, `blockchain Polygon`,
`NFT`, `W3C Verifiable Credentials`, `EQAR`, `certifié RGPD`, `100 % sécurisé`, `inviolable`.
Chaque entrée doit être commentée avec la condition de son retrait (ex. `HSM` et `coffre matériel`
sortent de la liste le jour où `SIGNER_KIND=kms` est actif en production).
**Acceptation** : la spec échoue si on réintroduit volontairement une chaîne, et passe une fois
COPY-1 à COPY-6 traités.

### COPY-8 — 🟠 Chiffres affichés sans source citable
`apps/client/web/src/components/ProblemSection.tsx:13-41`
Trois compteurs, dont deux invérifiables :
- **`30 %`** « des CV contiennent une inexactitude » — le texte visible dit « selon plusieurs
  études européennes » sans en nommer **aucune**, ni lien, ni commentaire de code.
- **`± 3 sem.`** « pour vérifier un diplôme par e-mail » — **aucune** source, nulle part.
- `< 10 s` « avec CertifyChain » — promesse produit mesurable, celle-là est légitime.

`apps/client/web/src/components/SchoolFocusSection.tsx:202` — la maquette de dashboard affiche
**« Taux fraude : 0 % »**, chiffre décoratif sans source, dans un encart qui imite une donnée
réelle.
**Règle à tenir** : un chiffre sans source publique citable dégage. Un « 30 % » invérifiable est
exactement le type de claim qu'un concurrent ou un client mécontent attaque en premier.
**À faire** : sourcer nommément (référence citable dans le texte visible), ou retirer.

### COPY-9 — 🟠 Gain marketing V1 non encaissé sur la colonne élève
`apps/client/web/src/components/HowItWorksSection.tsx:62-73`
La divulgation sélective **est livrée** (V1), mais la colonne élève n'en dit rien : elle liste
« Connexion email + OTP » et « Liens de partage éphémères ». La ligne prévue — *« Vous choisissez
ce que vous montrez — Programme seul ? Mention comprise ? Votre e-mail reste privé par défaut. »* —
n'est nulle part.
C'est le seul argument que la concurrence ne peut pas copier et il n'est pas affiché.
**À faire** : poser cette ligne dans la colonne élève.
**Vérifier au passage** : la puce recruteur « Vérifié en < 2 s — lien à usage unique : un lien
capturé ne rejoue pas » a disparu de la colonne (réduite à 2 puces). Régression involontaire
probable.

### COPY-10 — 🟢 Écarts de cohérence sans risque contractuel
Aucun de ces points n'est un mensonge — ce sont des pertes de force ou des divergences de wording.
À traiter en une passe éditoriale unique :
- `FeaturesGrid.tsx:397-406` : deux mentions `[LIVE]` ont disparu du bandeau défilant — **« Lien à
  usage unique »** et **« Clés chiffrées AES-256-GCM »**. Ce sont deux différenciateurs réels.
- `CryptoSection.tsx:143-146` : titre de section « Six étapes cryptographiques. Zéro donnée
  personnelle partagée. » là où le deck posait « La fraude au diplôme devient un problème de
  mathématiques. » — arbitrer, puis s'y tenir.
- `CryptoSection.tsx:253-254` : la précision « dont la racine est ancrée dans Bitcoin » est écrite
  au présent alors qu'aucun ancrage n'a encore été **confirmé** en production (`ots_upgraded_at`
  jamais rempli, cf. `PROD-3` et `infra.md` §6). Le vérificateur, lui, est honnête (« en attente de
  confirmation »). Formuler la landing au même niveau de prudence.
- `PricingSection.tsx:243-246` : l'ancrage/registre public horodaté est **gratuit** (OpenTimestamps)
  et doit donc être annoncé comme inclus dans **toutes** les offres. Ce n'est aujourd'hui
  qu'implicite — seule la console « Registre d'émission auditable » est vendue en Enterprise (ce
  qui, lui, est correct). L'écrire noir sur blanc.
- `SharePanel.tsx:285-291` (wallet) et `ecole/journal/page.tsx:191-197` : wording maison plus sobre
  que le deck. La fonctionnalité est conforme, voire plus prudente (`DEFAULT_DISCLOSED_FIELDS`
  exclut bien `holderEmail`). Aucune action obligatoire.

### COPY-11 — 🟠 Le vérificateur hors ligne annonce « Preuve valide » avant tout contrôle de révocation
`apps/client/web/src/components/verify/OfflineVerifier.tsx:263-313`
Dès que `verifyProofBundle()` renvoie `ok: true`, la page affiche le titre **« Preuve valide »** et
un badge vert **« Vérifiée localement »**. Le contrôle de révocation n'est qu'un **bouton
optionnel**, plus bas, jamais déclenché automatiquement (`:375-416`).
**Pourquoi c'est un problème** : la règle absolue du projet est de ne **jamais** afficher « vérifié »
sur la seule base de la cryptographie — la révocation est un fait **postérieur** à la signature, que
la crypto ne peut pas connaître. La page `/verify/[token]` respecte scrupuleusement cette règle
(`VerifyExperience.tsx:241-268` : le verdict exige `clientOutcome.ok && revocation.status ===
"active"`, et le cas révoqué est intercepté en premier). `/verifier` ne l'applique pas.
Un recruteur pressé lit « Preuve valide » comme un verdict sur le **diplôme**, alors que seule
l'authenticité du document a été établie. Un diplôme révoqué s'affiche donc en vert.
**Nuance** : la page est conçue pour fonctionner **sans réseau**, donc elle ne *peut* pas contrôler
la révocation d'office — le défaut est dans le **libellé**, pas dans l'architecture.
**À faire** : réserver le vert et le mot « vérifié » à l'état post-révocation ; avant le clic,
afficher un état neutre du type « Signature authentique — statut du diplôme non vérifié ».
Mettre à jour `tests/jest/web/verify-hybrid-signature.spec.tsx`, qui fige aujourd'hui le
comportement fautif comme comportement attendu.

> **Doctrine à conserver après la disparition de `copy.md`.** Toutes les lignes de copie tagguées
> V1, V3, V4, F1 et F2 sont désormais **légitimes** — les chantiers correspondants sont livrés et
> testés. **Seules les lignes V2 (« coffre matériel », « HSM », « même nous ne pouvons pas
> l'extraire ») restent interdites** tant que `SIGNER_KIND=kms` n'est pas actif en production. Le
> jour de la bascule Vault (`infra.md` §1), ces lignes deviennent publiables et les entrées
> correspondantes sortent de la liste noire de `COPY-7`.

---

## 2. 🔴 Conformité légale

### LEGAL-1 — 🔴 Pages légales absentes — bloquant absolu avant ouverture au public
`apps/client/web/src/components/Footer.tsx:17-37`
**9 liens** sont posés en `href: null` et grisés « Bientôt disponible » : Documentation, API
publique, Registre émetteurs, Blog, À propos, **RGPD**, **Conditions**, **Confidentialité**,
**Cookies**. Aucune route correspondante n'existe sous `apps/client/web/src/app` — et il n'existe
même pas de **Mentions légales**, pourtant obligatoires.
**Gravité** : le produit traite des données personnelles d'élèves **et des NIR chiffrés** (module
accrochage CDC). Ouvrir au public sans CGU/politique de confidentialité/mentions légales n'est pas
une négligence de forme.
**À faire** : rédiger et publier au minimum Mentions légales, Conditions générales,
Politique de confidentialité, Politique cookies, et la page RGPD (droits des personnes, DPO,
durées de conservation, sous-traitants). Relier le Footer. Les 4 liens non légaux (Documentation,
API publique, Registre émetteurs, Blog) peuvent rester grisés ou être retirés — ils ne bloquent
pas.

---

## 3. 🔴 Sécurité

### SEC-0 — 🔴 Adresse e-mail journalisée en clair, en production
`apps/server/src/server.ts:47` · `apps/server/src/lib/mask.ts:6-51`
`logger.info("bootstrap.admin_created", { email })` écrit l'adresse de l'administrateur plateforme
**en clair** dans les logs, à chaque démarrage où `ADMIN_BOOTSTRAP_EMAIL` est défini et où le compte
n'existe pas encore. Ce n'est **pas** gaté par `env.isDev`.
**Cause racine** : `SENSITIVE_LOG_KEYS` ne contient pas la clé `email`. La redaction ne masque que
ce qu'on lui déclare — c'est un piège connu du projet, et il a mordu.
**Gravité** : violation directe de la règle « logs JSON avec redaction PII » du modèle de sécurité,
sur un produit qui traite des données d'élèves. Les logs partent souvent vers un agrégateur tiers.
**À faire** : ajouter `email` (et variantes `contactEmail`, `adminEmail`, `to`) à
`SENSITIVE_LOG_KEYS`, **et** auditer tous les `logger.*` du serveur pour les champs d'identité non
déclarés. Un test doit figer la liste.

### SEC-1 — 🔴 Rétrogradation post-quantique possible sur les checkpoints du journal
`packages/shared/src/crypto/verify-transparency.ts:93-111` · `packages/contract/src/dto.ts:156`
La règle fondatrice de V4 est **« ET », jamais « OU »** : une preuve hybride n'est valide que si les
deux signatures vérifient. C'est correctement implémenté **pour les diplômes** — l'obligation PQ y
est déduite de `payload.v === "sd-v3"`, une valeur **située à l'intérieur du message signé**, donc
non altérable sans casser Ed25519 (`verify-bundle.ts:107-110`).
**Ce n'est pas le cas pour les checkpoints du journal de transparence.** L'obligation y est déduite
de la simple **présence** du champ `checkpoint.signaturePq`, qui n'appartient ni au message signé
(`checkpointMessage = {treeSize, rootHash, timestamp}`) ni à aucun champ signé.
**Conséquence** : quiconque peut modifier la réponse HTTP en transit retire `signaturePq` d'un
checkpoint pourtant doublement signé ; la signature Ed25519 reste valide, la vérification passe en
**Ed25519 seul**, et le vérificateur n'y voit rien. C'est exactement le « OU » que la spécification
interdit.
**Portée honnête** : l'impact concret est différé — il faut un adversaire disposant d'un
calculateur quantique **et** d'une position d'interception. Mais c'est précisément la menace que V4
prétend couvrir, donc la garantie annoncée est fausse pour cette surface. Aggravant : le port 4000
est publié en clair par défaut (COPY-3), ce qui rend l'interception d'autant plus plausible.
**À faire** : lier l'obligation PQ à une donnée **incluse dans le message signé** (indicateur de
version ou `pqRequired` dans `checkpointMessage`), ou refuser tout checkpoint dépourvu de
`signaturePq` dès que `PQ_POLICY != "off"` — en calquant le modèle déjà correct de `payload.v`.

### SEC-2 — 🟠 Politique de sécurité navigateur permissive (CSP `unsafe-inline`)
`packages/shared/src/config/security-headers.ts:49`
`script-src 'self' 'unsafe-inline'` sur les **3** applications ; le commentaire du fichier renvoie
encore à un « tighten later with a nonce-based CSP » jamais fait. Aucune infrastructure de
nonce/hash côté Next.js.
**Conséquence** : `unsafe-inline` désarme la principale protection anti-XSS du navigateur.
**À faire** : CSP par nonce — middleware Next.js générant un nonce par requête, propagé aux
balises `<script>`, sur les 3 apps.
**Risque du chantier** : casse silencieuse du rendu en production sans que ça se voie en
développement. À valider par la Gate C Docker, pas seulement en `next dev`.

### SEC-3 — 🟠 Le script de seed ne refuse pas de s'exécuter en production
`apps/server/src/scripts/seed.ts:31,34` (+ impression console `:175-176`) ·
`apps/server/src/scripts/smoke.ts:77` · republiés dans `README.md:61`
Les mots de passe `DemoPassw0rd!24` / `AdminPassw0rd!24` sont en clair dans le dépôt **et**
documentés publiquement. Aucun garde-fou : ni `NODE_ENV`, ni contrôle de l'URL de base, ni
`process.exit` — un `pnpm db:seed` lancé par erreur contre une base de production y créerait des
comptes dont le mot de passe est public.
**À faire** : refus explicite d'exécution si `NODE_ENV=production` **ou** si `DATABASE_URL` ne
pointe pas sur un hôte local, avec message clair. Le contrôle doit précéder toute écriture.

### SEC-4 — 🟢 Dérogation de journalisation en dev non déclarée
`apps/server/src/lib/mailer.ts:26`
`logger.info("mail.console", { to, subject, body })` journalise le destinataire **et le corps
complet** (codes OTP, liens de claim valables 180 jours). C'est délibéré et borné à `env.isDev` —
l'équivalent en production a déjà été corrigé — mais c'est un contournement de la couche de
redaction qui n'existe que sous forme de commentaire local.
**À faire** : déclarer explicitement la dérogation dans `mask.ts` (ou la retirer). Une exception
non déclarée finit par être recopiée ailleurs — c'est exactement ainsi que SEC-0 est arrivé.

---

## 4. 🟠 Mise en production

> Les actions purement hors-code (souscription SMTP, provisionnement Vault, domaine, dépôt CDC,
> interop EUDI) sont dans [`infra.md`](./infra.md) et **ne sont pas dupliquées ici**. Ne figurent
> ci-dessous que les manques qui se règlent **en écrivant du code**.

### PROD-1 — 🔴 Un e-mail non parti ne fait aucun bruit
`apps/server/src/lib/mailer.ts:20-34`
Sans `SMTP_HOST`, l'e-mail est abandonné avec un simple `logger.warn("mail.dropped_no_smtp")`.
En production, cela signifie : **aucun code de connexion élève, aucune invitation, aucun lien de
récupération ne part** — et rien ne le signale. `config/env.ts` n'a aucune règle `superRefine`
exigeant `SMTP_HOST` en production, alors que le même fichier en applique pour `PQ_POLICY` et
`SIGNER_KIND=kms`.
*(Un durcissement partiel a eu lieu depuis l'audit : le corps du message n'est plus loggé en clair
en production — la fuite de PII/OTP dans les logs est réglée, pas la perte silencieuse.)*
**À faire** : fail-fast au démarrage si `NODE_ENV=production` et `SMTP_HOST` absent (cohérent avec
les autres garde-fous du fichier), ou a minima passer le log en niveau **error** avec compteur.
Un envoi silencieusement perdu est pire qu'un démarrage refusé.

### PROD-2 — 🟠 TLS incomplet et non actif par défaut
Voir **COPY-3** — même cause, deux conséquences (mensonge affiché + exposition en clair).
Côté code : compléter le `Caddyfile` pour couvrir `web`, `wallet` et `admin` (les blocs existent en
commentaire, `Caddyfile:37-48`) et documenter le profil `proxy` comme mode de production.

### PROD-3 — 🟠 Ancrage OpenTimestamps : planification non durable
`apps/server/src/modules/transparency/checkpoint.service.ts:281-296` (`runOtsMaintenance`),
`:313-317`
La soumission et l'upgrade OpenTimestamps tournent sur des **timers en mémoire non référencés**,
dans une instance unique — le commentaire du fichier l'assume (« same single-instance MVP
contract »). Un redémarrage pendant la fenêtre d'attente, ou un passage à deux instances, et
l'ancrage ne se termine jamais.
**À faire** : sortir la maintenance OTS du processus applicatif (job/worker dédié, ou tâche
planifiée externe idempotente).
**Ne pas « corriger »** : le fait que l'interface n'affiche jamais « ancré » avant confirmation
réelle est **volontaire et correct**.

### PROD-4 — 🟡 Rate-limit et token-bucket en mémoire (mono-instance)
`apps/server/src/middleware/rate-limit.ts:51` (`new Map<string, Bucket>()`)
Correct tant qu'il n'y a **qu'une** instance d'API. Le jour d'une seconde instance, chaque instance
applique son propre plafond et le plafond réel est multiplié.
**Déclencheur, pas échéance** — détail dans [`infra.md`](./infra.md) §7.

---

## 5. 🟠 Tests et assurance qualité

### TEST-1 — 🟠 Le correctif MFA n'a pas de test d'acceptation
`apps/server/src/modules/auth/auth.routes.ts:202-211` (école `:275-281`, admin `:877-883`)
Le code **est corrigé** : le secret TOTP candidat est réutilisé tant qu'il existe, et n'est
régénéré que si aucun secret n'est stocké — pour les deux réalms. Mais le critère d'acceptation
posé par l'audit n'a jamais été écrit : `test/modules/auth/sensitive-routes.test.ts:180-217` ne
couvre que le cas « déjà enrôlé » ; `test/lib/totp.test.ts` ne couvre que la primitive.
**À faire** : un test qui pousse un compte **non enrôlé** à travers deux appels successifs à
l'étape 1 et vérifie que le secret est **identique**, pour `/school/login` **et** `/admin/login`.
Sans lui, une régression sur ce chemin (enrôlement détournable par quiconque a le mot de passe)
repasserait inaperçue — elle est déjà passée trois fois.

### TEST-2 — 🟠 Deux fichiers de tests verts qui ne testent rien
`apps/server/test/modules/accrochage/service.test.ts:49-51` ·
`apps/server/test/modules/vc/flow.test.ts:37-39`
`requireIntegration(t)` appelle `t.skip()` **en silence** quand PostgreSQL est injoignable : la
totalité des sous-tests est sautée tout en apparaissant verte dans le résumé. Aucune lecture de
`process.env.CI` dans les deux fichiers.
**À faire** : rendre le skip bruyant (résumé explicite en fin de run) et le transformer en
**échec** quand une variable de CI est présente. Sinon on livrera un jour en croyant ces parcours
— accrochage CDC et émission EUDI — testés.

### TEST-3 — 🟠 Modules serveur sans test propre
Toujours sans aucune couverture dédiée : **`admin`**, **`audit`**, **`billing`** (hors
`verifyWebhookSignature`), et **`schools/validation.service.ts`** (auto-validation SIRENE/Gemini —
zéro référence dans tout le dépôt de tests). **`auth`** n'a qu'une couverture partielle
(`sensitive-routes`, pas l'orchestration complète) ; **`verify`** n'est couvert qu'indirectement
(via `root-pinning`, `root-rotation`, `pq-material`). **`packages/contract`** (schémas Zod, source
de vérité du contrat) n'a **aucun** test.
*(Depuis l'audit : `wallet`, `auth/sensitive-routes` et `schools/pq-material` ont bien été
couverts.)*
**Priorité** : `auth` (orchestration) > `verify` (route publique du recruteur) >
`schools/validation` > `billing` > le reste. Ce sont les chemins où une régression est à la fois
la plus probable et la plus coûteuse.

### TEST-4 — 🟡 Parcours paiement non rejoué de bout en bout
`apps/server/src/scripts/smoke.ts` — recherche `stripe|billing|checkout|postal` → **0 résultat**.
La signature du webhook est testée unitairement, et le parcours complet n'existe qu'en procédure
manuelle. Rien d'automatique ne couvre encaissement → webhook → activation d'abonnement.
**À faire** : un check smoke sur cette chaîne (Stripe CLI est déjà dans l'overlay dev).

### TEST-5 — 🟠 Angles morts de couverture sur F1 (accrochage CDC) et F2 (export EUDI)
Les deux features sont **réellement implémentées et conformes** à leur cahier des charges — la
vérification ligne à ligne des deux « Definition of Done » n'a trouvé aucun défaut de code. Quatre
chemins critiques ne sont en revanche couverts par **aucun** test :

- **Bornes anti-déni de service du parseur CRT** — `modules/accrochage/crt-parser.ts:5-6` définit
  `MAX_DEPTH = 40` et `MAX_NODES = 10_000`, mais `test/modules/accrochage/crt-parser.test.ts` ne
  franchit jamais ces seuils. Les protections XXE/DTD/entités, elles, sont testées.
  → Ajouter un CRT à > 10 000 nœuds et un CRT de profondeur > 40, et prouver que
  `fail.payloadTooLarge` est levé.
- **Rotation de la clé émettrice VC** — `modules/vc/issuer-keys.ts:38`
  (`provisionVcIssuerKey({rotate:true})`) et `modules/vc/keys.ts:73` (repli sur clé `retired`) ne
  sont exercés par aucun test. C'est pourtant la décision fermée la plus risquée de F2 : après
  rotation, l'ancien `kid` doit rester publié dans `/.well-known/jwt-vc-issuer`, sinon **tous les
  credentials déjà émis deviennent invérifiables**. Le code est correct ; rien ne le protège.
  → Test : rotation → réémission → le JWKS contient toujours l'ancien `kid` → la status list reste
  signable et lisible.
- **Clés de log EUDI** — `lib/mask.ts:18-39` déclare bien `preAuthorizedCode`, `txCode`,
  `accessToken`, `proof`, `credential`, `sdJwt`, `cNonce`, mais `test/lib/mask.test.ts` ne teste que
  les clés CDC. Voir SEC-0 : c'est exactement le mécanisme qui a laissé passer `email`.
- **Purge des offres VC** — `purgeExpiredVcOffers` (`modules/vc/vc.service.ts:536`) est bien appelée
  par `lib/cleanup.ts:51` mais non testée. La condition à vérifier est subtile : une offre expirée
  sans credential émis doit disparaître, une offre **avec** credential émis doit être **conservée**
  (sinon on perd son `status_list_index` et la révocation cesse de fonctionner).

### TEST-6 — 🟠 Rien ne prouve que `PQ_POLICY=require` fait réellement échouer l'émission
`apps/server/src/modules/diplomas/diplomas.service.ts:126-168`
C'est la garantie centrale de V4 : sous `require` (le **défaut**), un échec de signature
post-quantique doit **faire échouer l'émission**, jamais retomber silencieusement en v2. Le chemin
`dual-sign` (repli assumé) est couvert de bout en bout par
`test/modules/diplomas/pq-emission.test.ts` — cette suite a d'ailleurs déjà attrapé un vrai bug. Le
chemin `require` (`if (env.PQ_POLICY === "require") throw e;`) n'a **aucun** test. Seul le fail-fast
**au démarrage** est testé (`env-pq-policy.spec.ts`), ce qui est une propriété différente.
**À faire** : un cas `PQ_POLICY=require` + clé PQ inutilisable, assertant que `issueDiploma` rejette
**et qu'aucune ligne `diplomas` n'est insérée**. Sans ce test, une régression ferait sortir des
diplômes non post-quantiques sous une politique qui les interdit — silencieusement.

### TEST-7 — 🟢 Aucun outil de couverture configuré
Ni `c8`, ni `nyc`, ni `istanbul`, ni `--coverage` dans les `package.json` ni dans
`jest.config.cjs`. Tous les jugements de couverture de ce document sont des **inventaires fichier
par fichier**, pas des pourcentages de lignes — à garder en tête en les lisant.

---

## 6. 🟢 Qualité produit, conventions et dette

### QUAL-1 — 🟠 `noUncheckedIndexedAccess` absent de 4 workspaces sur 6
`apps/client/web/tsconfig.json` · `apps/client/wallet/tsconfig.json` ·
`apps/client/admin/tsconfig.json` · `packages/shared/tsconfig.json`
L'option n'est activée que dans `apps/server/tsconfig.json:9` et `packages/contract/tsconfig.json:6`,
et `tsconfig.base.json` ne la porte pas. La règle du projet dit pourtant « TypeScript strict partout,
`noUncheckedIndexedAccess` inclus » : les 3 fronts et le package partagé y échappent, donc tout
`tableau[i]` y est typé comme non-`undefined` à tort.
**À faire** : poser l'option dans `tsconfig.base.json`, puis corriger les accès indexés non gardés
que le typecheck révélera. Le faire **avant** d'écrire de nouveaux composants, pas après.

### QUAL-2 — 🟢 Écart au cahier des charges non documenté (sérialiseur XML CDC)
`apps/server/src/modules/accrochage/xml-builder.ts`
Le cahier des charges imposait `fast-xml-parser` / `XMLBuilder` ; le code utilise un sérialiseur
maison (`serializeElement`, `escapeXmlText`). Le choix est **défendable et sûr** — AST fermé,
échappement central, golden test byte-exact, validation XSD 1.1.5, zéro dépendance native
(compatible distroless) — mais il n'est écrit nulle part.
**À faire** : consigner la décision (ADR courte ou note dans `docs/cdc/README.md`). Un écart
silencieux à une spécification finit par être « corrigé » par quelqu'un qui ne connaît pas la
raison.

### UX-1 — 🟡 Fausse empreinte cryptographique affichée dans le wallet
`apps/client/wallet/src/components/wallet/DiplomaDetailCard.tsx:113`
L'« empreinte » montrée (`0x{id}…Ed25519 ✓`) est **fabriquée à partir de l'identifiant du
diplôme** : ce n'est pas un condensat calculé. Purement cosmétique — mais dans un produit dont
l'argument **est** la preuve cryptographique, afficher une fausse empreinte est exactement le
mauvais signal. (La vraie vérification, sur `/verify/[token]`, est correcte.)
**À faire** : afficher une empreinte réellement calculée, ou retirer la mise en scène.

### UX-2 — 🟡 Aucun « mot de passe oublié »
Recherche `forgot|reset.?password|mot de passe oublié` sur `apps/client/*` et
`apps/server/src/modules/auth` → **0 résultat**, ni UI ni backend, ni pour les écoles ni pour les
administrateurs.
Aucune interface ne le promet (donc aucun lien mort), mais chaque oubli deviendra une intervention
manuelle en base. À trancher avant les premiers clients réels.

### UX-3 — 🟠 Inscription école synchrone (SIRENE + Gemini dans la requête)
`apps/server/src/modules/schools/schools.routes.ts:124-171`
`computeSchoolValidation(...)` est `await`é **dans** le handler `/register` : lenteur perçue à
l'inscription, et une panne d'un service externe fait échouer l'inscription elle-même.
Une note d'architecture existe (`docs/architecture/school-registration-async.md`) mais n'a jamais
été mise en œuvre.
**À faire** : sortir SIRENE/Gemini du chemin synchrone (traitement différé + statut « vérification
en cours »).

### UX-4 — 🟢 Aucune page d'erreur ni de chargement dédiée
Recherche `loading.tsx|error.tsx|not-found.tsx` sous les 3 apps → **0 fichier**.
Chaque page gère son propre chargement (ça fonctionne), mais une adresse inexistante tombe sur la
404 générique non habillée, et un plantage de rendu n'a aucun filet.
**À faire** : `error.tsx` + `not-found.tsx` par app (le `loading.tsx` est facultatif ici).

### UX-5 — 🟢 Libellé technique brut dans le back-office
`apps/client/admin/src/app/schools/[id]/page.tsx:526` — affiche `{e.type}` brut au lieu de passer
par `AUDIT_LABELS`, utilisé partout ailleurs dans la même page.

### UX-6 — 🟢 Code mort résiduel
`apps/client/web/src/lib/api/endpoints.ts:70-76` — `requestOtp` / `verifyOtp` (logique élève sans
objet dans l'app école) n'ont aucun site d'appel. À retirer.

### UX-7 — 🟢 Pas de pagination des liens de partage côté wallet
`apps/client/wallet/src/components/wallet/SharePanel.tsx:414-425` — `links.map(...)` rend toute la
liste, sans `limit`/`page`/`cursor`. Le **contrat serveur est déjà en place** (migration
`0020_share_links_pagination`) : il ne reste que l'interface.
Déjà consigné dans [`dette-technique.md`](./dette-technique.md) §4 — conservé ici pour le pointeur
de fichier.

### UX-8 — 🟢 Adresse commerciale non confirmée
`apps/client/web/src/app/(school)/ecole/parametres/page.tsx:22-25` — commentaire explicite
*« Placeholder — confirm the real address before going live »* sur
`SALES_EMAIL = "contact@certifychain.fr"`.

### UX-9 — 🟢 Prix affichés en dur côté serveur
`apps/server/src/modules/billing/billing.service.ts:21-46` (`PLAN_CATALOG`) : « 49 €/mois »,
« 149 €/mois », « À partir de 399 €/mois ». Le code assume que Stripe fait foi pour le montant
réel — risque de divergence d'affichage le jour d'un changement de tarif.

---

## 7. 🟢 Documentation et cohérence du dépôt

### DOC-1 — 🟠 Références mortes après la suppression des 5 fichiers
La suppression d'`audit.md`, `copy.md`, `features.md`, `PLAN.md` et `v2.md` laisse des renvois
cassés dans des fichiers **conservés**. Relevé exhaustif :

| Fichier conservé | Occurrences | Cible disparue |
|---|---|---|
| `CLAUDE.md` | l. 3, 5, 36, 49, 93, 216, 218 | `PLAN.md` |
| `CLAUDE.md` | l. 35, 39, 71 | `v2.md` |
| `CLAUDE.md` | l. 42, 57 | `copy.md` |
| `README.md` | l. 90, 95 | `PLAN.md` |
| `infra.md` | l. 6 · l. 26-30 | `PLAN.md` · `copy.md` |
| ~~`dette-technique.md`~~ | — | ✅ **corrigé le 2026-07-28** (renvois vers `reste-a-faire.md`) |
| `plan-tests-jest.md` | l. 17 · 25 | `PLAN.md` · `audit.md` |
| `PROGRESS.md` | l. 35 | `PLAN.md` |
| `docs/architecture.md` | l. 3, 5, 15, 80, 183, 197, 230 | `PLAN.md` |
| `docs/audit-refonte-2026-07-07.md` | l. 90 | `PLAN.md` |
| `docs/audit-2026-07-05-legacy.md` | l. 38, 252, 261, 342, 348, 766-768, 780 | `PLAN.md` |
| `docs/email/README.md` | l. 1 · 20 | `audit.md` · `v2.md` |
| `docs/security/root-secrets-rotation.md` | l. 4 · 117, 165 | `audit.md` · `v2.md` |
| `docs/kms/README.md` | l. 3, 15, 26, 29, 35, 48 | `v2.md` |
| ADR `0001-proof-engine-crypto-stack.md` | l. 5, 15, 17 | `v2.md` |
| ADR `0004-selective-disclosure-and-key-custody.md` | l. 3, 11, 34, 71, 88 | `v2.md` |
| ADR `0005-transparency-log.md` | l. 4, 11, 20, 34, 99 | `v2.md` |
| ADR `0006-post-quantum-hybrid.md` | l. 4, 13, 18, 55, 103, 106, 110, 117, 121 | `v2.md` |
| ADR `0007-browser-root-pinning.md` | l. 9, 35, 61, 135 | `v2.md` |

**À faire** : rediriger les liens **vivants** (`CLAUDE.md`, `README.md`, `infra.md`,
`dette-technique.md`, `plan-tests-jest.md`) vers ce fichier. Les **ADR et audits datés** décrivent
un état historique : y laisser les mentions textuelles est acceptable, mais leur en-tête doit dire
que la source citée a été consolidée ici — sinon chaque reprise à froid rouvre la chasse au
fichier fantôme.

### DOC-2 — 🟠 Trois comptes de tests divergents dans les fichiers conservés
| Fichier | node:test | Jest | smoke |
|---|---|---|---|
| `README.md:68-76` | 129 | 300 (32 suites) | 59 |
| `CLAUDE.md:48,142-143` | 300 (74 suites) | 429 (51 suites) | 71 |
| `infra.md:8-9` | **305 (77 suites)** | 429 (51 suites) | 71 |
| `plan-tests-jest.md:9` puis `:160` | 229 **puis 181** *(contradiction interne)* | 353 (40 suites) | — |

Comptage sur disque : **51** fichiers `tests/jest/**/*.spec.*` (confirme 51 suites Jest) et **42**
fichiers `apps/server/test/**/*.test.ts`. `CLAUDE.md` et `infra.md` se prétendent tous deux à jour
au 2026-07-28 et divergent pourtant de 5 tests.
**À faire** : exécuter **une fois** `pnpm test` et `pnpm test:jest`, puis propager le chiffre réel
dans les 4 fichiers. Ne recopier aucun chiffre non exécuté — c'est précisément l'origine de la
divergence.

### DOC-3 — 🟠 `CLAUDE.md` laisse croire que V2 est opérationnelle en production
`CLAUDE.md:48` annonce « V1 à V4 toutes implémentées, Gate C 71/71 » — exact pour le **code**.
Mais la nuance décisive n'y figure pas : **la couture `Signer`/KMS est livrée, l'infrastructure ne
l'est pas** (`SIGNER_KIND=envelope`, aucun Vault déployé). Elle n'existe que dans `infra.md` §1.
C'est exactement l'ambiguïté qui a produit COPY-1 : un lecteur de `CLAUDE.md` seul croit V2
pleinement active.
**À faire** : ajouter la nuance dans `CLAUDE.md` §1.

### DOC-4 — 🟢 `MIGRATION-SWAP.md` référencé alors qu'il est supprimé
`README.md:101` (lien markdown) · `CLAUDE.md:93` (arborescence) ·
`docs/architecture/decisions/0002-monorepo-layout.md:46` et `:95`.

### DOC-5 — 🟢 Lien cassé dans `docs/architecture.md`
`docs/architecture.md:290` pointe vers `./docs/architecture/decisions/0001-proof-engine-crypto-stack.md`
avec un préfixe `docs/` en trop (le fichier est déjà dans `docs/`). Cible réelle :
`./architecture/decisions/0001-proof-engine-crypto-stack.md`.

### DOC-6 — 🟠 Journal de bord interrompu depuis le 2026-07-07
`PROGRESS.md` s'arrête à l'étape 11. Les chantiers F1, F2, V1, V2, V3, V4 — c'est-à-dire tout ce
qui produit les 71/71 actuels — ne sont journalisés nulle part de façon granulaire, et tiennent en
deux commits massifs.
**À faire** : trancher explicitement — soit reprendre le journal en étapes 12+, soit acter dans
`CLAUDE.md` §10 que `PROGRESS.md` est **clos** et que le suivi vit ailleurs. Le pire état est
l'ambiguïté actuelle, où l'on ne sait pas si l'absence d'entrée signifie « rien fait » ou « pas
journalisé ».

### DOC-7 — 🟢 Guides de test manuels périmés
`GUIDE_TEST.md:142` annonce **32 tests** `node:test` et `:6` un smoke à **44 checks** — chiffres
très antérieurs, sans aucune mention de la suite Jest. `GUIDE_TEST_VERIFICATION.md` ne mentionne ni
chiffre ni Jest. À resynchroniser avec DOC-2.

### DOC-8 — 🟢 Consigne de journalisation Obsidian inopérante
`CLAUDE.md:157` (§9) pointe vers `C:\Users\alexa\Documents\obsidian\CertyChaine` et `PROGRESS.md:4`
vers `C:\Users\alexa\.claude\plans\calm-jingling-crystal.md` — **aucun des deux chemins n'existe**
sur cette machine (l'utilisateur est bien `alexa`, mais le vault n'a jamais été créé ici).
La consigne §9 est donc inapplicable telle qu'écrite.
**À faire** : créer le vault, rendre le chemin configurable, ou retirer la consigne.

### DOC-10 — ✅ Mémos S7 / WA3 — tranchés et reclassés (fait le 2026-07-28)
Les deux mémos traînaient depuis le 2026-07-10 « ni confirmés clos, ni confirmés ouverts ». Ils ont
été retrouvés dans l'historique git (`git show 0404edb:_refactor/audit.md`) et confrontés au code.
**Aucun des deux n'est un défaut** : ce sont deux compromis de conception, inchangés.
`dette-technique.md` a été mis à jour en conséquence — l'ancien §3 a disparu de la liste des dettes,
les deux constats sont désormais dans « Différé par décision — pas des dettes », avec leurs preuves
et leur **déclencheur** de remise en cause. Les sections suivantes ont été renumérotées
(`leafCache` = §3, pagination des liens de partage = §4).
**Aucune action restante.**

### DOC-11 — 🟠 L'ADR post-quantique documente un défaut de politique qui n'est plus le bon
`docs/architecture/decisions/0006-post-quantum-hybrid.md:96`
L'ADR décrit `env.PQ_POLICY` comme valant **`"off"` par défaut**. Le code applique
**`require`** (`apps/server/src/config/env.ts:281`), et c'est un choix délibéré, assumé et testé
(`env-pq-policy.spec.ts`) : aucun diplôme ne doit pouvoir sortir sans double signature.
L'ADR est donc **périmé sur le point le plus structurant qu'il documente**. C'est le type d'écart
qui fait qu'un jour quelqu'un « remet la valeur conforme à l'ADR » et désactive le post-quantique en
production.
**À faire** : corriger l'ADR §3 et y dater le changement de défaut.

### DOC-12 — 🟢 Écart de forme sur la fréquence des checkpoints (à documenter, pas à corriger)
`apps/server/src/modules/transparency/checkpoint.service.ts:261,271-279`
La spécification prévoyait un checkpoint immédiat au-delà d'un delta de N feuilles. Le code
implémente un cron horaire + debounce, **plus** `ensureCheckpointCovering` qui crée un checkpoint à
la demande dès qu'une preuve d'inclusion est réclamée pour une feuille non couverte. Mécanisme
différent, besoin couvert — et testé par le smoke.
**À faire** : une ligne de commentaire ou d'ADR pour clore l'écart formellement. Aucune action de
code.

### DOC-9 — 🟢 Suppression d'`AGENTS.md` non committée
Le fichier est absent du disque mais la suppression n'est pas indexée (`git status` : ` D
_refactor/AGENTS.md`). À committer pour que le dépôt reflète l'arbre de travail.

---

## 8. Décisions en attente — pas du travail, des arbitrages

Ces points ne se règlent pas en écrivant du code. Ils bloquent tant que personne ne tranche.

### DEC-1 — 🔴 Levée du verrou de mise en ligne
Le verrou posé le 2026-07-12 disait : « pas de mise en ligne publique ni d'ouverture des paiements
avant V2–V4 ». **La condition technique est remplie** — V1, V2 (couture), V3 et V4 sont livrés,
Gate C Docker 71/71. La levée reste une **décision produit qui n'a jamais été prise**, et aucun
agent ne peut la prendre.
**Ce qui doit être vrai le jour de la levée** : `LEGAL-1` (pages légales) traité, `COPY-1` à
`COPY-8` traités, `PROD-1` (e-mails) traité, `infra.md` §2 (SMTP réel) et §3 (domaine + TLS)
faits. **Sans quoi la levée est prématurée, quelle que soit la qualité du code.**

### DEC-2 — 🟠 Stratégie de bascule Vault, école par école
Le code sait faire (`SIGNER_KIND=kms`, résolution par école, fallback legacy). Ce qui manque est la
**décision d'exploitation** : bascule-t-on seulement les nouvelles écoles ? migre-t-on les
existantes, et comment (elles ont une clé `envelope` en base, non exportable vers Vault sans
cérémonie) ? Tant que ce n'est pas tranché, `COPY-1` reste ouvert et la promesse « coffre matériel »
reste impubliable.
**Note d'exploitation à ne pas perdre** : le jour de la bascule, chaque signature devient un
aller-retour réseau — il faudra **batcher / limiter la concurrence des imports CSV**, qui signent
aujourd'hui en rafale.

### DEC-3 — 🟢 V5 (BBS+) — pas de date, volontairement
Différé « sous conditions, pas avant ». Aucune échéance. Ne pas ouvrir le chantier sans
redécider explicitement.

### DEC-4 — 🟢 Turborepo et Biome-formatter — différés avec déclencheurs écrits
Les déclencheurs concrets sont dans `docs/architecture.md` §11.1 et §11.2. Tant qu'ils ne sont pas
atteints, ne pas ouvrir le chantier. (Rappel : Biome a été écarté **pour le lint**, pas pour le
formatage.)

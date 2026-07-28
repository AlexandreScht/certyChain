# ADR-0006 : Post-quantique hybride (Ed25519 + ML-DSA-65 / FIPS 204)

> Numérotée 0006 à la suite de [ADR-0005](./0005-transparency-log.md) (journal de transparence). C'est
> le chantier **V4** de [`v2.md`](../../../v2.md).

- **Date** : 2026-07-27
- **Statut** : **Accepté** — implémenté (socle serveur + vérificateur navigateur partagé). Étend
  l'[ADR-0004](./0004-selective-disclosure-and-key-custody.md) (le bundle `ed25519-sd-v2` gagne un
  troisième format, `ed25519-sd-v3`) et l'[ADR-0005](./0005-transparency-log.md) (les checkpoints du
  journal gagnent une seconde signature) — les deux restent en vigueur inchangées pour les diplômes
  déjà émis.
- **Auteur** : CertifyChain (solo dev)
- **Référence** : [`v2.md`](../../../v2.md) §V4 (spécification exacte) · [FIPS 204 (ML-DSA)](https://csrc.nist.gov/pubs/fips/204/final)
  · [`@noble/post-quantum`](https://github.com/paulmillr/noble-post-quantum).

## Contexte

Ed25519 ne tombera pas en 2026. Le problème n'est pas l'urgence, c'est la **rétroactivité** (`v2.md`
§V4-0) : un diplôme déjà émis ne peut **jamais** être re-signé — il faudrait la clé privée de
l'école, qui aura peut-être disparu, et son consentement, qu'on ne peut plus recueillir des années
après. Donc **chaque diplôme émis aujourd'hui sans signature post-quantique est un diplôme qui
deviendra invérifiable-de-confiance le jour où un calculateur quantique casse Ed25519 — et ce,
définitivement**. C'est ce qui fixe la priorité, pas une échéance de rupture : le coût de l'inaction
augmente à **chaque jour d'émission**. NIST recommande la migration vers ML-DSA (FIPS 204) d'ici
2030 ; ironie utile — Groth16/BN254 (la « Phase 2 » abandonnée de l'ADR-0001) serait tombé aussi
face à un calculateur quantique, donc n'aurait rien réglé.

Le [journal de transparence](./0005-transparency-log.md) (V3) est la mitigation **gratuite et déjà
livrée** : un diplôme Ed25519 signé **et horodaté** dans un arbre ancré Bitcoin reste défendable même
après une rupture cryptographique, parce qu'on peut prouver que la signature **précède** la rupture.
C'est pour cette raison que V3 est séquencée avant V4 — l'ordre n'est pas arbitraire, et V4 ne
remplace pas cette mitigation, il en ajoute une seconde, permanente celle-là.

## Décision

### 1. ML-DSA-65 (FIPS 204), mode hybride « ET », jamais « OU »

- **Algorithme** : ML-DSA-65 (ex-CRYSTALS-Dilithium), catégorie de sécurité NIST 3 — le créneau
  documents d'identité (permis, cartes santé). ML-DSA-44 (catégorie 2) serait un peu juste pour une
  garantie à 40 ans.
- **Bibliothèque** : [`@noble/post-quantum`](https://www.npmjs.com/package/@noble/post-quantum)
  (0.6.1), **vérifiée 100 % pur-TypeScript** avant installation (aucun `node-gyp`, aucun binaire
  natif — seules dépendances : `@noble/hashes`, `@noble/curves`, `@noble/ciphers`, également
  pur-JS). Installée dans **`packages/shared`** (comme `@noble/ed25519`), jamais dans `apps/server`
  seul : c'est ce qui permet au vérificateur **navigateur** de tourner la même crypto que le serveur.
  Export utilisé : `ml_dsa65` de `@noble/post-quantum/ml-dsa.js`, enveloppé dans
  `packages/shared/src/crypto/ml-dsa.ts` — **le seul fichier du projet** qui importe
  `@noble/post-quantum` directement (couture équivalente à `crypto/signer.ts` côté clés).
- **Mode « ET »** : pour un bundle `ed25519-sd-v3`, **les deux** signatures du diplôme (Ed25519 ET
  ML-DSA-65 par l'école) doivent vérifier, **et** les deux signatures du certificat d'école (racine
  Ed25519 ET racine ML-DSA) doivent vérifier. **Jamais « OU »** : « OU » ramènerait la sécurité
  globale à celle de l'algorithme le **plus faible** des deux, ce qui annulerait tout le bénéfice
  d'ajouter un second algorithme. Implémenté une seule fois, dans
  `packages/shared/src/crypto/verify-bundle.ts`, importé tel quel par le serveur et par le
  navigateur (`v2.md` piège n°6 — jamais un second vérificateur).
- **Déduction sans politique** : le vérificateur (navigateur ou serveur) ne connaît **jamais**
  `PQ_POLICY` — c'est une variable serveur. Il déduit l'exigence hybride du bundle lui-même
  (`payload.v === "sd-v3"` ⇒ PQ obligatoire, `"sd-v2"` ⇒ comportement strictement inchangé). Un
  bundle v3 dont la signature PQ est absente ou invalide est **rejeté** ; un bundle v2 se vérifie
  exactement comme avant V4, à vie.

### 2. Portée : diplômes, certificats d'école, checkpoints du journal — jamais un maillon isolé

Une chaîne de confiance n'est jamais plus solide que son maillon le plus faible. Signer les
diplômes en post-quantique sous une racine PKI qui ne l'est pas ne protégerait rien : un attaquant
quantique casserait la racine, forgerait un faux certificat d'école, et le diplôme post-quantique
individuel deviendrait sans objet. La portée est donc **obligatoire et groupée** :

1. **Diplômes** : le diplôme signe le même `payloadHash` deux fois — Ed25519 (inchangé) et ML-DSA-65
   (nouveau, `signature_pq`) — avec la clé ML-DSA-65 **de l'école**.
2. **Certificats d'école** : la racine CertifyChain signe le **même type** de message canonique que
   pour le certificat Ed25519 existant (`{schoolId, publicKey, name, issuedAt}`), mais avec
   `publicKey` = la clé publique ML-DSA-65 de l'école, et avec la clé racine ML-DSA-65
   (`certificate_pq`). C'est ce qui **lie** la clé PQ de l'école à son identité — sans ce lien, la
   clé PQ flotterait, non certifiée, et n'importe qui pourrait en substituer une autre.
   ⚠️ **Piège trouvé et corrigé pendant l'implémentation** : `ensureSchoolPqMaterial` provisionne la
   clé PQ **paresseusement** (au premier diplôme émis sous `PQ_POLICY != "off"`, potentiellement des
   semaines après l'approbation) — signer `issuedAt` avec la date du **jour du provisionnement**
   aurait produit un certificat structurellement invérifiable : le bundle ne porte qu'**un seul**
   `certIssuedAt` (partagé entre les deux certificats), que `verify.routes.ts` reconstruit **depuis
   `schools.approved_at`**, jamais depuis la date de mint. `ensureSchoolPqMaterial` signe donc
   `issuedAt = school.approvedAt` (identique à ce qu'a signé le certificat Ed25519 à l'approbation),
   jamais la date courante — couvert par un test dédié (`pq-material.test.ts`) qui aurait échoué sans
   ce correctif.
3. **Checkpoints du journal** : `signLogCheckpoint` (V3) gagne un miroir exact,
   `signLogCheckpointPq`, qui signe le **même** `{treeSize, rootHash, timestamp}` avec la clé racine
   ML-DSA-65. Un checkpoint émis avant l'activation de `PQ_POLICY` n'a pas de `signature_pq` et
   continue de se vérifier en Ed25519 seul — non-régression totale.

### 3. Versionnage et `PQ_POLICY` — l'émission seule est pilotée, jamais la vérification

`diplomas.proof_version` gagne la valeur `'v3'` (= `'v2'` + PQ). Les diplômes `'v1'`/`'v2'` existants
restent inchangés et se vérifient à vie — même logique qu'en V1 : **rien n'est jamais re-signé
rétroactivement**.

`env.PQ_POLICY` (`"off"` par défaut, `"dual-sign"`, `"require"`) gouverne **uniquement l'émission**,
dans `diplomas.service.ts` — jamais la vérification (`packages/shared` est « policy-blind » par
construction, voir §1). Sémantique retenue :

| Valeur | Émission | Ce qui se passe si la clé/signature PQ échoue |
|---|---|---|
| `off` (défaut) | `'v2'`, comme aujourd'hui | sans objet — aucune clé PQ n'est touchée |
| `dual-sign` | `'v3'` (clé PQ de l'école provisionnée à la volée si absente) | **replie sur `'v2'` pour ce diplôme** (best-effort — « n'exige que Ed25519 », `v2.md` §V4-1) et journalise l'échec |
| `require` | `'v3'` | **l'émission échoue** (aucun repli silencieux vers `'v2'`) |

C'est une décision tranchée par cet agent, la formulation de `v2.md` §V4-1 étant ambiguë sur ce
point précis : le texte source dit à la fois que `require` « refuse d'émettre sans PQ » et « refuse
les preuves non-v3 ». Interprété au pied de la lettre, un refus des « preuves non-v3 » à la
**vérification** casserait la promesse cardinale « un v1/v2 se vérifie à vie » — répétée comme
invariant non négociable partout ailleurs dans `v2.md`. Cette ADR tranche donc que **les deux
formulations décrivent la même contrainte, côté émission uniquement** : `require` n'émet jamais
autre chose que `'v3'`, mais ne touche à rien de ce qui existe déjà en base.

### 4. La clé PQ de l'école reste TOUJOURS en `EnvelopeSigner` — asymétrie assumée

`crypto/signer.ts` gagne un second seam, `PqSigner`/`EnvelopePqSigner`, **distinct** du `Signer`
existant (V2) : quasi aucun KMS managé ne signe en ML-DSA aujourd'hui (`v2.md` §V4-2). La clé PQ
d'une école reste donc **toujours** dans `EnvelopeSigner` (AES-256-GCM via `KeyVault`), **y compris
pour une école dont la clé Ed25519 est en `kms`** (Vault Transit, voir `docs/kms/README.md`). Le
matériel privé PQ ne quitte jamais `signer.ts`, exactement comme pour la clé Ed25519 — le test de
garde de `signer.test.ts` (`v2.md` DoD V2-2) est étendu à `mlDsaSign`.

**Ceci est assumé, pas caché** : les deux clés d'une école (Ed25519, ML-DSA-65) n'ont **pas** le même
modèle de garde. C'est acceptable précisément **parce que** le mode « ET » ne fait dépendre la
sécurité globale que de la **mieux gardée** des deux algorithmes — jamais de la moins bien gardée.
Si la clé Ed25519 vit dans un HSM/KMS et que la clé PQ vit dans un blob chiffré applicatif, la
signature hybride reste au moins aussi forte que l'algorithme dont la clé est la mieux protégée, et
ajoute la garantie de longévité de l'autre. Un attaquant qui compromettrait *uniquement* le blob PQ
ne casserait rien tant que la clé Ed25519 tient — et réciproquement.

### 5. Impacts mesurés

- **Tailles** (mesurées sur cette machine, `@noble/post-quantum` 0.6.1) : clé publique ML-DSA-65 =
  **1 952 octets**, clé privée = **4 032 octets**, signature = **3 309 octets** — contre 32 / 32 / 64
  octets pour Ed25519. Conforme aux ordres de grandeur documentés par FIPS 204 catégorie 3.
- **QR codes** : vérifié — `SharePanel.tsx` (wallet) et `EudiExportAction.tsx` encodent déjà une URL
  (`value={featured.url}` / `value={state.offer.offerDeepLink}`), jamais le bundle brut. Aucune
  correction requise ; l'invariant « le QR encode toujours une URL » était déjà respecté avant V4.
- **Performance import CSV** : 500 signatures ML-DSA-65 séquentielles mesurées à **≈ 3,15 s au total
  (≈ 6,3 ms/signature)** ; 500 vérifications à **≈ 0,91 s (≈ 1,8 ms/vérification)**. C'est un coût
  réel et non négligeable (jusqu'à ≈ 12,6 s ajoutées sur un import au plafond de 2000 lignes), mais
  la boucle d'import (`diplomas.routes.ts`) traite déjà les lignes **séquentiellement** (`for` +
  `await`) — la parallélisation n'a donc jamais été « 500 promesses d'un coup » et n'a pas eu besoin
  d'être bornée davantage pour V4.

## Conséquences

- Positives : un diplôme émis sous `PQ_POLICY != "off"` reste défendable après une rupture
  cryptographique d'Ed25519 (protection qui augmente avec le temps, contrairement au coût qui
  diminue si on attend) ; aucune régression sur les diplômes `v1`/`v2` existants ; une seule
  implémentation de vérification (navigateur + serveur), donc pas de divergence possible.
- Négatives / limites (à dire honnêtement) : la garde de la clé PQ est structurellement plus faible
  que celle d'une clé Ed25519 en KMS/HSM — c'est un choix d'écosystème (absence de support ML-DSA
  chez les fournisseurs de KMS managés en 2026), pas un choix de conception CertifyChain ; le
  surcoût de signature (~6 ms/diplôme) est réel sur les imports en lot ; `require` sans clé PQ
  disponible bloque l'émission (comportement voulu, mais opérationnellement contraignant si une
  école bascule sans préparation) ; aucun vecteur de test FIPS 204 officiel n'est disponible car
  `@noble/post-quantum` ne publie pas de répertoire `test/` dans son paquet npm — la suite de tests
  de ce chantier repose sur des propriétés (aller-retour, altération d'une seule signature) plutôt
  que sur des vecteurs KAT.

## Alternatives considérées

1. **Attendre une rupture avérée d'Ed25519 avant d'agir** — rejetée : la rétroactivité (§V4-0) rend
   le coût de l'attente strictement croissant et irréversible, contrairement à un simple risque
   d'urgence différable.
2. **ML-DSA-44 (catégorie 2)** — rejetée : marge insuffisante pour une garantie affichée à 40 ans.
3. **Mode « OU » (n'importe laquelle des deux signatures suffit)** — rejetée explicitement : ramène
   la sécurité globale à celle du plus faible des deux algorithmes, annule le bénéfice du hybride.
4. **Migrer la clé PQ vers un KMS dès maintenant** — rejetée : aucune offre managée grand public ne
   signe en ML-DSA en 2026 (même constat que V2-0 pour Ed25519 côté KMS, en pire) ; réévaluer si la
   situation change.
5. **Re-signer rétroactivement les diplômes v1/v2 existants** — impossible par construction (clé de
   l'école potentiellement disparue, consentement non recueillable) — jamais tenté, jamais proposé.

## ADR liées

- [ADR-0004](./0004-selective-disclosure-and-key-custody.md) — le format `ed25519-sd-v2` étendu en
  `ed25519-sd-v3` ; les disclosures et le mécanisme SD-JWT restent identiques.
- [ADR-0005](./0005-transparency-log.md) — les checkpoints du journal gagnent une seconde signature
  ML-DSA-65 ; V3 reste la mitigation immédiate (rétroactive), V4 la mitigation permanente
  (prospective).
- [ADR-0001](./0001-proof-engine-crypto-stack.md) — la « Phase 2 » Groth16/BN254 restait vulnérable
  au quantique de toute façon ; ce constat (déjà noté dans l'ADR-0004) est confirmé ici.

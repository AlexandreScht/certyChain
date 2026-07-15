# ADR-0005 : Journal de transparence (Merkle RFC 6962 append-only + ancrage OpenTimestamps/Bitcoin)

> Numérotée 0005 à la suite de [ADR-0004](./0004-selective-disclosure-and-key-custody.md)
> (V1 divulgation sélective / garde des clés). C'est le chantier **V3** de `v2.md`.

- **Date** : 2026-07-15
- **Statut** : **Accepté** — implémenté et vérifié (Gate C Docker **smoke 67/67**). Complète
  l'[ADR-0004](./0004-selective-disclosure-and-key-custody.md) (le bundle `ed25519-sd-v2` gagne un
  champ optionnel `transparency`) sans rien superséder.
- **Auteur** : CertifyChain (solo dev)
- **Référence** : [`v2.md`](../../../v2.md) §V3 (spécification exacte) · [RFC 6962](https://www.rfc-editor.org/rfc/rfc6962)
  (Certificate Transparency) / [RFC 9162](https://www.rfc-editor.org/rfc/rfc9162) (formulations
  algorithmiques) · [OpenTimestamps](https://opentimestamps.org/).

## Contexte

V2 (garde des clés hors base) empêche l'**exfiltration** d'une clé d'école mais **pas** l'abus
pendant une RCE : un attaquant présent dans le système peut faire signer un diplôme frauduleux, et
rien ne le distingue d'une émission légitime. Il manque une propriété : l'**inaltérabilité auditable**
de l'historique d'émission. Objectif produit (`v2.md` §V3) :

1. une **école** doit pouvoir détecter un diplôme émis **en son nom** qu'elle n'a pas signé ;
2. **CertifyChain** ne doit pas pouvoir réécrire/supprimer une émission **a posteriori** — et doit
   pouvoir le **prouver** à un tiers, sans que ce tiers nous fasse confiance.

C'est exactement le problème que **Certificate Transparency** (RFC 6962) résout pour les certificats
TLS : un **arbre de Merkle append-only** dont la racine est signée (checkpoint / STH) et **ancrée**
dans un support que l'opérateur ne contrôle pas.

## Ce qu'on n'implémente pas (et pourquoi)

| Tentation | Décision |
|---|---|
| Écrire chaque émission « on-chain » (blockchain applicative, NFT…) | **Rejeté.** On n'ancre **que la racine** de l'arbre via OpenTimestamps → **zéro donnée personnelle on-chain**, coût quasi nul, aucune dépendance à une chaîne applicative. La copie produit ne dit jamais « blockchain » seul ni « NFT » (`copy.md`). |
| Dépendre de `javascript-opentimestamps` (npm) | **Rejeté.** Non maintenu et incompatible avec la contrainte **distroless zéro-natif**. Le format `.ots` détaché est **réimplémenté de zéro** en TS pur (`modules/transparency/ots.ts`). |
| Un `bigserial` pour l'index de feuille | **Rejeté** (voir décision D1). |
| Rattraper l'ajout au journal en tâche de fond après l'émission | **Rejeté** (voir décision D2). |
| Un ZKP pour « prouver l'inclusion sans révéler » | **Hors sujet.** Le journal est **public et sans PII par construction** (feuille = hash) ; aucune confidentialité à acheter. Règle projet inchangée : pas de Groth16/ZKP. |

## Décision

### 1. Arbre de Merkle RFC 6962, une feuille HACHÉE par diplôme (zéro PII)

- Feuille = `SHA-256(0x00 ‖ canonical(leaf))`, nœud = `SHA-256(0x01 ‖ gauche ‖ droite)` — préfixes
  de domaine RFC 6962. Le contenu de la feuille (`buildIssuanceLeaf`) lie `diplomaId`, `schoolId`,
  `payloadHash`, `signature` et `issuedAt` — **aucune PII** (le journal est public et auditable par
  des tiers).
- Preuves d'**inclusion** (§2.1.1) et de **consistance** (§2.1.2) exposées en clair (hex).
- **Une seule implémentation** de la vérification (`packages/shared/src/crypto/merkle.ts` +
  `verify-transparency.ts`), partagée **navigateur + serveur** (règle §3, anti-divergence — le même
  bug que l'audit legacy #9). Vecteurs de test figés reproduisant **8 racines CT historiques**.

### 2. Checkpoint (STH) signé par la racine PKI, ancré via OpenTimestamps

- La racine PKI CertifyChain signe `canonical({treeSize, rootHash, timestamp})` — **miroir exact**
  d'`issueSchoolCertificate` (`crypto/keys.ts` → `signLogCheckpoint`). Le `timestamp` signé est
  stocké (`log_checkpoints.created_at`) pour égaler **au bit près** ce qui a été signé.
- L'ancrage Bitcoin est **asynchrone** (OpenTimestamps : calendrier → bloc, quelques heures/jours).
  `ots_proof` (bytea) et `ots_upgraded_at` matérialisent l'état. **Ne JAMAIS afficher « ancré »
  avant que `ots_upgraded_at` soit non nul** — le vérificateur dit honnêtement « ancrage en attente
  de confirmation » jusque-là.
- `checkpoint.service` est **single-flight + debouncé** (un seul insert de checkpoint sous
  concurrence ; pas de nouveau checkpoint sous l'intervalle minimal).

### 3. D1 — `leaf_index` attribué sous verrou consultatif, PAS via `bigserial`

L'index de feuille est attribué **dans la transaction d'émission** :
`SELECT pg_advisory_xact_lock(K)` puis `COALESCE(MAX(leaf_index)+1, 0)`. Raison : sous MVCC une
`bigserial` produirait des **trous** (rollback) et un **ordre de commit** pouvant diverger de l'ordre
de séquence — or un arbre RFC 6962 exige des **préfixes contigus** pour que les preuves de consistance
tiennent. Le verrou est tenu **jusqu'au commit** : deux émissions ne peuvent pas s'entrelacer, et un
rollback libère l'index pour le `MAX+1` suivant.

### 4. D2 — L'ajout au journal est dans la MÊME transaction que l'émission

L'insert de la feuille se fait dans la transaction qui insère le diplôme. Un échec du journal
**annule toute l'émission** : le diplôme **n'a jamais existé**. Pas de rattrapage asynchrone (qui
créerait une fenêtre où un diplôme signé n'est pas encore journalisé — précisément le trou qu'on
ferme). Un test node:test pilote une transaction qui fait échouer l'insert du journal et prouve le
rollback complet.

### 5. Extension du bundle v2 + reliure « hash-only »

`ProofBundleDTO` gagne `transparency?: TransparencyProofDTO | null` (absent/null = diplôme émis avant
le journal → **aucun** panneau côté front, pas de message négatif). `verifyTransparency` recalcule la
feuille quand `issuedAt` est divulgué (binding `"full"`) ; quand `issuedAt` est **masqué** (V1), elle
ne peut pas re-dériver la feuille et se rabat sur le **pin du `leafHash`** dans l'arbre signé (binding
`"hash-only"`) — **sans jamais** deviner ni exposer la valeur masquée. La construction du champ
`transparency` côté serveur ne divulgue aucun champ masqué.

### 6. Gel d'émission après signalement (§V3-6) — une colonne, pas un 6ᵉ statut

Une école qui signale une émission frauduleuse (`POST /schools/journal/report`) déclenche
`schools.issuance_frozen_at` : toute nouvelle émission est bloquée (403), **la vérification des
diplômes existants reste intacte**. Un admin lève le gel (`POST /admin/schools/:id/unfreeze`). C'est
une **colonne**, pas un nouveau statut d'école — la garde `school_not_approved` historique est
strictement inchangée (le gel est vérifié **après** elle). Deux valeurs d'audit
(`transparency_report`, `school_unfrozen`) — ajoutées à l'enum **sans être utilisées dans la même
migration** (piège Postgres `v2.md` §6.10).

## Conséquences

- Positives : historique d'émission **inaltérable et prouvable** à un tiers (antidote au trou de V2 —
  un abus en RCE devient **détectable** par l'école) ; **zéro PII on-chain** et coût d'ancrage quasi
  nul ; vérification **autonome** dans le navigateur du recruteur (mêmes primitives partagées) ;
  **zéro dépendance npm** ajoutée (Merkle + OTS écrits à la main, `@noble/hashes` déjà présent).
- Négatives / limites (dites honnêtement) : l'ancrage Bitcoin est **différé** (confirmation en
  heures/jours) — jusque-là seule la **signature racine** protège le checkpoint, l'ancrage renforce
  a posteriori ; il faut un **CRON** de soumission/upgrade calendrier en prod (hors gate locale) ;
  le verrou consultatif **sérialise** les émissions concurrentes (acceptable au volume visé ; à
  revisiter si l'import CSV massif devient un point chaud) ; la détection d'une émission frauduleuse
  reste **humaine** (l'école doit consulter son journal) — le gel n'est pas automatique.

## Alternatives considérées

1. **Blockchain applicative / une transaction par diplôme** — rejetée : PII on-chain, coût, dépendance
   à une chaîne ; on n'ancre que la racine (OpenTimestamps).
2. **`bigserial` pour l'index** — rejetée (D1 : trous + ordre de commit ≠ ordre de séquence).
3. **Journalisation asynchrone post-émission** — rejetée (D2 : rouvre la fenêtre non journalisée).
4. **Dépendance `javascript-opentimestamps`** — rejetée (non maintenue, incompatible distroless) →
   réimplémentation TS pure.
5. **Preuve d'inclusion en ZKP** — sans objet (journal public sans PII) ; règle projet : pas de ZKP.

## ADR liées

- [ADR-0004](./0004-selective-disclosure-and-key-custody.md) — le bundle `ed25519-sd-v2` étendu par le
  champ `transparency` ; V3 est séquencé après V2 (dont il comble la limite « RCE »).
- [ADR-0003](./0003-hono-rpc-typed-client.md) — routes `/log/*` chaînées + DTO partagés (RPC typé).
- [ADR-0001](./0001-proof-engine-crypto-stack.md) — Ed25519 + nonce (Phase 1) toujours en vigueur ;
  la racine PKI qui signe les certificats d'école signe aussi les checkpoints du journal.

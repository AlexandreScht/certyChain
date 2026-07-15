# ADR-0004 : Divulgation sélective par hachés salés (`ed25519-sd-v2`) & garde des clés

> Numérotée 0004 (et non 0002 comme le prescrivait `v2.md` §0.1) : les ADR 0002
> (monorepo) et 0003 (RPC Hono) existaient déjà.

- **Date** : 2026-07-13
- **Statut** : **Accepté** — **supersede la « Phase 2 » (SnarkJS/Circom Groth16) de
  l'[ADR-0001](./0001-proof-engine-crypto-stack.md)**. La Phase 1 de l'ADR-0001 (Ed25519 + nonce à
  usage unique) reste en vigueur telle quelle.
- **Auteur** : CertifyChain (solo dev)
- **Référence** : [`v2.md`](../../../v2.md) §0.1 et §V1 (spécification exacte du format).

## Contexte

L'ADR-0001 planifiait une « Phase 2 : SnarkJS/Circom **Groth16** » pour remplacer le moteur de
preuve. Cette phase reposait sur une erreur d'analyse : elle traitait le ZKP comme un *upgrade de
sécurité*, alors que c'est un *upgrade de confidentialité* — et qu'il **dégrade** plusieurs
propriétés. Le vrai besoin produit est la **divulgation sélective** (l'élève choisit les champs
révélés) et la **preuve autonome** (le recruteur vérifie sans nous faire confiance).

## Le contresens à ne pas refaire (faits vérifiés)

| Croyance (ADR-0001) | Réalité vérifiée |
|---|---|
| « Groth16 = plus sûr qu'Ed25519 » | **Faux.** SnarkJS utilise **BN254** par défaut : l'attaque Kim–Barbulescu (STNFS, 2016) fait tomber cette courbe de 128 bits à **~100–110 bits**. Ed25519 tient ses **~128 bits**. En force brute, ce serait un **downgrade**. |
| « Le ZKP remplacerait le nonce » | **Faux.** Groth16 **n'est pas simulation-extractable** : ses preuves sont **re-randomisables donc malléables**. Le nonce anti-rejeu resterait **obligatoire**. |
| « Ça enlève de la surface d'attaque » | **Faux.** Ça en ajoute deux : le **trusted setup** (si le « toxic waste » fuit → forge indétectable, risque qu'Ed25519 n'a pas) et surtout les **bugs de circuit** — une analyse 2024 (141 vulns / 107 audits) attribue **~96 % des bugs SNARK à des circuits sous-contraints** (Zcash 2018 : contrefaçon illimitée ; zkSync Era 2023 : 1,9 Md$ de retraits forgés). |
| « C'est ce qu'il faut pour la divulgation sélective » | **Faux — et c'est le vrai sujet.** La divulgation sélective s'obtient avec des **hachés salés** (SD-JWT, **RFC 9901**), **sans SNARK, sans trusted setup, sans circuit**, en gardant l'Ed25519 existant. C'est le chantier **V1**. |
| « Groth16 protégerait à long terme » | **Faux.** BN254 tombe aussi face à un quantique. La longévité, c'est **V4** (ML-DSA). |

**Ce que Groth16 apporterait réellement** : *unlinkability* (deux recruteurs ne peuvent pas corréler
deux présentations) et *preuves de prédicat* (« mention ≥ B » sans révéler la mention). Ces deux
propriétés — et seulement elles — justifient un jour un vrai ZK. Et même alors, la bonne cible n'est
**pas** Groth16 mais **BBS+** (mêmes propriétés, **sans trusted setup**) → `v2.md` §V5.

## Décision

### 1. Divulgation sélective : `ed25519-sd-v2` (hachés salés façon SD-JWT, RFC 9901)

- **Mécanisme** : un digest salé par champ ; la signature Ed25519 de l'école ne porte que sur la
  **liste triée des digests** (`_sd`). L'élève choisit les champs révélés **au moment du partage**
  (`share_links.disclosed_fields`), le recruteur reçoit un **proof bundle** autonome et le vérifie
  **dans son navigateur** (une seule implémentation partagée serveur + navigateur :
  `packages/shared/src/crypto/verify-bundle.ts`).
- **Primitive de signature inchangée** : `signDiplomaHash(privateKeyPem, payloadHashHex)` — seul
  *ce qui est haché* change (`hashSdPayloadV2` au lieu de `hashDiplomaPayload`). Zéro impact sur
  `crypto/keys.ts`, les clés écoles, les certificats, la racine PKI.
- **Toujours 7 disclosures, y compris `null`** (un champ absent de `_sd` révélerait par soustraction
  qu'il est nul), `_sd` **trié** (l'ordre révélerait quel digest est quel champ), **aucun decoy**
  (schéma fixe et public : le sel protège les valeurs, il suffit).
- **Versionnage par diplôme** : `diplomas.proof_version` (`'v1'` legacy | `'v2'`), moteur résolu
  **par diplôme** via `engineFor(proofVersion)` (discriminated union
  `"ed25519-nonce-v1" | "ed25519-sd-v2"` — clôt le préalable P8 de l'ADR-0001). Les diplômes
  existants restent en v1, **aucune re-signature rétroactive**.
- **Sels secrets au repos** : `diplomas.disclosures_encrypted` = `keyVault.encrypt(JSON)` du dict
  champ → disclosure (sinon un champ à faible entropie comme `mention` serait brute-forcé).
- **Le nonce à usage unique reste obligatoire** (anti-rejeu) — il est orthogonal à la divulgation.
- **La crypto ne dit rien de la révocation** : le bundle porte un instantané
  (`revocation.checkedAt/status/source`) et la route publique rate-limitée
  `GET /verify/revocation/:diplomaId` permet de re-contrôler (404 uniforme, anti-énumération).
  Ne jamais afficher « Vérifié » sur la seule vérification locale.
- **Convergence F2 (EUDI)** : la mécanique « salt → disclosure → digest » vit dans **un seul module
  pur** — `apps/server/src/crypto/disclosures.ts` — consommé par le protocole natif (V1) **et** par
  `modules/vc/sd-jwt.ts` (F2). Ce qui diffère légitimement (Ed25519 école vs ES256 plateforme,
  bundle JSON vs JWT compact, identité d'émetteur) n'est **pas** factorisé.

### 2. Garde des clés (custody)

Les clés privées des écoles restent chiffrées au repos (enveloppe AES-256-GCM, `KeyVault`) en
Phase 1. Le passage des clés **hors base** (KMS / coffre matériel, journal d'usage) est le chantier
**V2** de `v2.md` — il achète la non-exfiltration (un dump DB + master key ne suffit plus), pas
l'immunité pendant une RCE. Il est séquencé APRÈS V1 car la divulgation sélective ne dépend pas du
lieu de garde : la couture `KeyVault` reste le point de swap.

## Conséquences

- Positives : divulgation sélective standard (RFC 9901) sans nouvelle primitive ; preuve vérifiable
  hors de notre infrastructure (fin de la vérification tautologique relevée par l'audit legacy #9) ;
  diff minimal et auditable ; compatibilité distroless (pur JS, `@noble/*` côté navigateur).
- Négatives / limites (à dire honnêtement) : **pas d'unlinkability** (la signature reste un
  identifiant stable) ; **pas de preuves de prédicat** ; la révocation exige toujours un appel
  réseau ; le legacy v1 (divulgation fixe côté serveur) subsiste jusqu'à extinction naturelle.

## Alternatives considérées

1. **Groth16 (ADR-0001 Phase 2)** — rejeté pour les faits du tableau ci-dessus.
2. **BBS+** — la bonne cible si l'unlinkability/les prédicats deviennent nécessaires (pas de trusted
   setup), mais changement de suite cryptographique complet : différé (`v2.md` §V5).
3. **Decoys dans `_sd`** — rejetés : schéma fixe et public, ils ne cacheraient rien.

## ADR liées

- [ADR-0001](./0001-proof-engine-crypto-stack.md) — Phase 1 (en vigueur) ; Phase 2 **superseded par
  la présente ADR**.
- [ADR-0003](./0003-hono-rpc-typed-client.md) — le contrat (`ProofBundleDTO`) et les routes chaînées
  suivent le RPC typé.

# ADR-0001 : Choix du protocole de preuve cryptographique (ProofEngine)

- **Date** : 2026-07-06
- **Statut** : **Phase 1 : Accepté (en vigueur)** · **Phase 2 (Groth16) : SUPERSEDED le 2026-07-12
  par [`v2.md`](../../../v2.md) §0.1 →
  [ADR-0004 (divulgation sélective & garde des clés)](./0004-selective-disclosure-and-key-custody.md).**
- **Auteur** : CertifyChain (solo dev)

> ⚠️ **Ne pas implémenter la « Phase 2 » décrite plus bas.** Groth16 a été abandonné après
> vérification des sources : il achète de la **confidentialité**, pas de la **sécurité**, et il
> *dégrade* plusieurs propriétés — BN254 ≈ 100–110 bits (Kim–Barbulescu) contre ~128 pour Ed25519 ;
> preuves **malléables** (non simulation-extractable ⇒ le nonce resterait obligatoire) ; **trusted
> setup** ; et ~96 % des vulnérabilités SNARK proviennent de **circuits sous-contraints**
> (USENIX Security '24). La divulgation sélective — le vrai besoin — s'obtient **sans SNARK** via
> des **hachés salés (SD-JWT, RFC 9901)**. Voir [`v2.md`](../../../v2.md) : chantier **V1**
> (`ed25519-sd-v2`). Si un jour l'*unlinkability* ou les preuves de **prédicat** deviennent
> nécessaires, la cible est **BBS+** (sans trusted setup), pas Groth16 — voir `v2.md` §V5.
> La Phase 1 ci-dessous, elle, reste **exacte et en vigueur**.

## Contexte

CertifyChain doit permettre à un recruteur de vérifier l'authenticité d'un diplôme numérique en moins de 10 secondes, sans créer de compte, sans accéder au contenu du diplôme, et sans que la preuve soit rejouable. Critères retenus :

1. Authenticité vérifiable cryptographiquement (l'école a bien signé, avec sa propre clé, pas une clé partagée avec la plateforme).
2. Anti-rejeu : une preuve interceptée ne doit pas être réutilisable pour usurper une vérification.
3. Divulgation minimale : le recruteur ne doit recevoir que le résultat binaire ("Vérifié"/"Introuvable") + champs minimaux, jamais le document ni des données personnelles superflues.
4. Révocable : un diplôme ou une école peuvent être révoqués après émission, la vérification doit refléter cet état à tout moment.
5. Livrable en MVP par un développeur solo, sans dépendance à une cérémonie cryptographique lourde (trusted setup, circuits audités) day-1.
6. Évolutif sans réécriture des appelants (routes API, UI) le jour où une vraie preuve zero-knowledge est nécessaire.
7. Peu coûteux à héberger (pas de nouvelle infra externe requise en Phase 1).

## Décision

On adopte une architecture en deux phases derrière une interface commune `ProofEngine`.

### Phase 1 (implémentée maintenant) : Ed25519 + nonce à usage unique

**Émission** : l'école signe `hash(payload canonique du diplôme)` avec sa clé privée Ed25519 (RFC 8032). La clé privée est chiffrée au repos (enveloppe AES-256-GCM, abstraction `KeyVault` KMS/Vault-ready). Sont stockés : hash, signature, clé publique de l'école, métadonnées non sensibles.

**Pourquoi Ed25519** : signatures et clés courtes, vérification rapide, implémentation native `node:crypto` (pas de dépendance externe lourde), pas de subtilités de padding comme RSA-PSS, adapté à un usage haute fréquence (vérifications publiques).

**Partage** : l'élève génère un lien de délégation contenant un identifiant de capacité — jamais le diplôme lui-même.

**Déclenchement** : la page de vérification publique déclenche la génération d'un nonce à usage unique côté serveur (TTL court, stocké, marqué consommé après un seul usage).

**Construction de la preuve** : le serveur lie `nonce + preuve titulaire + signature école` ; rien de secret ne transite en clair vers le client.

**Vérification** : signature vérifiée contre la clé publique de l'école, elle-même validée contre la racine PKI CertifyChain ; contrôle de révocation (diplôme/école) ; contrôle nonce non rejoué/non expiré → "Vérifié" (champs minimaux) ou "Introuvable".

**Pourquoi ce choix pour le MVP** : livre les garanties utiles (authenticité, anti-rejeu, non-divulgation du document, divulgation sélective) sans le coût d'ingénierie et d'audit d'un vrai zk-SNARK, en gardant la couture `ProofEngine` pour ne pas s'enfermer.

### Phase 2 (planifiée, non bloquante) : SnarkJS/Circom Groth16

Remplace l'implémentation concrète de `ProofEngine` (signature + vérification) par un vrai zk-SNARK Groth16 (circuits Circom, preuves via SnarkJS), sans modifier les appelants (`modules/diplomas`, `modules/verify`) tant qu'ils ne dépendent que de l'interface `ProofEngine` (`sign`/`verify`, futur `prove`/`verifyProof`).

**Pourquoi différé et non bloquant** : un circuit Groth16 nécessite une cérémonie de setup (trusted setup ou Powers-of-Tau universel), un circuit audité, des temps de preuve plus longs, et un investissement d'ingénierie disproportionné pour un MVP porté par un développeur solo. La couture d'interface rend cette migration indolore le jour où le produit justifie l'investissement (ex. exigence contractuelle d'un client B2B, ou preuve marketing différenciante).

**Préalable identifié avant Phase 2** : l'interface `ProofEngine` actuelle expose encore des champs concrets propres à Ed25519 (`publicKeyPem`, `signatureB64`, `payloadHashHex`) sans discriminant de moteur — ces noms fuient jusque dans `verify.routes.ts`. Avant de démarrer Groth16, introduire un discriminated union sur un champ `engine` littéral (ex. `"ed25519-nonce-v1"` vs futur `"groth16-v1"`), pendant qu'il n'y a qu'un seul moteur et un seul point d'appel — ce refactor coûte nettement moins cher maintenant que pendant la migration elle-même.

## Conséquences

### Positives

1. MVP livrable rapidement, sans dépendance à un service cryptographique tiers coûteux.
2. `node:crypto` natif : pas de nouvelle dépendance runtime, pas de nouvelle surface d'attaque logicielle.
3. Clé privée école chiffrée au repos (enveloppe AES-256-GCM) : compromission de la base seule n'expose pas les clés en clair.
4. Anti-rejeu réel via nonce à usage unique + TTL court, sans la complexité d'une blockchain.
5. Migration Phase 2 isolée derrière `ProofEngine` : pas de réécriture des routes/UI.

### Négatives

1. Honnêteté technique : la Phase 1 n'est PAS un zk-SNARK mathématique — pas de zero-knowledge au sens strict, seulement authenticité + anti-rejeu + non-divulgation pragmatique. À ne jamais présenter comme "zero-knowledge" au sens cryptographique dans un discours commercial sans nuance.
2. Dépendance à la sécurité opérationnelle du chiffrement enveloppe (si le KMS/Vault ou la clé maîtresse est compromise, les clés écoles le sont aussi).
3. Le nonce doit être stocké et purgé correctement (TTL, marquage "consommé") — une erreur d'implémentation ici casse la garantie anti-rejeu.
4. Phase 2 introduira une vraie dette technique de tooling (compilation de circuits, distribution de clés de preuve) le jour où elle sera activée.

## Alternatives considérées

### 1. RSA-PSS au lieu d'Ed25519

**Pour** : familiarité historique, support HSM plus répandu.
**Contre** : clés/signatures plus grosses, vérification plus lente, subtilités de padding sources d'erreurs d'implémentation.
**Verdict** : Rejeté. Ed25519 est plus simple à implémenter correctement et suffisant pour le modèle de menace visé.

### 2. zk-SNARK (Groth16/Circom) dès la Phase 1

**Pour** : zero-knowledge mathématique dès le jour 1.
**Contre** : cérémonie de trusted setup, circuits à concevoir/auditer, temps de preuve élevés, complexité disproportionnée pour un solo dev en phase MVP, budget/temps contraints.
**Verdict** : Rejeté pour la Phase 1, retenu comme cible Phase 2 une fois le produit validé.

### 3. Ancrage on-chain (ex. hash publié sur une blockchain publique)

**Pour** : horodatage infalsifiable public, argument marketing "blockchain".
**Contre** : coûts de gas, latence, gestion de clés/wallet supplémentaire, ne remplace pas le besoin du protocole de vérification lui-même, contradictoire avec l'objectif "léger et peu coûteux à héberger".
**Verdict** : Rejeté. N'apporte pas de garantie supplémentaire pertinente pour le modèle de menace (usurpation de diplôme), pour un coût opérationnel réel.

### 4. Verifiable Credentials W3C + DID

**Pour** : standard interopérable, écosystème existant.
**Contre** : stack plus lourde, immaturité pour le flux exact voulu (vérification sans compte, anti-rejeu par nonce), nécessiterait quand même un challenge-response custom par-dessus.
**Verdict** : Rejeté pour le MVP ; à réévaluer si un besoin d'interopérabilité avec d'autres plateformes de certification émerge.

### 5. HMAC symétrique (secret partagé) au lieu d'une signature asymétrique

**Pour** : simplicité, rapidité.
**Contre** : casse la non-répudiation — la plateforme partagerait le secret de signature avec l'école (ou le détiendrait seule), ce qui ne prouve plus que l'ÉCOLE a signé plutôt que CertifyChain elle-même. Contredit la promesse centrale (chaîne de confiance PKI par établissement).
**Verdict** : Rejeté d'emblée — invalide le modèle de confiance du produit.

## Implications sécurité

1. Clé privée école : chiffrée au repos AES-256-GCM (enveloppe), jamais en clair en base ni en logs (logger maison avec redaction PII).
2. Nonce : usage unique, TTL court, stocké côté serveur, marqué consommé après le premier usage — protection anti-rejeu.
3. Vérification en deux temps : signature Ed25519 valide ET certificat validé contre la racine PKI CertifyChain (pas de confiance transitive non vérifiée).
4. Contrôle de révocation systématique (école et diplôme) avant de renvoyer "Vérifié".
5. Divulgation minimale : aucune donnée personnelle du candidat transmise au recruteur sans consentement.
6. Rate-limiting sur la génération de nonce et les tentatives de vérification (anti-brute-force/anti-énumération).

## Impact déploiement

### Nouveaux besoins (Phase 1)

- Aucun service externe supplémentaire : `node:crypto` natif pour Ed25519, PostgreSQL existant pour stocker hash/signature/nonce.

### Nouveaux besoins (Phase 2, futur)

- Tooling de compilation de circuits Circom, génération de clés de preuve (Powers-of-Tau ou setup dédié), bundle SnarkJS côté serveur pour la génération/vérification de preuves — à isoler dans `server/src/crypto/proof-engine/groth16/` sans toucher aux modules appelants.

### Chemin de migration

1. L'interface `ProofEngine` (déjà en place, à faire évoluer en discriminated union sur un `engine` littéral avant Phase 2 — voir "Préalable identifié" ci-dessus) est le seul point de couture : `sign()`/`verify()` (et futur `prove()`/`verifyProof()`).
2. Implémenter `groth16-proof-engine.ts` à côté de `ed25519-nonce-proof-engine.ts`, basculer via configuration/flag, sans changer `modules/diplomas` ni `modules/verify`.
3. Migration des diplômes déjà émis en Phase 1 : les signatures Ed25519 existantes restent vérifiables indéfiniment (l'interface doit supporter la coexistence des deux schémas via un discriminant de version stocké par diplôme).

## Monitoring & observabilité

- `audit_log` : chaque vérification journalisée (date, identifiant anonymisé, résultat) — traçabilité légale RGPD-compatible.
- Alerte sur pics de nonces expirés/rejoués (signal d'attaque potentielle).
- Échecs de déchiffrement d'enveloppe de clé journalisés (jamais la clé elle-même).
- Rate-limit : seuils de dépassement journalisés et alertables.

## ADR liées

- Aucune pour l'instant (ADR fondatrice de la crypto). À rédiger sur ce même gabarit, par ordre de valeur : ADR-0002 (validation école SIRENE source de vérité + Gemini vérificateur), ADR-0003 (cookies isolés par réalm `cc_*`/`cc_admin_*`), ADR-0004 (remédiation secrets — Docker secrets pour la clé racine PKI et la master key, une fois implémentée).

## Références

- `CLAUDE.md` §4 (protocole de vérification) et §5 (modèle de sécurité) du repo CertifyChain.
- `architecture.md` §12 (analyse technologique complémentaire, 2026-07-06).
- RFC 8032 (EdDSA/Ed25519).
- Documentation SnarkJS / Circom (Groth16).
- OWASP Cryptographic Storage Cheat Sheet.

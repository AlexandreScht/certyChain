# KMS / HSM — Étape 0 du chantier V2 (clés hors-base)

> Réponses de l'étape 0 de `v2.md` §V2-0, consignées le 2026-07-14.

## 1. Le piège Ed25519 × KMS managés

CertifyChain signe les diplômes en **Ed25519** : une paire de clés par école, certifiée par une
racine PKI maison. Toute la chaîne de vérification (côté serveur **et**, depuis V1, côté
navigateur via `packages/shared/src/crypto/verify-bundle.ts`) suppose cette courbe. Changer de
courbe pour s'aligner sur ce qu'un KMS managé sait faire (typiquement ECDSA P-256) **invaliderait
tous les certificats et toutes les signatures déjà émis** — un coût sans commune mesure avec le
gain d'un KMS. Le principe directeur de cette étape 0 est donc : **on ne migre pas de courbe pour
un KMS**, on cherche un backend qui parle **déjà** Ed25519.

L'hypothèse de départ de `v2.md` §V2-0 (« la plupart des KMS managés ne supportent pas Ed25519 »)
n'est **plus exacte pour un des cinq fournisseurs** au 2026-07-14 : AWS KMS a ajouté le support
EdDSA/Ed25519 le 7 novembre 2025 (§2, écart signalé). Le reste de l'hypothèse tient : Azure Key
Vault / Managed HSM ne le supportent toujours pas dans la doc officielle du jour, malgré des
indices trompeurs dans certains changelogs de SDK.

## 2. Comparatif (vérifié sur les docs officielles au 2026-07-14)

| Fournisseur | Ed25519 | Coût mensuel ~50 écoles | Latence signature | SDK pur-JS / distroless | Verdict |
|---|---|---|---|---|---|
| **AWS KMS** | **Oui**, depuis le 7/11/2025 — key spec `ECC_NIST_EDWARDS25519`, algos `ED25519_SHA_512` / `ED25519_PH_SHA_512` | ≈ 50 $/mois (1 $/clé/mois × 50 + requêtes quasi négligeables à ce volume) | RTT réseau vers l'endpoint régional AWS — ordre de grandeur 10-50 ms/appel (aucun benchmark chiffré officiel trouvé) | Oui — SDK v3 JS pur (ou appel REST direct + SigV4 en pur JS/`node:crypto`) | Techniquement viable, mais lock-in AWS + compte à ouvrir ; support très récent (8 mois), pas retenu comme cible immédiate (§3) |
| **GCP Cloud KMS** | **Oui**, GA — algorithme `EC_SIGN_ED25519` (« EdDSA on Curve25519 in PureEdDSA mode »), disponible aux niveaux de protection `SOFTWARE` et `HSM` | Opérations confirmées à 0,03 $/10 000 signatures ; frais mensuel par version de clé active non extrait avec certitude aujourd'hui (page de tarification trop volumineuse pour le fetch automatisé de cette session) — à chiffrer précisément avant implémentation | Même ordre de grandeur que AWS (10-50 ms/appel, RTT réseau) | Oui via l'API REST en `fetch()` direct ; le client officiel `@google-cloud/kms` repose sur gRPC (`@grpc/grpc-js`, pur JS depuis plusieurs années) | Confirme l'hypothèse de `v2.md` (« GCP a bougé récemment ») ; viable mais même lock-in cloud qu'AWS |
| **Azure Key Vault (standard) + Managed HSM** | **Non**, d'après la doc officielle du jour : le tableau des types de clés/algorithmes de [`about-keys-details`](#sources) (Key Vault *et* Managed HSM, mise à jour 2026-06-12) ne liste que EC-P256/P256K/P384/P521, RSA et (Managed HSM) `oct`/AES — aucune ligne OKP/Ed25519/EdDSA | Sans objet pour Ed25519 ; pour mémoire, Managed HSM seul (le tier « HSM ») coûte ≈ 3,20 $/h ≈ 2 300-2 400 $/mois + 5 $/clé/mois pour les 250 premières clés | Sans objet | Sans objet (le SDK JS `@azure/keyvault-keys` est par ailleurs pur JS) | **Écarté** — malgré des enums `okp`/`Ed25519`/`EdDSA` ajoutés il y a plusieurs années dans les changelogs SDK .NET/Python (ciblant Managed HSM), la fonctionnalité n'a jamais atteint la doc d'algorithmes officielle actuelle ; un ticket GitHub ouvert (« Add local support for Ed25519 to Key Vault Keys ») confirme que le chantier est resté incomplet côté Microsoft |
| **HashiCorp Vault (Transit)** — ou son fork **OpenBao** | **Oui**, de longue date, dans l'édition **open source** (pas de gating Enterprise) : « `ed25519`: Ed25519; supports signing, signature verification, and key derivation » | Le logiciel est gratuit ; coût réel = celui d'un petit VPS auto-hébergé, ≈ 5-10 €/mois (estimation budgétaire, pas un tarif d'éditeur) | Colocalisé sur le même réseau privé que le serveur applicatif : quelques ms à quelques dizaines de ms — meilleur cas que les KMS cloud publics, car pas de trajet Internet public | **Oui, nativement** — API HTTPS REST simple, un `fetch()` suffit, **aucun SDK requis** | **Retenu** (§3) — seul candidat sans migration de courbe, sans lock-in cloud, à coût VPS, avec une API compatible distroless par construction |
| **YubiHSM 2** | **Oui** — « EdDSA (curve25519 only) », signature Ed25519 confirmée sur la fiche produit officielle | **780 € TTC** (prix constaté ce jour, au-dessus de l'hypothèse ~650 € de `v2.md` — écart signalé), achat matériel unique + hébergement physique à chiffrer à part | Latence USB directe faible par opération (le datasheet officiel mesure ≈ 73 ms en moyenne pour ECDSA-P256 ; Ed25519 est généralement plus rapide sur cette puce), mais pas de mise à l'échelle horizontale simple | **Non** — `yubihsm-shell`/`libyubihsm` = bibliothèque **native** C (bindings PKCS#11/CNG/Python) ; même le `yubihsm-connector` HTTP local est un binaire natif séparé à déployer hors du conteneur applicatif | **Écarté pour l'instant** — Ed25519 oui, mais natif/USB incompatible avec l'image distroless en l'état, coût matériel réévalué à la hausse, et c'est du matériel physique à héberger (pas un service géré) |

Rappel de contexte transverse à toute la colonne « Latence » : le RTT réseau domine largement le
temps de calcul de la signature elle-même. Sur un **import CSV de 500 diplômes**, 500 signatures
**séquentielles** à 20-50 ms chacune ≈ **10-25 s** — quel que soit le backend choisi, il faudra
**limiter la concurrence / batcher** les appels de signature plutôt que les envoyer un par un dans
une boucle synchrone (`crypto/signer.ts`, §V2-1 de `v2.md`, l'a déjà noté : « propager `await`
jusqu'aux services et vérifier que l'import CSV en lot ne fait pas 500 appels séquentiels »).

### Sources (URL + date de consultation, 2026-07-14) {#sources}

- **AWS** — key specs de signature : « Key spec reference », <https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html> (liste `ECC_NIST_EDWARDS25519`, algos `ED25519_SHA_512`/`ED25519_PH_SHA_512`) ; annonce : « AWS KMS now supports Edwards-curve Digital Signature Algorithm (EdDSA) », 7 novembre 2025, <https://aws.amazon.com/about-aws/whats-new/2025/11/aws-kms-edwards-curve-digital-signature-algorithm/> ; tarifs : <https://aws.amazon.com/kms/pricing/> (1 $/clé/mois, 0,15 $/10 000 requêtes asymétriques).
- **GCP** — algorithmes : « Key purposes and algorithms », <https://docs.cloud.google.com/kms/docs/algorithms> (`EC_SIGN_ED25519`, PureEdDSA, `SOFTWARE`/`HSM`) ; tarifs : <https://cloud.google.com/kms/pricing> (0,03 $/10 000 opérations de signature asymétrique confirmé ; frais par version de clé active non extrait ce jour).
- **Azure** — Key Vault : « Key types, algorithms, and operations — Azure Key Vault », <https://learn.microsoft.com/en-us/azure/key-vault/keys/about-keys-details> (mis à jour 2026-06-12) ; Managed HSM : « Key types, algorithms, and operations — Managed HSM », <https://learn.microsoft.com/en-us/azure/key-vault/managed-hsm/about-keys-details> (même date de mise à jour) — aucune des deux ne liste Ed25519/OKP ; tarifs Managed HSM : recherche croisée sur `azure.microsoft.com/pricing` (≈ 3,20 $/h + 5 $/clé/mois, non exploité puisque Ed25519 n'est pas supporté).
- **HashiCorp** — moteur Transit : « Transit secrets engine », <https://developer.hashicorp.com/vault/docs/secrets/transit> (`ed25519` listé sans mention Enterprise ; note FIPS 140-3 : `ed25519` non certifié, hors sujet ici) ; licence : changement vers BUSL 1.1 annoncé en août 2023 (BUSL interdit d'offrir Vault *en tant que service concurrent* à HashiCorp, pas l'auto-hébergement pour son propre usage) ; **OpenBao** — fork MPL 2.0 sous gouvernance Linux Foundation, compatible API, même support `ed25519` : <https://openbao.org/docs/secrets/transit/>.
- **YubiHSM 2** — fiche produit officielle Yubico, <https://www.yubico.com/product/yubihsm-2/> (EdDSA/curve25519, prix 780 € TTC constaté ce jour, interfaces Microsoft CNG/PKCS#11/bibliothèques natives C-Python).

## 3. Décision (2026-07-14)

**Option (c) de `v2.md` §V2-0 : livrer la couture `Signer` maintenant, brancher l'infra KMS plus
tard.**

- La couture (`crypto/signer.ts`, `EnvelopeSigner` par défaut + `KmsSigner` derrière
  `env.SIGNER_KIND`) représente ~90 % de la valeur d'ingénierie et coûte zéro infra.
- Backend désigné le jour du branchement : **HashiCorp Vault Transit auto-hébergé (ou son fork
  OpenBao)** — seul candidat qui signe en Ed25519 sans migration de courbe, à coût VPS, avec une
  API HTTPS pure (compatible distroless sans SDK).
- Note pour la prochaine revue de cette décision : AWS KMS et GCP Cloud KMS signent désormais
  eux aussi en Ed25519 nativement (§2) — ils redeviennent des options *cloud-managé* légitimes le
  jour où l'équipe voudra déléguer l'exploitation de l'infra plutôt que d'auto-héberger un VPS.
  Ça ne change pas le choix d'aujourd'hui (Vault reste sans lock-in, moins cher, et sans dépendance
  à un compte cloud), mais ça ferme la porte qu'on croyait fermée : si le calcul coût/exploitation
  penche un jour vers le managé, ce n'est plus bloqué par l'absence d'Ed25519.
- Les écoles existantes restent `signer_kind = 'envelope'` ; la bascule se fait école par école
  (nouvelles clés), jamais en big-bang.

## 4. Honnêteté sur le gain (à ne jamais survendre)

Un KMS empêche l'**exfiltration** de la clé (un dump de base + la master key ne suffisent plus) et
fournit un **journal d'usage**. Il n'empêche PAS un attaquant disposant d'une RCE sur le serveur de
**faire signer** des diplômes pendant qu'il est là. L'antidote à ce scénario est le journal de
transparence (**V3**), qui rend la fraude détectable par l'école.

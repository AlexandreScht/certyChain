# Référentiel EUDI — OpenID4VCI et SD-JWT VC

Standards figés le **12 juillet 2026**. Les fichiers locaux sont conservés pour rendre les choix
d'interopérabilité reproductibles même si les drafts évoluent.

## Versions épinglées

| Brique | Version locale | Date du texte | Source officielle |
|---|---|---|---|
| Émission | OpenID4VCI 1.0 Final | 16 septembre 2025 | <https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0-final.html> |
| Divulgation sélective | RFC 9901 | novembre 2025 | <https://www.rfc-editor.org/rfc/rfc9901.txt> |
| Credential SD-JWT VC | `draft-ietf-oauth-sd-jwt-vc-17` | 6 juillet 2026 | <https://www.ietf.org/archive/id/draft-ietf-oauth-sd-jwt-vc-17.txt> |
| Statut/révocation | `draft-ietf-oauth-status-list-21` | 21 juin 2026 | <https://www.ietf.org/archive/id/draft-ietf-oauth-status-list-21.txt> |

## Points d'interopérabilité résolus

- Identifiant de format : **`dc+sd-jwt`** ; le header `typ` de l'Issuer-signed JWT utilise la
  même valeur.
- La réponse immédiate du Credential Endpoint est :
  `{ "credentials": [{ "credential": "<SD-JWT VC>" }] }`. Le SD-JWT est une chaîne et ne doit
  pas être ré-encodé.
- Dans `credential_configurations_supported`, le profil contient `format`, `vct`,
  `cryptographic_binding_methods_supported: ["jwk"]`,
  `credential_signing_alg_values_supported`, et `proof_types_supported`.
- L'affichage et la liste des claims se placent sous `credential_metadata`. Les claims sont un
  tableau d'objets `{ "path": ["nom_du_claim"], "display": [...] }`, et non un tableau de
  chaînes ni un objet de l'ancien draft.
- Le Credential Request final utilise `proofs: { jwt: ["…"] }`. Le proof JWT porte le type
  `openid4vci-proof+jwt`, l'audience de l'issuer et le `c_nonce` récupéré séparément auprès du
  Nonce Endpoint.
- L'émetteur n'annonce pas `batch_credential_issuance` dans ses métadonnées : il accepte donc
  exactement un proof et émet une seule credential par requête. Le support de plusieurs proofs
  ne deviendra obligatoire que si cette capacité de lot est explicitement publiée.
- L'Authorization Server annonce explicitement
  `pre-authorized_grant_anonymous_access_supported: true` : le token endpoint n'exige pas de
  `client_id` pour ce flux pré-autorisé.
- Les erreurs Credential utilisent les codes finaux (`invalid_credential_request`,
  `unknown_credential_configuration`, `invalid_proof`, `invalid_nonce`,
  `invalid_encryption_parameters`) ; les endpoints publics renvoient le format OAuth/OID4VCI,
  jamais l'enveloppe d'erreur interne CertifyChain.
- Le Status List Token JWT utilise `typ: "statuslist+jwt"` et les claims
  `sub`, `iat`, `ttl`, `status_list: { bits: 1, lst }`. Le credential référencé utilise
  `status: { status_list: { idx, uri } }`.

## Profil CertifyChain v1

- Issuer plateforme unique : `PUBLIC_API_ORIGIN`.
- Signature ES256/P-256, `kid` versionné, anciennes clés publiées après rotation.
- VCT : `urn:certifychain:diploma:1`.
- Pre-Authorized Code + `tx_code` numérique à cinq chiffres ; aucun Authorization Code flow.
- Tous les claims métier sont sélectivement divulgables ; `iss`, `iat`, `vct`, `cnf` et `status`
  restent visibles.
- Aucun SD-JWT ni disclosure n'est stocké. Seules les métadonnées d'émission et l'empreinte de la
  clé holder sont conservées.
- La liste de statut est dérivée à la lecture de la révocation du diplôme et du statut de l'école.
  Le JWKS et les listes déjà émises restent consultables même si les nouvelles émissions sont
  désactivées.

`PUBLIC_API_ORIGIN` devient un identifiant cryptographique durable dès la première émission : ne
pas le changer lors d'un redéploiement. Une migration de domaine exige une stratégie d'issuer et
de disponibilité des anciennes URLs, pas une simple modification de variable d'environnement.

## Provisionnement de la clé d'émission

Après la migration `0012_vc_issuer`, créer la première clé plateforme avec :

```bash
pnpm --filter @certifychain/server keys:vc
```

La commande refuse d'écraser une clé active. Pour une rotation atomique, utiliser
`pnpm --filter @certifychain/server keys:vc -- --rotate` : l'ancienne clé passe à `retired` mais
sa JWK publique reste disponible. La JWK privée P-256 est toujours chiffrée par le `keyVault` ;
elle n'est ni affichée ni stockée en clair. En développement/smoke, `db:seed` crée la clé si elle
est absente lorsque `VC_EXPORT_ENABLED=true`.

## Bibliothèques évaluées

Le 12 juillet 2026, npm publiait `@sd-jwt/core` et `@sd-jwt/sd-jwt-vc` en `0.20.0`, et
`@owf/token-status-list` en `0.3.1`. Ce dernier dépend de `cbor-x`, qui déclare le module natif
optionnel `cbor-extract`. Pour préserver l'image distroless et éviter une surface transitive
inutile, le profil SD-JWT VC fermé et la liste JWT sont implémentés avec les primitives déjà
présentes (`jose`, `node:crypto`, `node:zlib`). Ils sont testés contre RFC 9901 et les vecteurs du
draft Status List ; aucune dépendance ni compilation native n'a été ajoutée.

## Test manuel wallet

Un téléphone doit joindre `PUBLIC_API_ORIGIN`. OpenID4VCI exige HTTPS pour le `nonce_endpoint` ;
le test réel nécessite donc le futur proxy TLS ou un tunnel HTTPS. Le smoke local peut utiliser
`http://localhost:4000`, mais ne constitue pas un test d'interopérabilité avec un wallet EUDI réel.
En production, le serveur refuse l'activation EUDI si `PUBLIC_API_ORIGIN` n'est pas une origine
HTTPS nue.

Checklist : scanner le QR, saisir le `tx_code`, vérifier les claims, présenter un sous-ensemble,
révoquer le diplôme dans CertifyChain, puis constater le bit de statut après expiration du TTL.

# `secrets/` — contenu des Docker secrets racine

> Ce répertoire est **gitignoré** (sauf ce fichier) — voir
> [`docs/security/root-secrets-rotation.md`](../docs/security/root-secrets-rotation.md) pour la
> cérémonie complète de génération et de rotation.

Utilisé UNIQUEMENT avec l'overlay optionnel `docker-compose.secrets.yml` :

```bash
docker compose -f docker-compose.yml -f docker-compose.secrets.yml up -d --build
```

Chaque fichier attendu ici contient la **valeur brute** du secret (pas de `CLE=valeur`, pas de
guillemets, pas de commentaire — exactement ce qui suit `=` dans `.env` aujourd'hui) :

| Fichier | Contenu |
|---|---|
| `certifychain_root_private_key` | Valeur de `CERTIFYCHAIN_ROOT_PRIVATE_KEY` (PEM PKCS8 base64) |
| `certifychain_root_pq_private_key` | Valeur de `CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY` (ML-DSA-65 base64) |
| `master_enc_key` | Valeur de `MASTER_ENC_KEY` (32 octets base64) |

Sans cet overlay, ces trois secrets continuent de vivre dans `.env` (comportement par défaut,
inchangé) — l'overlay et la convention `<VAR>_FILE` (`apps/server/src/config/env.ts`) sont un
chemin **additionnel**, pas un remplacement obligatoire.

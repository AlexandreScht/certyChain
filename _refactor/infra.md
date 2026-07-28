# infra.md — Actions d'infrastructure à réaliser

> Ce fichier ne liste **que** ce qui se fait **hors du code** : provisionnement, souscription,
> réseau, coordination avec un tiers. Tout ce qui se règle en écrivant du code est dans
> [`dette-technique.md`](./dette-technique.md) ; l'avancement fonctionnel est dans
> [`PLAN.md`](./PLAN.md).
>
> État de référence au 2026-07-28 : typecheck 0 erreur ×6 · node:test 305/305 (77 suites) ·
> Jest 429/429 (51 suites) · lint exit 0 · **Gate C Docker `SMOKE OK — 71 vérifications, 0 échec`**.

---

## 1. 🔴 Vault / OpenBao — prérequis de mise en production

**Décision prise** : un Vault sera déployé **avant** la mise en production. Le code est prêt et
attend uniquement l'infrastructure.

| | |
|---|---|
| **État du code** | ✅ Livré (V2). Interface `Signer`, client Vault Transit en `fetch` pur (aucun SDK — compatible distroless), bascule **école par école**, jamais big-bang. |
| **État réel** | `SIGNER_KIND=envelope` (défaut dans `apps/server/src/config/env.ts:230` et dans `.env`). La clé privée de chaque école est **dans la base**, chiffrée par `MASTER_ENC_KEY`. |
| **Conséquence** | Un dump de la base **plus** la clé maître suffisent à extraire une clé d'école. C'est précisément ce que V2 doit rendre impossible. |
| **À faire** | Provisionner un VPS Vault (ou fork OpenBao), créer le mount Transit, générer un token, renseigner `VAULT_ADDR` / `VAULT_TOKEN` / `VAULT_TRANSIT_MOUNT` / `VAULT_KEY_PREFIX`, puis basculer `SIGNER_KIND=kms`. |
| **Fail-fast** | `env.ts` refuse de démarrer si `SIGNER_KIND=kms` sans `VAULT_ADDR` http(s) valide et `VAULT_TOKEN` non vide. |

⚠️ **Couplage avec la copie produit.** `copy.md` §B.11 porte la ligne
`[V2]` **« Votre clé ne quitte jamais son coffre matériel. Même nous ne pouvons pas l'extraire. »**
Cette phrase n'est vraie **qu'une fois `SIGNER_KIND=kms` actif en production**. Tant que ce n'est
pas fait, elle ne doit pas être publiée — c'est exactement la règle d'or de `copy.md` (le piège
« ZKP » que le projet a déjà payé une fois).

**Note de bascule** : le jour du branchement, prévoir de batcher / limiter la concurrence des
imports CSV — chaque signature devient un aller-retour réseau vers Vault.

---

## 2. 🔴 Fournisseur SMTP de production

| | |
|---|---|
| **État du code** | ✅ Livré. Client SMTP maison sans dépendance, supportant **trois** modes : clair (Mailpit dev), **STARTTLS** (port 587) et TLS implicite (port 465). Garde-fou vérifié en conditions réelles : l'authentification est **refusée** sur un canal non chiffré, jamais de mot de passe en clair sur le réseau. |
| **État réel** | `.env` porte un compte **Ethereal de test** — un service qui **capture** les messages et ne les délivre jamais. Aucun mail ne part réellement. |
| **À faire** | Souscrire un relais réel et renseigner `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, puis **un seul** de `SMTP_STARTTLS=true` (port 587) ou `SMTP_SECURE=true` (port 465). Les deux à `true` simultanément font échouer le démarrage, volontairement. |
| **Impact si non fait** | Ni les OTP de connexion élève, ni les liens de récupération (`claim`), ni les notifications ne partent. Le produit est inutilisable en production. |

Procédure détaillée et comparatif de fournisseurs : [`docs/email/README.md`](./docs/email/README.md).

---

## 3. 🟠 Nom de domaine public + ports 80/443 (TLS Caddy)

| | |
|---|---|
| **État du code** | ✅ Livré (P1). `Caddyfile` + service compose optionnel sous le profil `proxy`, TLS Let's Encrypt automatique, volumes de certificats persistants. `TRUST_PROXY` et `API_BIND` câblés et **testés** (six tests prouvent qu'un `X-Forwarded-For` forgé est ignoré tant que `TRUST_PROXY` n'est pas actif). |
| **Jamais vérifié** | L'obtention **réelle** d'un certificat Let's Encrypt. Elle exige un nom de domaine public pointant vers la machine et les ports 80/443 ouverts sur Internet — impossible à tester en local. |
| **À faire** | Enregistrer le domaine, ouvrir 80/443, renseigner `API_DOMAIN`, démarrer avec `--profile proxy`, puis **vérifier que le certificat est bien émis** avant d'annoncer quoi que ce soit. |

---

## 4. 🟠 Interopérabilité EUDI Wallet réelle

| | |
|---|---|
| **État du code** | ✅ Livré (F2). OpenID4VCI 1.0 Final, SD-JWT VC, Token Status List. Le flux complet est exercé par le smoke (8 vérifications). |
| **Jamais vérifié** | Le test avec un **portefeuille EUDI tiers réel**. Il exige une origine **HTTPS publique stable** (donc l'action n°3 d'abord, ou un tunnel). |
| **À faire** | Une fois le domaine en place, dérouler un flux complet depuis un portefeuille tiers. **Ne pas considérer l'interopérabilité comme acquise avant.** |
| **Prérequis technique** | La clé émettrice VC se provisionne **en base**, pas par variable d'environnement : `corepack pnpm@9.12.0 --filter @certifychain/server keys:vc`. Sans elle, tout le flux répond `404 « Export EUDI indisponible »` — piège de diagnostic déjà rencontré. |

---

## 5. 🟠 Dépôt de fichier CDC (Caisse des Dépôts)

| | |
|---|---|
| **État du code** | ✅ Livré (F1). Kit officiel du 30/03/2026 figé, XML déterministe validé contre le XSD 1.1.5 par golden test. |
| **Jamais vérifié** | Le dépôt réel d'un fichier sur l'environnement CDC. |
| **À faire** | Coordonner avec la Caisse des Dépôts : **aucun bac à sable public n'est documenté** dans leur kit officiel. C'est une démarche administrative, pas technique. |

---

## 6. 🟢 Ancrage Bitcoin — observation en production

Le CRON OpenTimestamps **est câblé** (`checkpoint.service.ts:334`, intervalle 30 min). Rien à
faire côté code. Mais l'ancrage réel prend **quelques heures à quelques jours** (confirmation
Bitcoin), et n'a donc jamais été observé de bout en bout.

Jusqu'à confirmation, le vérificateur affiche honnêtement « ancrage en attente de confirmation »
et **jamais** « ancré » — aucune fausse promesse n'est faite entre-temps. À simplement surveiller
après la première mise en production : `ots_upgraded_at` doit finir par se remplir.

---

## 7. 🟢 Redis — seulement le jour d'une 2ᵉ instance API

Le rate-limit (fenêtre glissante) et le token-bucket sortant SIRENE/Gemini sont **en mémoire**,
hypothèse assumée d'une instance unique. Ils restent corrects tant qu'il n'y a qu'une seule
instance d'API.

**Déclencheur** : le jour où une seconde instance est déployée, ces compteurs doivent passer sur
Redis — sinon chaque instance applique son propre plafond et le plafond réel est multiplié par le
nombre d'instances.

---

## 8. 🟢 Secrets Docker (optionnel, recommandé avant la production)

`docker-compose.secrets.yml` (overlay optionnel) permet de sortir des variables d'environnement la
clé privée PKI Ed25519, la clé privée ML-DSA et `MASTER_ENC_KEY`, sous forme de fichiers montés en
tmpfs — `env.ts` supporte la convention `<VAR>_FILE`, lue en Node (les images finales sont
distroless, **sans shell**, donc aucun entrypoint bash n'est possible).

Cérémonie de génération et de rotation : [`docs/security/root-secrets-rotation.md`](./docs/security/root-secrets-rotation.md).

⚠️ **Point à ne pas rater dans la cérémonie** : la rotation de la racine PKI impose de
**reconstruire les 3 images front**, pas seulement de les redémarrer. Les valeurs `NEXT_PUBLIC_*`
sont figées dans le bundle JavaScript au moment du `next build`. Voir
[`docs/architecture/decisions/0007-browser-root-pinning.md`](./docs/architecture/decisions/0007-browser-root-pinning.md).

⚠️ **Limite connue** : la rotation de `MASTER_ENC_KEY` n'est **pas** exécutable aujourd'hui — voir
[`dette-technique.md`](./dette-technique.md) §1.

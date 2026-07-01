# Guide de test — CertifyChain

> Guide pas-à-pas pour tester l'application **de A à Z** : le parcours normal (école → candidat → recruteur) et les deux scénarios de **falsification** (depuis une fausse école, depuis un candidat malhonnête), avec **ce qui bloque la fraude et pourquoi**.
>
> Les résultats indiqués (« Résultat attendu ») ont été **vérifiés en live** sur la stack locale. Voir aussi [`PLAN.md`](./PLAN.md) (avancement) et [`README.md`](./README.md) (installation).

---

## 0. Démarrer les services

Il faut **4 services** : la base PostgreSQL, la boîte mail de dev **Mailpit** (pour lire les codes OTP), l'**API** et le **web**.

### Option A — Docker (tout-en-un, mode DÉV)

Pour tester en local, utilise la **surcharge dev** : elle ajoute Mailpit + pgweb
et repasse l'API en `NODE_ENV=development` (cookies acceptés en `http://`).

```bash
cp .env.example .env                      # puis renseigner les secrets : pnpm --filter @certifychain/server keys:root
docker compose -f docker-compose.yml -f docker-compose-dev.yml up --build
#   → postgres + api (:4000) + web (:3000) + admin (:3002) + mailpit (:8025) + pgweb (:8081)
```
- Web → http://localhost:3000 · API → http://localhost:4000 · **Mailpit (boîte mail)** → http://localhost:8025 · **pgweb (base de données)** → http://localhost:8081
- L'API applique les migrations au démarrage.
- ⚠️ `docker compose up --build` **sans** la surcharge lance la stack **PROD**
  (cookies `Secure`, sans Mailpit/pgweb) — à n'utiliser que pour un vrai déploiement.


### Comptes de démo (après `pnpm db:seed`)

| Rôle | Identifiants | Entrée |
|---|---|---|
| École **déjà validée** | `admin@ecole-demo.fr` / `DemoPassw0rd!24` | `/ecole/login` |
| Élève (OTP) | `alex.dubois@example.com` | `/wallet/login` (code dans Mailpit) |

> 💡 Le **thème sombre** se bascule via le bouton ☀️/🌙 (en haut à droite de la navbar et des portails).

### Explorer la base de données (navigateur)

**pgweb → http://localhost:8081** : il se connecte automatiquement à `certifychain`. La barre de gauche liste les tables — clique pour voir les lignes, l'onglet *Query* permet d'exécuter du SQL, *Export* d'extraire en CSV/JSON.

Tables utiles : `schools` (statut, clé publique, certificat), `school_admins`, `students`, `diplomas` (hash + signature + statut), `share_links` (jetons de partage), `verification_nonces`, `otp_codes`, `audit_log`.

---

## a) Chemin normal

> But : une école demande sa validation, est validée, émet un diplôme ; le candidat se connecte, voit son diplôme et partage un lien ; le recruteur le vérifie.

| # | Étape | À faire dans le navigateur | Résultat attendu (vérifié) |
|---|---|---|---|
| 1 | **L'école demande une validation** | `/ecole/register` → remplir le formulaire KYB (nom, **SIRET 14 chiffres**, email de contact, email + mot de passe admin **≥ 12 caractères**) → **Envoyer** | Compte créé, statut **`pending`** (en attente de validation) |
| 2 | **L'école se connecte** | `/ecole/login` avec l'email/mot de passe admin | Connexion OK, le tableau de bord affiche le badge **« En attente »** |
| 3 | **Une fois validée, l'école le voit bien** | Sur le dashboard, carte **« Activez votre établissement »** → bouton **Activer (dev)** | Statut → **`approved`**, **clés PKI + certificat d'émetteur générés** (« Clés PKI générées »), tuile « Prêt à émettre » |
| 4 | **L'école émet un certificat pour un candidat** | `/ecole/diplomes/nouveau` → renseigner le diplôme (titulaire, **email du candidat**, intitulé, date, mention) → **Émettre** | Diplôme **signé (Ed25519)** ; un **email de notification** part vers le candidat (visible dans Mailpit) |
| 5 | **Le candidat crée / se connecte à son compte** | `/wallet/login` → saisir **l'email du candidat** → **lire le code OTP dans Mailpit** (http://localhost:8025) → valider | Connecté en tant qu'élève (le compte est créé automatiquement lors de l'émission) |
| 6 | **Il voit son diplôme** | Le wallet liste ses diplômes | La carte du diplôme émis apparaît |
| 7 | **Il envoie un lien à un recruteur** | Ouvrir le diplôme → **Partager** → copier le lien `/verify/<token>` (QR code disponible) | Lien de partage créé (≠ le diplôme lui-même) |
| 8 | **Le recruteur voit le diplôme valide** | Ouvrir `/verify/<token>` **sans aucun compte** | **« Diplôme vérifié »** en < 2 s, avec **uniquement** : `holderName, programTitle, mention, issuedAt, schoolName, issuerCertificateValid` |

**Divulgation minimale (RGPD) :** la page de vérification **n'expose jamais** l'email du candidat, le hash, ni la signature. Le lien est **à usage unique** (nonce anti-rejeu).

---

## b) Falsification depuis l'école

> Scénario : **une fausse école** (ou une école non encore validée) essaie d'émettre un diplôme.

**Reproduire :**
1. Inscrire une école via `/ecole/register`, puis se connecter.
2. Aller directement sur `/ecole/diplomes/nouveau` et tenter d'émettre **sans cliquer sur « Activer »**.

**Résultat attendu (vérifié) :**
```
HTTP 403 — code "school_not_approved" — « Établissement non approuvé »
```

**En quoi la solution bloque la fraude (défense en profondeur) :**

1. **Porte applicative** — l'émission exige `status === "approved"` **et** une clé privée présente (`issueDiploma`). Une école non validée n'a **ni clé ni certificat** → émission refusée (403).
2. **Racine de confiance (la vraie garantie)** — une école n'obtient un **certificat signé par la racine CertifyChain** qu'**au moment de la validation**. Un fraudeur qui monterait son propre serveur avec ses propres clés produirait un certificat **qui ne chaîne pas vers la racine** → la vérification publique renvoie **« introuvable »** (la validité du certificat racine est une **barrière dure**, pas un simple indicateur). Il ne peut pas forger ce certificat : il n'a pas la **clé privée racine**.
3. **Signature cryptographique** — chaque diplôme est signé en **Ed25519** par la clé de l'école ; une signature forgée échoue à la vérification.

**Preuves cryptographiques** (suite `node:test`, 0 échec — `pnpm --filter @certifychain/server test`) :
- ✅ `rejects a forged signature (wrong issuer key)`
- ✅ `rejects a certificate whose bound fields were tampered`
- ✅ `a root-issued certificate validates against the CertifyChain root`

> En **production**, le bouton « Activer (dev) » est remplacé par la **validation manuelle KYB/SIRET par CertifyChain** : c'est là qu'est la vraie barrière anti-fraude à l'entrée (cf. gaps **B1 / H3** dans `PLAN.md`).

---

## c) Falsification depuis le candidat

> Scénario : **un candidat prétend détenir un diplôme** (d'une école identifiée ou non) qu'il **n'a pas**.

**Reproduire :**
1. Avec un email **jamais diplômé**, tenter `/wallet/login`.
2. Ouvrir une URL de vérification **inventée** : `/verify/<token-au-hasard>`.

**Résultats attendus (vérifiés) :**
```
1) Demande OTP  → HTTP 200 {ok:true}  MAIS aucun email reçu dans Mailpit
2) Lien inventé → result = "not_found"
```

**En quoi la solution bloque la fraude :**

1. **Pas d'auto-inscription** — l'OTP n'est envoyé qu'à un **élève existant**, et un élève n'existe **que créé par une émission d'école**. Sans diplôme reçu → pas de code → pas de wallet. *(La réponse reste toujours `{ok:true}` : **anti-énumération**, aucune fuite sur l'existence d'un compte.)*
2. **Pas d'auto-émission** — le wallet ne liste que les diplômes liés à son `studentId` ; **aucune route ne permet à un candidat de créer un diplôme**. Il n'a donc rien de frauduleux à partager.
3. **Lien inventé → introuvable** — aucun lien de partage signé ne correspond → **« introuvable »**. Que l'école revendiquée soit identifiée ou non : sans **certificat chaînant à la racine** *et* sans **lien signé**, impossible d'obtenir un « vérifié ».
4. **Falsification de contenu** — modifier le contenu d'un diplôme casse le hash → la signature ne correspond plus → résultat **« invalid »**.

**Preuves cryptographiques** (suite `node:test`) :
- ✅ `rejects tampered diploma content (hash no longer matches signature)`
- ✅ `rejects replay of a stale proof on a fresh nonce` (anti-rejeu)

---

## Récapitulatif des protections

| Menace | Ce qui se passe | Mécanisme qui bloque |
|---|---|---|
| École non validée émet | `403 school_not_approved` | Statut `approved` requis + clés/cert absents |
| Fausse école auto-signée | Vérif → `not_found` | Certificat doit **chaîner à la racine** CertifyChain |
| Signature forgée | Vérif → `invalid` | Vérification **Ed25519** contre la clé publique de l'école |
| Contenu altéré | Vérif → `invalid` | Hash canonique signé |
| Candidat sans diplôme | Pas d'OTP / wallet vide | Pas d'auto-inscription ni d'auto-émission |
| Lien inventé / revendiqué | Vérif → `not_found` | Aucune capacité signée ne correspond (+ anti-énumération) |
| Lien rejoué | Vérif → `invalid` | **Nonce à usage unique** (TTL court) |
| Fuite de données au recruteur | Champs minimaux seulement | Divulgation sélective (RGPD) |

---

## Annexe — Tests automatisés

- **Suite crypto/unitaire** (32 tests `node:test`) :
  ```bash
  pnpm --filter @certifychain/server test
  ```
- **Vérification email (SMTP → Mailpit)**, **smoke E2E** complet et **démo des 3 scénarios** : des drivers Node ont servi à valider ce guide en live (parcours complet + falsifications). Ils s'exécutent contre l'API sur `:4000` et lisent Mailpit sur `:8025`.

## Arrêter les services

```bash
# Dev local
docker stop certify-mailpit certify-pgweb certify-pg   # boîte mail + navigateur DB + base
# (puis arrêter les process API/web lancés par pnpm stack:dev)

# Docker tout-en-un
docker compose down
```

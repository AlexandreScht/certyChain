# Guide de test — Vérification de propriété d'un établissement (`verify.md`)

> Comment tester **en dev**, à la main, les **3 méthodes** de preuve de propriété
> (DNS TXT · ProConnect · Courrier postal) décrites dans [`verify.md`](./verify.md).
>
> Les services nécessaires (mock ProConnect, résolveur DNS local, relais de
> webhook Stripe) sont fournis dans **`docker-compose-dev.yml`** (surcharge dév).
> Voir aussi [`GUIDE_TEST.md`](./GUIDE_TEST.md) pour le parcours métier de base.

---

## 0. Démarrer la stack de test

```bash
cp .env.example .env                       # si pas déjà fait
pnpm --filter @certifychain/server keys:root   # génère les secrets PKI/racine dans .env

# Stack complète + services de test (mock ProConnect, CoreDNS, db exposée) :
docker compose -f docker-compose.yml -f docker-compose-dev.yml up --build
```

| Service | URL | Rôle |
|---|---|---|
| Web | http://localhost:3000 | portail école |
| API | http://localhost:4000 | Hono |
| **Mock ProConnect** | http://localhost:8090 | faux SSO d'État (option ProConnect) |
| Mailpit | http://localhost:8025 | emails (OTP, ordre d'envoi postal) |
| pgweb | http://localhost:8081 | navigateur base de données |
| Postgres | `localhost:5432` | exposée pour `pnpm db:*` / psql |

> La surcharge repasse l'API en **`NODE_ENV=development`** : les cookies de session
> sont acceptés en `http://localhost` (sinon `Secure` est forcé et le login échoue).

Données de démo (depuis l'hôte, la base est exposée sur 5432) :
```bash
pnpm --filter @certifychain/server db:seed
```

---

## 1. Amener une école au statut `provisional` (étape clé)

Les méthodes de propriété ne sont proposées **que** pour une école `provisional`
(existence confirmée, propriété pas encore prouvée → lecture seule, pas d'émission).

Inscris d'abord une école via `/ecole/register` en choisissant des infos adaptées à
la méthode visée : **email `…@ecole-test.fr`** (option DNS) et/ou **SIRET
`12345678901234`** (= `MOCK_SIRET`, option ProConnect). Statut initial : `pending`.
Puis amène-la en `provisional` par l'une de ces voies :

**A. Via le portail admin (recommandé — c'est le vrai flux).** Connecte-toi à
http://localhost:3002 (`/admin`), ouvre l'école, clique **« Valider l'existence »**.
→ L'école passe **`provisional`** (et **non** `approved` : aucune clé PKI n'est
générée) et reçoit l'email d'invitation à prouver la propriété (Mailpit).
*(Compte admin seedé : `admin@certifychain.local` / `AdminPassw0rd!24` ; le secret
TOTP est imprimé par `db:seed`.)*

**B. Forcer le statut en base (rapide, sans login admin).** Dans **pgweb → *Query*** :

```sql
UPDATE schools
SET status = 'provisional',
    siret = '12345678901234',                 -- doit == MOCK_SIRET pour ProConnect
    contact_email = 'direction@ecole-test.fr', -- domaine = zone CoreDNS pour le DNS
    domain = NULL, control_proof_method = NULL, control_proof_at = NULL,
    public_key = NULL, certificate = NULL, encrypted_private_key = NULL
WHERE contact_email = 'direction@ecole-test.fr' OR name = 'Mon École Test';
```

**C. Auto-validation IA.** `SCHOOL_AUTO_VALIDATE=true` + `INSEE_API_KEY` +
`GEMINI_API_KEY` dans `.env`, puis inscrire une école avec un **vrai SIRET actif**
dont le score ≥ `SCHOOL_AUTO_VALIDATE_MIN_SCORE` → bascule auto en `provisional` +
email d'invitation (Mailpit).

> ✅ **Invariant (corrigé le 2026-06-29)** : approbation admin **et** auto-validation
> IA mènent à `provisional`, jamais directement à `approved`. Les clés Ed25519 +
> certificat ne sont générés **que** par une preuve de contrôle réussie (DNS / postal
> / ProConnect) — ou la route dev `/schools/me/activate`.

**Se connecter :** `/ecole/login` → mot de passe → **enrôle le TOTP** (QR affiché au
1er login ; scanne-le avec une app d'authentification) → dashboard. Le menu mène à
**`/ecole/verification`** : les 3 cartes de méthodes s'affichent.

---

## 2. Option ProConnect (mock local — la plus simple)

Aucun compte DINUM requis : `proconnect-mock` joue le SSO d'État.

1. École au statut `provisional` avec **`siret = 12345678901234`** (= `MOCK_SIRET`).
2. `/ecole/verification` → carte **ProConnect** → *Choisir cette méthode*.
3. Bouton **« Se connecter avec ProConnect »** → redirection vers
   http://localhost:8090/authorize (page « Mock ProConnect (DEV) »).
4. Clique **« Se connecter avec ProConnect (mock) »** → retour sur
   `/ecole/verification?verified=1`.

**Résultat attendu :** l'API compare le SIRET attesté (`12345678901234`) au SIRET
déclaré → **égal** → `approveSchool()` : statut **`approved`**, clés PKI générées,
panneau « Établissement vérifié ». L'audit log porte `ownership_verified {method:proconnect}`.

**Tester l'échec :** mets un SIRET école **différent** de `MOCK_SIRET` (ou lance la
stack avec `MOCK_SIRET=99999999999999`) → callback `?error=proconnect`, statut inchangé,
audit `verification_failed {reason:siret_mismatch}`.

---

## 3. Option DNS TXT (résolveur CoreDNS local)

Permet de prouver le contrôle d'un domaine **sans en posséder un**, hors-ligne.

1. École `provisional` dont **l'email de contact est `…@ecole-test.fr`** (zone servie
   par CoreDNS). La carte **DNS** doit être *disponible*.
2. `/ecole/verification` → carte **Enregistrement DNS** → *Choisir cette méthode*.
3. L'écran affiche : `Nom : _certifychain.ecole-test.fr` · `Valeur :
   certifychain-verify=<TOKEN>`. **Copie le `<TOKEN>`**.
4. Édite **`dev/coredns/db.ecole-test.fr`** : remplace `REPLACE_WITH_TOKEN` par le
   token, **incrémente le serial** du SOA, sauvegarde. CoreDNS recharge en ~10 s.
   *(Pour forcer : `docker compose -f docker-compose.yml -f docker-compose-dev.yml restart dns-resolver`.)*
5. Reviens sur la page → **« Vérifier »**.

**Résultat attendu :** l'API résout `_certifychain.ecole-test.fr` via CoreDNS, trouve
le token → **`approved`** + clés PKI. Audit `ownership_verified {method:dns}`.

> Token absent/mauvais → `422 verification_failed` (« Enregistrement DNS introuvable… »),
> compteur `attempts` incrémenté, on peut réessayer.

**Alternative sans CoreDNS :** inscris l'école avec un **domaine que tu possèdes
réellement** et crée le TXT `_certifychain.<ton-domaine>` chez ton registrar.

---

## 4. Option Courrier postal (Stripe test + INSEE)

La plus exigeante : adresse officielle (INSEE) + paiement (Stripe). Comptes de **test
gratuits** requis.

**Prérequis `.env` :**
```bash
INSEE_API_KEY=...            # portail-api.insee.fr (gratuit) — sinon postal non proposée
STRIPE_SECRET_KEY=sk_test_...# dashboard.stripe.com (mode test)
STRIPE_WEBHOOK_SECRET=       # rempli à l'étape 2 ci-dessous
```
L'école `provisional` doit avoir un **vrai SIRET actif** connu de l'INSEE (sinon
« Adresse officielle introuvable »).

**Étapes :**

1. Démarre le relais de webhook (profil opt-in) :
   ```bash
   docker compose -f docker-compose.yml -f docker-compose-dev.yml --profile postal up -d stripe-cli
   docker compose -f docker-compose.yml -f docker-compose-dev.yml logs stripe-cli | grep whsec_
   ```
   Copie le `whsec_…` affiché dans **`STRIPE_WEBHOOK_SECRET`** (.env), puis recharge l'API :
   ```bash
   docker compose -f docker-compose.yml -f docker-compose-dev.yml up -d server
   ```
2. `/ecole/verification` → carte **Courrier postal** → *Choisir cette méthode*.
   L'écran montre l'**adresse partielle** (n° de rue + code postal + ville) + le prix.
3. **« Payer et commander l'envoi »** → Stripe Checkout (carte test `4242 4242 4242 4242`,
   date future, CVC quelconque) → retour `?paid=1`.
4. Le webhook `checkout.session.completed` est relayé → l'API génère le **code à 6
   chiffres**, marque `code_sent`, et envoie l'**ordre d'expédition** (avec le code)
   dans **Mailpit** (http://localhost:8025).
5. Lis le code dans Mailpit, saisis-le sur `/ecole/verification` → **« Valider le code »**.

**Résultat attendu :** code correct → **`approved`** + clés PKI. Audit
`ownership_verified {method:postal}`. Code faux → `attempts++` (verrou à 5) ; expiré
(TTL 30 j) → `failed`, possibilité de recommander un envoi.

> **Sans finir un vrai Checkout** (tester juste webhook→code) : récupère le
> `verificationId` (= `school_verifications.id` en pgweb) puis
> `docker compose ... exec stripe-cli stripe trigger checkout.session.completed --add checkout_session:client_reference_id=<verificationId>`.

---

## 5. Changer de méthode / reprise

- **Reclic même méthode** (en cours) → idempotent : aucune relance, l'état est conservé.
- Bouton **« Choisir une autre méthode de vérification »** → annule la tentative
  courante (`status=cancelled`) et réaffiche le sélecteur. Aucun blocage sur un 1er choix.
- Après un échec, le panneau « La vérification a échoué » propose aussi de changer de méthode.

---

## Récapitulatif

| Méthode | Service de test fourni | Compte externe | Résultat OK |
|---|---|---|---|
| **ProConnect** | `proconnect-mock` (local) | aucun | SIRET mock == SIRET école → `approved` |
| **DNS TXT** | `dns-resolver` (CoreDNS) | aucun | TXT publié == token → `approved` |
| **Postal** | `stripe-cli` (webhooks) | Stripe test + INSEE (gratuits) | paiement → code Mailpit → `approved` |

Dans les 3 cas, le succès déclenche `approveSchool()` (génération **Ed25519 + certificat
racine**) → l'école peut enfin **émettre des diplômes** (`/ecole/diplomes/nouveau`).

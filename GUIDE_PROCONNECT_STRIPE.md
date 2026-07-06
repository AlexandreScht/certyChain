# Guide — Obtenir les clés ProConnect & Stripe

> **📍 Depuis la refonte monorepo (2026-07-07), le projet vit dans [`_refactor/`](./_refactor/).**
> Le `.env` à renseigner est **`_refactor/.env`** ; les commandes se lancent depuis `_refactor/`.

> Ce guide explique **étape par étape** comment récupérer **gratuitement** les
> identifiants nécessaires aux deux preuves de propriété de `verify.md` :
> **ProConnect** (l'État atteste l'identité + le SIRET d'un agent) et **Stripe**
> (paiement des frais d'envoi de la vérification postale).
>
> Toutes ces variables sont des **secrets** → elles restent dans `.env`
> (jamais committé), **pas** dans `docker-compose.yml`. Les variables
> *non sensibles* (issuer, scopes, redirect, base URL, prix…) sont déjà câblées
> dans les `docker-compose*.yml`, tu n'as donc **rien** à recopier pour elles.

---

## 0. Récapitulatif : ce que tu dois remplir dans `.env`

| Service | Variable `.env` | Sensible ? | Obtenu où |
|---|---|---|---|
| ProConnect | `PROCONNECT_CLIENT_ID` | non (mais propre à l'app) | Portail partenaires |
| ProConnect | `PROCONNECT_CLIENT_SECRET` | **oui** | Portail partenaires |
| Stripe | `STRIPE_SECRET_KEY` | **oui** | Dashboard Stripe |
| Stripe | `STRIPE_WEBHOOK_SECRET` | **oui** | Stripe CLI (dev) ou Dashboard (prod) |

> Les valeurs *fixes* — `PROCONNECT_ISSUER`, `PROCONNECT_SCOPES`,
> `PROCONNECT_REDIRECT_URI`, `STRIPE_API_BASE`, `POSTAL_*` — vivent désormais
> dans `docker-compose.yml` (overridables via variables shell au déploiement).

---

## 1. ProConnect (DINUM — OIDC pour agents publics)

ProConnect (ex-AgentConnect) est le **SSO de l'État** pour les agents publics.
Au retour d'authentification, il nous fournit le **SIRET** de l'établissement de
l'agent ; on auto-valide l'école quand `siret_ProConnect == siret_déclaré`
(voir `server/src/lib/proconnect.ts`).

### 1.A — Environnement d'INTÉGRATION (test) — gratuit, immédiat, self-service

C'est l'environnement à utiliser pour développer. **Aucune validation DINUM**
n'est requise, les identifiants sont délivrés sur-le-champ.

1. Va sur **https://partenaires.proconnect.gouv.fr** et crée un compte (ou
   connecte-toi).
2. Ouvre la section **« Mes applications »** → **« Créer une application »**
   (environnement **Intégration** / `integ01`).
3. Renseigne le formulaire :
   - **Nom** : `CertifyChain (dev)`
   - **Redirect URI (URL de callback)** : doit être **strictement identique** à
     celle attendue par l'API :
     ```
     http://localhost:4000/verification/proconnect/callback
     ```
   - **Scopes** : coche au minimum `openid`, `siret`, `given_name`,
     `usual_name`, `email` (ce sont ceux de `PROCONNECT_SCOPES`).
4. Valide → la plateforme te donne un **`client_id`** et un **`client_secret`**.
5. Copie-les dans ton `.env` :
   ```bash
   PROCONNECT_CLIENT_ID=ton_client_id_integration
   PROCONNECT_CLIENT_SECRET=ton_client_secret_integration
   ```
6. L'`issuer` d'intégration (`https://fca.integ01.dev-agentconnect.fr/api/v2`)
   est déjà la valeur par défaut dans `docker-compose.yml` → **rien à faire**.

> ⚠️ **La Redirect URI doit correspondre au caractère près** entre le portail et
> `PROCONNECT_REDIRECT_URI`, sinon ProConnect refuse l'échange (`redirect_uri
> mismatch`). Si tu changes le port ou le domaine, mets à jour **les deux**.

### 1.B — Tu n'as même PAS besoin de ProConnect pour développer en local

Le `docker-compose-dev.yml` embarque un **mock OIDC** (`proconnect-mock`) qui se
fait passer pour ProConnect et **réussit** la vérification, avec un SIRET
attesté configurable (`MOCK_SIRET`). Donc, pour tester le flux en local :

```bash
docker compose -f docker-compose.yml -f docker-compose-dev.yml up --build
```

Le mock fournit `client_id=mock-client` / `client_secret=mock-secret` et pointe
l'issuer vers `http://proconnect-mock:8090`. **Aucune clé réelle requise.**
N'utilise les vraies clés d'intégration (§1.A) que si tu veux tester contre le
vrai service DINUM.

### 1.C — Passage en PRODUCTION (plus tard)

- Refais la démarche sur le portail mais en environnement **Production**.
- ProConnect est **gratuit**, mais l'accès prod est **soumis à éligibilité** :
  ton service doit légitimement s'adresser à des **agents publics**. Il faut
  remplir une demande d'habilitation (rattachement à une entité, finalité…).
- En prod tu changeras, au déploiement (variables shell, pas `.env` committé) :
  ```bash
  PROCONNECT_ISSUER=<issuer_de_production_fourni_par_la_DINUM>
  PROCONNECT_REDIRECT_URI=https://ton-domaine/verification/proconnect/callback
  ```
  et tu mettras le `client_id`/`client_secret` **de production** dans le `.env`
  (ou un secret manager / Docker secret / k8s Secret).

> 💡 `CLIENT_ID` n'est pas réellement secret en OIDC (il transite dans l'URL du
> navigateur) ; seul `CLIENT_SECRET` l'est. On garde les deux dans `.env` par
> commodité (ils sont délivrés ensemble et propres au déploiement).

---

## 2. Stripe (paiement des frais d'envoi postal)

L'API crée une **Checkout Session** côté serveur et redirige l'école vers
l'URL hébergée par Stripe ; un **webhook signé** confirme le paiement avant tout
envoi (voir `server/src/lib/stripe.ts`). On n'utilise donc **que 2 secrets** :
`STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` (**aucune** clé *publishable* —
tout est server-side).

### 2.A — Clé secrète de TEST — gratuite, instantanée, sans vérif entreprise

1. Crée un compte sur **https://dashboard.stripe.com** (email + mot de passe).
   Tu n'as **pas** besoin d'activer le compte ni de fournir d'IBAN pour le
   **mode test**.
2. En haut à droite, garde le **« Mode test »** activé (toggle).
3. Va dans **Développeurs → Clés API** (`Developers → API keys`).
4. Copie la **« Clé secrète »** qui commence par **`sk_test_…`**
   (clique « Révéler »).
5. Mets-la dans ton `.env` :
   ```bash
   STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxx
   ```

### 2.B — Secret du webhook (`whsec_…`)

Le webhook est ce qui empêche un faux événement « payé » de déclencher un envoi.
Sa signature est vérifiée avec `STRIPE_WEBHOOK_SECRET`. Deux cas :

**En DÉV (recommandé) — via le Stripe CLI déjà inclus dans le compose dev :**

1. Lance la stack dev **avec le profil `postal`** (qui active le service
   `stripe-cli`) :
   ```bash
   docker compose -f docker-compose.yml -f docker-compose-dev.yml --profile postal up --build
   ```
2. Au démarrage, le conteneur `stripe-cli` imprime dans ses logs un secret du
   type :
   ```
   Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxx
   ```
   (Le CLI a besoin de `STRIPE_SECRET_KEY` dans `.env` pour s'authentifier.)
3. Copie ce `whsec_…` dans `.env`, puis **recrée** le service API :
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
   ```
   ```bash
   docker compose -f docker-compose.yml -f docker-compose-dev.yml up -d --force-recreate server
   ```

> Voir aussi `GUIDE_TEST_VERIFICATION.md` pour le scénario de test postal complet.

**En PROD — via le Dashboard :**

1. **Développeurs → Webhooks → Ajouter un endpoint**.
2. URL de l'endpoint :
   ```
   https://ton-domaine/verification/stripe/webhook
   ```
3. Sélectionne les événements de paiement (au minimum
   `checkout.session.completed`).
4. Stripe affiche le **« Signing secret »** (`whsec_…`) de cet endpoint →
   mets-le dans le `.env`/secret de prod.

### 2.C — Cartes de test

En mode test, paie avec la carte **`4242 4242 4242 4242`**, n'importe quelle
date future, n'importe quel CVC. Aucun argent réel n'est débité.

### 2.D — Passage en mode LIVE (plus tard)

Pour encaisser **réellement** : active le compte Stripe (informations légales de
l'entreprise + IBAN), bascule sur le **mode Live**, et utilise les clés
`sk_live_…` + le `whsec_…` de l'endpoint de production. Tant que tu démos /
développes, **reste en test** : c'est gratuit et illimité.

---

## 3. Dégradation propre (rien n'est cassé si une clé manque)

Le code est conçu pour **fonctionner sans ces clés** :

- `PROCONNECT_CLIENT_ID`/`SECRET` vides → l'option **ProConnect n'est pas
  proposée** à l'école (`env.proconnectConfigured === false`).
- `STRIPE_SECRET_KEY` vide → l'option **« courrier postal » n'est pas proposée**
  (`env.stripeConfigured === false`).

Tu peux donc démarrer le projet **sans aucune de ces clés** et ne les ajouter
que lorsque tu veux activer la méthode correspondante.

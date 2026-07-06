# Audit bugs utilisateurs — monorepo refondu (2026-07-07)

> **Portée** : bugs que les utilisateurs finaux (école, élève, recruteur, admin plateforme)
> pourraient rencontrer sur le monorepo refondu (`apps/` + `packages/`, RPC typé Hono).
> **Méthode** : revue manuelle ciblée du code (middlewares, modules serveur, bindings RPC
> des 3 apps, pages des parcours critiques, package `shared`) **+** vérification dynamique
> (68 tests `node:test`, smoke E2E de 44 checks contre la stack Docker réelle, rejoué après
> chaque correctif). L'audit pré-refonte (26 constats, corrigés avant/pendant la refonte)
> est archivé dans [`audit-2026-07-05-legacy.md`](./audit-2026-07-05-legacy.md).

## 1. Corrigé pendant cet audit

### 1.1 Liens d'e-mails construits hors de la config validée — corrigé ✅
4 sites produisaient des URLs (invitation claim, notification wallet, lien admin de revue,
`ShareLinkDTO.url`) à partir de `process.env.X ?? défaut` au lieu du module `env` validé
par Zod (`config/env.ts`), qui définit pourtant `WEB_ORIGIN`/`WALLET_ORIGIN`/`ADMIN_ORIGIN` :

| Fichier | Variable | Risque évité |
|---|---|---|
| `modules/wallet/wallet.service.ts` | `WEB_ORIGIN` (capturé **au chargement du module**) | Un lien de partage pointant vers la mauvaise origine si la config évolue après l'import ; source de config dupliquée |
| `modules/diplomas/diplomas.service.ts` | `WALLET_ORIGIN` | E-mails « diplôme émis / à récupérer » avec URL par défaut silencieuse |
| `modules/auth/auth.routes.ts` (claim resend) | `WALLET_ORIGIN` | Idem sur le renvoi de lien de récupération |
| `modules/schools/schools.routes.ts` | `ADMIN_ORIGIN` | Lien de revue admin erroné dans l'alerte « nouvelle école » |

Impact utilisateur : **latent** (le compose fournit ces variables), mais un déploiement
hors-compose incomplet aurait envoyé des e-mails pointant vers `localhost` **sans aucune
erreur au démarrage** — précisément ce que `env.ts` (fail-fast) existe pour empêcher.
Correctif : les 4 sites consomment `env.*`. Testé : 68/68 + smoke 44/44 rejoués.

### 1.2 Wallet — lien de partage **expiré** présenté comme « Actif » — corrigé ✅
`SharePanel` ne regardait que `revoked` : un lien dont `expiresAt` est passé restait badgé
**« Actif » avec pulsation verte**, et pouvait même être le lien **vedette** (QR code +
boutons Copier/Ouvrir). Scénario utilisateur réel : l'élève crée un lien « 7 jours », le
recolle 2 semaines plus tard depuis son wallet → le recruteur scanne un QR qui répond
« expiré » ; l'élève, lui, voyait « Actif ».
Correctifs :
- badge 3 états : `Révoqué` / `Expiré` / `Actif` (helper `isExpired`) ;
- le lien vedette (QR) = **le plus récent lien actif ET non expiré** ;
- tri unifié « plus récent d'abord » (l'API renvoie les liens du plus ancien au plus
  récent alors que les créations locales étaient préfixées en tête — après un simple
  rechargement, le QR affiché pouvait changer de lien).

## 2. Vérifié sain (pas d'action)

Parcours et mécanismes relus ligne à ligne et/ou prouvés par le smoke E2E :

- **Protocole de vérification publique** : consommation **atomique** du nonce
  (`UPDATE … WHERE used_at IS NULL … RETURNING`) → anti-rejeu réel (prouvé par le smoke :
  rejouer le même nonce → `invalid`) ; nonce inconnu/forgé → `invalid` ; token inconnu →
  `not_found` sans fuite d'énumération (un nonce est minté même pour un token inexistant) ;
  chaîne de confiance = **porte dure** (certificat école validé contre la racine PKI) ;
  révocations (lien, diplôme, école) toutes re-contrôlées à chaque vérification.
- **Auth école/admin** : MFA TOTP 2 étapes avec réalm strict (`cc_*` vs `cc_admin_*`),
  hash factice anti-énumération à mot de passe inconnu, lockout progressif par compte,
  rotation des refresh tokens, statut d'école re-vérifié au login **et** au refresh.
- **OTP élève** : hash poivré (jamais de code en clair en base), 5 essais max, cooldown
  30 s, réponse `ok:true` même pour un e-mail inconnu (anti-énumération, prouvé smoke),
  e-mails normalisés en minuscules par le contrat Zod (cohérent avec `lower()` en SQL).
- **Claim** : états `pending/claimed/expired/not_found` tous gérés côté wallet avec CTA
  adaptés (renvoi de lien sur expiré) ; e-mail masqué (`al••••@…`) ; fusion de wallets
  transactionnelle quand l'e-mail personnel existe déjà ; le guard élève laisse bien
  `/claim/*` public (sinon le lien e-mailé serait inaccessible).
- **CSRF double-submit** sur toutes les mutations cookie-authentifiées des deux réalms
  (y compris logout) ; en-têtes durcis + CORS crédentiel restreint aux 3 origines.
- **Erreurs lisibles** : le wrapper `lib/validator.ts` normalise les 400 zod-validator en
  `422 validation_error` du contrat → le client remonte le **premier message de champ**
  (ex. « SIRET = 14 chiffres ») au lieu d'un toast générique.
- **Import CSV** : erreurs par ligne (numéro + message), cap 2 000 lignes/5 Mo, ré-import
  du même fichier possible (reset de l'input), émission verrouillée tant que la propriété
  n'est pas prouvée (UI **et** API).
- **Retours de redirection** (Stripe `paid/canceled`, ProConnect `verified/error`) :
  toasts dédiés + nettoyage d'URL sur la page vérification école.
- **Fronts** : hooks de session partagés (401 = anonyme, pas d'erreur affichée), pages
  d'erreur avec « Réessayer », skeletons, `prefers-reduced-motion` respecté sur les
  animations relues.

## 3. Recommandations restantes (aucune bloquante)

| # | Priorité | Constat | Piste |
|---|---|---|---|
| R1 | 🟠 | **Résultat public en 5 états** (`verified/not_found/revoked/expired/invalid`) alors que le cahier des charges vise 2 états publics (« Vérifié »/« Introuvable ») — un échec détaillé renseigne un tiers sur la *raison* | Fusionner à la **couche présentation publique** uniquement (FailedCard), garder les 5 états en interne/audit — décision produit déjà tracée dans `architecture.md` §12.1/§12.2 |
| R2 | 🟠 | **Ré-enrôlement TOTP** : tant que la MFA n'est pas finalisée, chaque passage à l'étape 1 régénère un secret ; un utilisateur qui a scanné un QR puis abandonné avant le 1ᵉʳ code devra re-scanner (l'ancien QR devient muet, sans message) | Conserver le secret pending tant qu'il n'a pas expiré, ou message explicite « re-scannez le QR affiché » |
| R3 | 🟢 | `catch` des formulaires wallet/claim : une exception non-`ApiClientError` est avalée sans toast (chemin quasi impossible : `csrfFetch` normalise déjà les erreurs réseau) | Ajouter une branche `else` générique comme sur les pages école |
| R4 | 🟢 | Liste des liens de partage : ni pagination ni purge des liens révoqués (croissance lente de la liste) | Purge/archivage au-delà de N liens, ou pagination — hors périmètre MVP |
| R5 | 🟢 | Inscription école : la validation SIRENE+Gemini est **synchrone** dans la requête `POST /schools/register` (plusieurs secondes perçues) | Basculer en tâche différée + polling du statut le jour où le volume le justifie |
| R6 | 🟢 | `RateLimit-Remaining` exposé mais aucune UI ne l'exploite | Bandeau « réessayez dans Xs » sur 429 (le message serveur le porte déjà pour le lockout) |

> Grands chantiers **sécurité/infra** (TLS/Caddy, Docker secrets, rotation par famille des
> refresh tokens, throttle des appels sortants) : déjà priorisés dans
> [`architecture.md`](./architecture.md) §12.2 — repris dans `PLAN.md`, pas re-listés ici.

## 4. Preuves d'exécution

```
corepack pnpm --filter @certifychain/server test    → 68/68 (post-correctifs)
docker compose build                                 → 4/4 images
docker build --target builder … + pnpm test          → 68/68 (hermétique)
pnpm db:seed && pnpm smoke                           → 44 vérifications, 0 échec (rejoué post-correctifs)
```

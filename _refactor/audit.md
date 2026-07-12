# Audit bugs visuels & fonctionnels — 2026-07-10

> **Portée** : tout bug visuel ou fonctionnel qu'un utilisateur final (école, élève,
> recruteur, admin) pourrait rencontrer. Revue manuelle ligne à ligne : serveur Hono,
> `packages/contract` + `packages/shared`, les 3 apps clientes (web, wallet, admin),
> compose/Docker. Les constats **déjà connus** de l'audit du 2026-07-07 (R1–R6, voir
> `docs/audit-refonte-2026-07-07.md`) ne sont **pas** re-listés ici sauf aggravation.
>
> Statut : 🔴 bug fonctionnel · 🟡 bug mineur / cas limite · 🎨 bug visuel · ✅ corrigé (2ᵉ passe)

## Synthèse

**24 constats** (hors R1–R6 déjà connus) : 3 🔴, 15 🟡, 5 🎨, et quelques mémos 🟢.

> **État post-correction (même session, 2026-07-10)** : tous les constats 🔴/🟡/🎨 ci-dessous
> ont été **corrigés** (voir « Corrections appliquées » en fin de document), sauf S7/WA3
> (mémos par design). Vérifié : `pnpm -r typecheck` = 0 erreur ×6 workspaces ·
> `pnpm --filter @certifychain/server test` = 68/68 · `pnpm -r lint` = 0 erreur.

| Gravité | Id | Résumé |
|---|---|---|
| 🔴 | C1 | Aucun front n'appelle `/auth/refresh` → toute session meurt en 15 min (école, élève, admin) |
| 🔴 | S1 | Une école `rejected` (ex-approuvée, clés en place) reste « Vérifié » à la vérification publique |
| 🔴 | W1 | Formulaire waitlist de la landing : e-mail du prospect perdu + fausse promesse de recontact |
| 🟡 | S2 | Inscription école non transactionnelle → SIRET bloqué à jamais en cas d'échec du 2ᵉ insert |
| 🟡 | S3 | Import CSV positionnel : en-têtes ignorés, colonnes réordonnées = données signées fausses |
| 🟡 | S4+W6 | Switch de méthode annule une vérification postale **payée**, sans confirmation ni garde |
| 🟡 | S5 | Stripe `current_period_end` lu à la racine (API ≥ 2025-03-31 : champ déplacé) → échéance jamais affichée |
| 🟡 | W5 | Recherche registre promet « e-mail » mais le serveur ne cherche pas `holderEmail` |
| 🟡 | W7 | Bouton « Activer (dev) » + tutoriel dev visibles en production (échec 403 garanti) |
| 🟡 | W8 | Écran succès inscription ignore le statut retourné (`provisional` → mauvais message) |
| 🟡 | W9 | Changement d'offre via Checkout → risque de **double abonnement** Stripe |
| 🟡 | W10 | Étape TOTP login sans retour arrière / défi expiré peu guidé |
| 🟡 | WA1 | Wallet : « ZKP Groth16 » affiché alors que le moteur réel est `ed25519-nonce-v1` |
| 🟡 | A1 | Liste écoles admin : impossible de filtrer sur `provisional` |
| 🟡 | A2 | Journal d'audit admin : 9 types d'événements sans libellé ni filtre |
| 🟡 | A3 | Texte d'aide auto-validation obsolète (parle de génération de clés) |
| 🟡 | C2 | Champ requis invisible aux lecteurs d'écran (Field) |
| 🎨 | W2 | Compteurs landing figés à 0 en `prefers-reduced-motion` |
| 🎨 | W3 | Masque du quadrillage héro : classe Tailwind invalide (jamais appliquée) |
| 🎨 | W4 | Footer : 9 liens morts + « © 2025 » |
| 🎨 | W11 | Chips statut recodées à la main → contraste AA non tenu |
| 🎨 | WA2 | Login/claim wallet : contenu coupé sans scroll sur fenêtre basse |
| 🟢 | S6, S7, WA3, A4 | Mémos (incréments non atomiques, statut /me, réalm partagé, filtre audit non validé) |

## Constats

### Serveur (`apps/server`)

#### S1 🔴 Vérification publique : une école « rejected » (ex-approuvée) reste vérifiable
`modules/verify/verify.routes.ts` (étape c) n'exclut que `status === "revoked"` :

```ts
if (!schoolRow || schoolRow.status === "revoked" || !schoolRow.publicKey || …)
```

Or `rejectSchool()` (`modules/admin/admin.service.ts`) n'a **aucun garde de statut** : un
admin peut rejeter une école déjà `approved` (l'API l'autorise ; l'UI admin propose le
bouton selon le statut, mais le service ne vérifie rien). Une école ex-approuvée passée
`rejected` **garde ses clés** (`publicKey`/`certificate`/`approvedAt` non nuls) → ses
diplômes continuent de répondre **« Vérifié »** au recruteur alors que la plateforme lui a
retiré sa confiance. Incohérent avec le login/refresh qui, eux, bloquent `rejected` **et**
`revoked`.
**Correctif proposé** : dans verify, exclure tout statut ≠ `approved` (ou au minimum
ajouter `rejected`), pour aligner la porte de vérification sur la porte d'authentification.

#### S2 🟡 Inscription école non transactionnelle → SIRET définitivement bloqué
`modules/schools/schools.routes.ts` (`POST /register`) : l'insert de `schools` puis celui de
`schoolAdmins` sont **deux writes séparés** (pas de transaction). `school_admins` a un index
unique `lower(email)` : si le 2ᵉ insert échoue (course entre deux inscriptions avec le même
e-mail admin, ou toute erreur DB), il reste une **école orpheline sans aucun compte admin**,
avec le SIRET consommé par l'index unique. À la tentative suivante l'utilisateur reçoit
« Un établissement est déjà enregistré avec ce SIRET » **sans pouvoir ni se connecter ni se
réinscrire**. Correctif : envelopper les deux inserts dans `db.transaction`, et mapper la
violation d'unicité e-mail sur le 409 « Un compte existe déjà pour cet e-mail ».

#### S3 🟡 Import CSV : les en-têtes sont ignorés, mapping purement positionnel
`modules/diplomas/diplomas.routes.ts` (`parseCsv`) : la 1ʳᵉ ligne est consommée mais
**jamais comparée** à `CSV_HEADERS` — chaque colonne est mappée par position. Un CSV dont
les colonnes sont dans un autre ordre (ex. export d'un SI scolaire avec `mention` et
`externalId` inversés, deux champs texte libres) est **importé silencieusement faux** — les
diplômes signés portent alors des données erronées (irréparable sans révocation). Correctif :
valider la ligne d'en-tête (ordre exact ou remapping par nom) et rejeter avec un message clair.

#### S4 🟡 « Changer de méthode » annule une vérification postale déjà payée, sans garde-fou serveur
`modules/verification/verification.service.ts` (`switchMethod`) annule le row courant quel
que soit son état, y compris `code_sent` + `paymentStatus: "paid"` (les ~5 € de frais
d'envoi sont perdus, le courrier peut déjà être parti). Aucun avertissement côté serveur ;
si l'UI ne confirme pas explicitement ce cas, un clic suffit à perdre le paiement. (Vérifié
côté UI plus bas — voir W-x.) Correctif minimal : exiger une confirmation dédiée ou refuser
le switch d'une tentative postale payée non expirée.

#### S5 🟡 Stripe : `current_period_end` lu à la racine de la subscription
`modules/billing/billing.service.ts` (`handleSubscriptionUpdated`) lit
`sub.current_period_end`. Depuis la version d'API Stripe **2025-03-31 (Basil)**, ce champ
n'existe plus à la racine mais **par item** (`items.data[].current_period_end`). Le client
REST maison n'épingle aucune version d'API → sur un compte Stripe récent, `currentPeriodEnd`
restera `null` et la page Paramètres n'affichera jamais la date de renouvellement. Correctif :
fallback `items.data[0].current_period_end` (+ épingler `Stripe-Version`).

#### S6 🟢 OTP / codes postaux : incrément de tentatives non atomique
`auth.routes.ts` (OTP login + claim) et `verification.service.ts` (postal) font
`set({ attempts: row.attempts + 1 })` après un SELECT — deux soumissions concurrentes
peuvent compter 1 seule tentative. La limite dure (5) reste ~vraie à ±1 près ; sans enjeu
réel vu les rate-limits par compte. À corriger opportunément (`attempts = attempts + 1` SQL).

### Transverse (les 3 apps clientes)

#### C1 🔴 Aucun front n'appelle jamais `/auth/refresh` → session coupée au bout de 15 min
Le serveur implémente une rotation refresh complète (`POST /auth/refresh`,
`POST /auth/admin/refresh`, cookies `cc_rt`/`cc_admin_rt` valables 30 jours) — mais **aucun
des 3 clients ne l'appelle, nulle part** (grep `refresh` dans `apps/client` : 0 usage API).
Le cookie d'accès `cc_at` expire au bout de `ACCESS_TOKEN_TTL` = **900 s**. Conséquence
concrète : une école qui remplit le formulaire d'émission ou prépare un CSV pendant plus de
15 minutes voit **toutes ses actions échouer en 401** (« Authentification requise »), et au
prochain rechargement elle est renvoyée au login (avec re-saisie TOTP). Idem élève et admin.
Toute l'infrastructure de refresh est du code mort côté client.
**Correctif proposé** : dans `packages/shared/api/client.ts`, wrapper `unwrap`/`csrfFetch`
avec un retry-once : sur 401, `POST /auth/refresh` (ou `/auth/admin/refresh` selon le réalm)
puis rejouer la requête d'origine ; single-flight pour éviter les refreshs concurrents.

#### C2 🟡 Champ requis : `(requis)` masqué aux lecteurs d'écran
`packages/shared/ui/Field.tsx` : l'indicateur `required` est rendu dans un `<span aria-hidden>`
et le contrôle enfant ne reçoit ni `required` ni `aria-required` — un utilisateur de lecteur
d'écran ne sait pas que le champ est obligatoire. (Mineur, a11y.)

### Serveur (suite)

#### S7 🟢 `GET /auth/me` ne re-valide pas le statut école entre deux refreshs
Cohérent avec le design (le statut est re-vérifié au login et au refresh, et
`revokeSchool` tue les sessions refresh) — la fenêtre résiduelle = TTL access (15 min).
Rien à faire pour le MVP ; noté pour mémoire.

### App web — landing publique

#### W1 🔴 Formulaire « Rejoindre le pilote » : l'e-mail n'est envoyé nulle part
`components/WaitlistSection.tsx` : le submit fait uniquement `setSubmitted(true)` — aucun
appel API, aucun stockage. L'écran affiche pourtant « **Merci ! Notre équipe vous contacte
sous 24h ouvrées.** » : promesse fausse, le prospect est **perdu silencieusement** (aucune
route serveur waitlist n'existe). Correctif minimal : `mailto:` pré-rempli ou route API qui
notifie `ADMIN_NOTIFY_EMAIL` ; à défaut, retirer la promesse de recontact.

#### W2 🎨 Compteurs de la section « Problème » figés à 0 en `prefers-reduced-motion`
`components/ProblemSection.tsx` : le contenu initial des compteurs est `{prefix}0{suffix}`
(« 0 % », « ±0 sem. », « <0s ») et seule l'animation GSAP écrit la valeur finale — or le
`useGSAP` fait un **early-return quand `prefers-reduced-motion: reduce`**. Ces utilisateurs
voient des statistiques fausses (0 partout), définitivement. Correctif : en mode réduit,
écrire directement `el.textContent = prefix + end + suffix` (ou rendre la valeur finale en
SSR et n'animer qu'en mode normal).

#### W3 🎨 Masque du quadrillage héro : classe Tailwind invalide, jamais appliquée
`components/HeroSection.tsx:129` : `[mask-radial-gradient(...)]` n'est pas une propriété
arbitraire valide (il manque `mask-image:`) — Tailwind ignore la classe et le fondu radial
prévu sur `bg-dots` n'existe pas (le quadrillage couvre uniformément tout le héro).
Correctif : `[mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,black,transparent_80%)]`.

#### W4 🟡 Footer : liens morts et © 2025
`components/Footer.tsx` : 9 liens `href="#"` (Documentation, API, Blog, À propos, RGPD,
**Conditions**, **Confidentialité**, Cookies, réseaux sociaux) qui scrollent en haut de page
sans rien faire — les pages légales sont pourtant obligatoires avant mise en ligne. Le
copyright affiche « © 2025 » (nous sommes en 2026). Correctif court terme : année dynamique
+ retirer/griser les liens sans cible.

### App web — portail école

#### W5 🟡 Recherche registre : « e-mail » annoncé mais jamais cherché
`ecole/diplomes/page.tsx` (placeholder « Titulaire, programme, **e-mail**… ») vs
`GET /diplomas` qui ne filtre que `holderName`/`programTitle` — chercher l'adresse d'un
élève ne renvoie rien alors que l'UI le promet. Correctif : ajouter `holderEmail` au `or(...)`
côté serveur (ou corriger le placeholder).

#### W6 🟡 « Choisir une autre méthode » annule sans confirmation une vérification postale payée
`ecole/verification/page.tsx` : le bouton `SwitchButton` est affiché dans `CurrentPanel` y
compris à l'état postal `code_sent` **payé** — un clic (sans modal de confirmation) appelle
`switchMethod` qui **annule la tentative** : les frais Stripe sont perdus et le code du
courrier déjà expédié devient inutilisable. Couplé à S4 (aucun garde serveur). Correctif :
confirmation explicite côté UI + garde serveur (refuser/avertir sur une tentative postale
payée non expirée).

#### W7 🟡 Bouton « Activer (dev) » et encart « Activation développeur » visibles en production
`ecole/dashboard/page.tsx` (carte `pending`) et `ecole/register/page.tsx` (écran de succès) :
l'action ne marche qu'en dev (`POST /schools/me/activate` → 403 hors dev), mais l'UI
l'affiche sans condition — en prod une école `pending` voit un bouton qui échoue toujours et
un tutoriel mensonger. Correctif : gater sur `process.env.NODE_ENV !== "production"`.

#### W8 🟡 Écran de succès d'inscription : le statut retourné est ignoré
`ecole/register/page.tsx` : `registerSchool()` renvoie `{ status: "pending" | "provisional" }`
mais l'écran affiche toujours « validation KYB sous 48h ». Si l'auto-validation a déjà basculé
l'école en `provisional` (cas nominal avec SIRENE+IA configurés), le bon message serait
« vérifiez votre boîte mail / passez à la preuve de propriété ». (UX, non bloquant.)

#### W9 🟡 Abonnement : possible double souscription Starter/Pro via Checkout
`ecole/parametres/page.tsx` + `billing.service.ts` : une école déjà abonnée (ex. Starter
actif) voit toujours « Choisir cette offre » sur l'autre plan ; le clic crée une **nouvelle
subscription Stripe** en plus de l'existante (Checkout ne remplace pas l'abonnement en
cours) → double facturation. Correctif : quand `subscriptionStatus` est actif, remplacer le
CTA de l'autre plan par un renvoi vers le Billing Portal (« Changer d'offre »).

#### W10 🟡 Étape TOTP du login : pas de retour possible / défi expiré peu guidé
`ecole/login/page.tsx` : une fois à l'étape TOTP, aucun bouton « Retour » ; si le défi MFA
(5 min) expire, l'utilisateur reçoit « Défi MFA expiré, reconnectez-vous » mais reste bloqué
sur l'écran code (il doit recharger la page). Mineur. (Le re-scan du QR à chaque étape 1
est déjà tracé — R2 de l'audit précédent.)

#### W11 🎨 Chips de statut « maison » au contraste insuffisant
`ecole/dashboard/page.tsx` (« Clés PKI générées » / « Clés non générées »),
`ecole/parametres/page.tsx` (badge statut d'abonnement), `admin/settings/page.tsx`
(« Configuré ») : chips `bg-success/12 text-success` / `text-danger` recodées à la main
alors que `Badge` du kit partagé corrige précisément ce contraste (2,2:1 → AA) en
`text-emerald-700`/`text-red-700`. Correctif : utiliser `Badge` (ou reprendre les classes).

### App wallet (élève)

#### WA1 🟡 Copie technique fausse : « ZKP Groth16 » affiché dans le produit
`components/wallet/DiplomaCard.tsx` et `DiplomaDetailCard.tsx` affichent « ZKP Groth16 ·
nonce unique » et « Signature valide » en dur — or le moteur réellement en service est
`ed25519-nonce-v1` (Groth16 = phase 2, non implémentée) et la carte n'exécute aucune
vérification de signature. La page publique `/verify`, elle, affiche honnêtement
`moteur · ed25519-nonce-v1`. Un recruteur/élève attentif verra la contradiction.
Correctif : libellé neutre (« Preuve cryptographique · nonce unique ») ou afficher l'id
réel du moteur.

#### WA2 🎨 Écrans login/claim : contenu potentiellement coupé (pas de scroll)
`app/login/page.tsx` et `app/claim/[token]/page.tsx` : `main` en `h-svh overflow-hidden`
+ colonne centrée. Sur une fenêtre basse (mobile paysage ≈ 400 px de haut, petit laptop
zoomé), la carte dépasse la hauteur et le haut/bas devient **inaccessible** (aucun défilement
possible). Le portail école gère ce cas avec `AuthShell scroll` + `.no-scrollbar` ; pas le
wallet. Correctif : `min-h-svh` + `overflow-y-auto no-scrollbar` comme sur AuthShell web.

#### WA3 🟢 (mémo) Un même navigateur ne peut pas cumuler session école et session élève
Les deux apps publiques (web :3000 et wallet :3001) partagent le réalm cookie `cc_*` sur le
domaine `localhost` : se connecter comme élève écrase la session école (et inversement).
Assumé par le design des réalms (seul l'admin est isolé) — à documenter, pas à corriger.

### App admin

#### A1 🟡 Filtre « statut » de la liste écoles : `provisional` absent
`admin/schools/page.tsx` (`STATUS_OPTIONS`) ne propose pas « Vérification propriété »
(`provisional`) alors que le statut existe partout ailleurs (badge, dashboard qui affiche
« X propriété »). L'admin ne peut pas isoler les écoles bloquées à l'étape de preuve de
propriété. Correctif : ajouter l'option.

#### A2 🟡 Journal d'audit : libellés et filtres incomplets
`admin/audit/page.tsx` (`AUDIT_LABELS`/`TYPE_OPTIONS`) ne connaît pas
`school_provisional`, `verification_method_chosen`, `ownership_verified`,
`verification_failed`, `student_claim`, `subscription_started/updated/canceled` → ces
événements s'affichent en slug brut et sont **infiltrables**. Le dashboard admin
(`app/page.tsx`) a une liste plus complète mais manque aussi `student_claim` et les 3
`subscription_*`. Correctif : source unique de labels (constante partagée) couvrant tout
l'enum `audit_type`.

#### A3 🟡 Paramètres : texte d'aide obsolète sur l'auto-validation
`admin/settings/page.tsx` : « …est **approuvée automatiquement (génération des clés +
certificat)** » — faux depuis le flux verify.md : l'auto-validation ne fait que passer
l'école en `provisional` (existence confirmée, **aucune clé** tant que la propriété n'est
pas prouvée). Le toast de `schools/[id]` dit d'ailleurs l'inverse, correctement.

#### A4 🟢 Filtre audit non validé côté serveur
`ListAuditQuerySchema.type` accepte toute chaîne ≤ 40 ; `listAuditGlobal` compare à l'enum
Postgres → une valeur hors enum provoque un 500 (`invalid input value for enum audit_type`)
au lieu d'un 422. Inatteignable depuis l'UI (options fixes) ; à durcir opportunément.


## Corrections appliquées (2026-07-10, même session)

| Id | Correctif |
|---|---|
| C1 | `packages/shared/api/client.ts` : `createCsrfFetch(cookie, { refreshPath })` — sur 401 (hors routes login/OTP), refresh **single-flight** `POST /auth/refresh` (ou `/auth/admin/refresh`) puis un seul retry avec cookies frais. Branché dans les 3 apps (`lib/api/client.ts`). |
| S1 | `verify.routes.ts` : la porte émetteur exige désormais `status === "approved"` (au lieu d'exclure seulement `revoked`). |
| W1 | Nouvelle route chaînée `POST /schools/waitlist` (rate-limitée 5/10 min/IP, schéma `WaitlistSchema`) qui transfère l'e-mail à `ADMIN_NOTIFY_EMAIL` (`sendWaitlistNotification`) ; `WaitlistSection` appelle réellement l'API, état d'envoi + erreur inline. |
| S2 | `POST /schools/register` : inserts école + admin dans **une transaction** ; violation d'unicité mappée sur le bon 409 (SIRET vs e-mail) via le nom de contrainte. |
| S3 | `parseCsv` : `assertCsvHeader` — la ligne d'en-tête doit correspondre exactement (préfixe ≥ 5 colonnes requises, casse ignorée), sinon 422 avec l'ordre attendu dans le message. |
| S4+W6 | UI : modal de confirmation dédiée avant `switchMethod` quand la tentative postale est **payée** (frais perdus + code invalidé explicités). |
| S5 | `handleSubscriptionUpdated` : lit `current_period_end` à la racine **ou** sur `items.data[0]` (API Stripe ≥ 2025-03-31). |
| S6 | Incréments `attempts` en SQL (`attempts + 1`) : OTP login, OTP claim, DNS, postal. |
| W2 | `ProblemSection` : en `prefers-reduced-motion`, les compteurs reçoivent directement leur valeur finale. |
| W3 | Héro : `[mask-image:radial-gradient(...)]` (classe valide, le fondu s'applique). |
| W4 | Footer : année dynamique + liens sans cible rendus non cliquables (« Bientôt disponible ») au lieu de `href="#"`. |
| W5 | `GET /diplomas` : `holderEmail` ajouté au `or(...)` de recherche. |
| W7 | Bouton/encart « Activer (dev) » gatés sur `NODE_ENV !== "production"` ; en prod, carte « Dossier en cours de validation » à la place. |
| W8 | Écran succès inscription : bascule sur le statut renvoyé (`provisional` → parcours preuve de propriété). |
| W9 | Paramètres : avec un abonnement vivant, le CTA de l'autre plan devient « Changer via le portail » (Billing Portal) — plus de double Checkout. |
| W10 | Login école + admin : bouton « ← Revenir à la connexion » sur l'étape TOTP. |
| W11 | Chips statut (dashboard, paramètres, settings admin) passées en `-700`/`dark:-300` (AA). |
| WA1 | Wallet : « ZKP Groth16 » remplacé par « signé Ed25519 » / « Preuve cryptographique · nonce unique ». |
| WA2 | Login + claim wallet : `min-h-svh` scrollable (plus de contenu coupé sur fenêtre basse). |
| A1 | Filtre « Vérification propriété » (`provisional`) ajouté à la liste écoles admin. |
| A2 | `lib/audit-labels.ts` : source unique couvrant tout l'enum `audit_type` (dont `student_claim`, `subscription_*`) — dashboard + page Audit. |
| A3 | Texte d'aide auto-validation corrigé (passage en `provisional`, aucune clé générée). |
| A4 | `listAuditGlobal` : filtre `type` validé contre l'enum (422 au lieu d'un 500 Postgres). |
| C2 | `Field` : `aria-required` injecté sur le contrôle quand `required`. |

Non corrigés (volontairement) : S7, WA3 (mémos, comportement par design) ; R1–R6 restent
suivis dans `docs/audit-refonte-2026-07-07.md` / `PLAN.md`.

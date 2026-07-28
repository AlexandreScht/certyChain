# Inscription école — faut-il la rendre asynchrone ? (note d'architecture, R5)

> Note d'analyse, rédigée le 2026-07-28 en marge de l'audit R4 (pagination/purge des liens de
> partage). **Rien n'est implémenté ici** — même format que `docs/kms/README.md` (analyse avant
> décision), pas un ADR numéroté (`docs/architecture/decisions/`) puisqu'aucun choix n'est acté.

## 1. Le flux réel aujourd'hui (`POST /schools/register`)

Lecture de `apps/server/src/modules/schools/schools.routes.ts` :

1. Vérifications rapides (DB, index unique) : email admin déjà pris ? SIRET déjà pris ?
2. `hashPassword` (scrypt, `config/constants.ts#SCRYPT` — volontairement coûteux en CPU, ~100 ms).
3. **Une transaction courte** : insertion `schools` (statut `pending`) + `schoolAdmins`. Rapide,
   aucun appel réseau à l'intérieur.
4. Audit (`recordAudit`, DB).
5. **`computeSchoolValidation`** (`modules/schools/validation.service.ts`) — **HORS transaction**,
   donc pas de verrou DB tenu pendant cette étape, mais toujours **`await`ée avant la réponse
   HTTP** :
   - `lookupSiret` (`lib/insee.ts`) — un appel HTTP SIRENE, ~200 ms-2 s en pratique.
   - Si SIRENE confirme l'existence : `evaluateSchoolLegitimacy` et/ou `verifySchoolAgainstSirene`
     (`lib/gemini.ts`) — potentiellement **plusieurs secondes**. Le fichier documente lui-même
     (lignes 126-141) une latence de connexion à froid « HAUTEMENT VARIABLE » sur Docker
     Desktop/WSL2 : « certaines tentatives à froid arrivent en ~0,2-3 s, certaines prennent
     7-12 s, et certaines restent bloquées 30-60 s+ ». Le mécanisme de course (jusqu'à 3 tentatives
     décalées, `MAX_RACERS`/`STAGGER_MS`) réduit le risque mais le budget total reste jusqu'à
     `ATTEMPT_TIMEOUT_MS` (15 s) au pire cas après la dernière relance.
6. `db.update(schools)` avec le résultat (score, signaux SIRENE, etc.) — DB, rapide.
7. `maybeAutoValidate` (DB, rapide) puis, **déjà asynchrone** : `sendProvisionalInvite` /
   `sendSchoolReviewNotification` sont appelés en *fire-and-forget* (`void ... .catch(...)`), pas
   `await`és — un échec SMTP ne retarde ni ne fait échouer la réponse HTTP.
8. Réponse HTTP envoyée **après** l'étape 5 (et 6-7 sont rapides) — c'est donc l'appel SIRENE +
   IA qui domine le temps de réponse perçu par l'établissement qui s'inscrit.

**Correction d'une hypothèse implicite de l'énoncé de ce ticket** : la **génération de clé**
(Ed25519, puis PQ) n'a **PAS** lieu à l'inscription. Elle intervient à `approveSchool`
(`modules/schools/schools.service.ts`), une action déclenchée par un **admin plateforme**, sur un
volume totalement différent (une décision manuelle par école, jamais un burst self-service) ; la
clé PQ, elle, est provisionnée encore plus tard, paresseusement, à la première émission de diplôme
(`ensureSchoolPqMaterial`). Ni l'une ni l'autre ne pèsent sur la latence de `/schools/register`.

## 2. Ce qui borde déjà le risque

- **`RATE_LIMIT.REGISTER_IP`** (`config/constants.ts`) : 10 inscriptions / 10 min / IP — un
  garde-fou anti-abus, pas une limite de volume agrégé (des IP différentes ne sont pas bridées
  entre elles).
- **Les deux token-buckets sortants ajoutés en tâche 2 de cet audit** (`config/constants.ts#
  OUTBOUND_RATE_LIMIT`, `lib/token-bucket.ts`) : SIRENE (capacité 10, 2 jetons/s en régime établi),
  Gemini (capacité 5, 1 jeton/s). Une fois épuisés, `lookupSiret`/`evaluateSchoolLegitimacy`
  dégradent **proprement** vers `null` — retour AUTOMATIQUE au chemin « revue manuelle », **jamais**
  un échec de la requête HTTP. Concrètement : un burst d'inscriptions au-delà de ce débit ne fait
  **pas** planter ni ralentir davantage le serveur — il déplace le coût vers la **file de revue
  admin** (plus d'établissements avec `validationScore: null` à trancher à la main), un problème
  opérationnel, pas technique.
- Le pool DB n'est jamais tenu ouvert pendant les appels réseau lents (§1, étape 5 est hors
  transaction) : aucun risque d'épuisement de connexions DB causé par une latence Gemini/SIRENE.

## 3. À quel volume l'asynchrone devient-il nécessaire ?

Deux seuils distincts, de nature différente :

1. **Forme du pic, pas volume soutenu (UX)** — Node gère très bien la concurrence d'E/S (une
   requête qui attend Gemini ne bloque pas les autres), donc ce n'est pas un mur technique. Mais si
   plusieurs dizaines d'établissements s'inscrivent dans la **même poignée de minutes** (ex. un
   partenaire — rectorat, fédération d'écoles — relaie l'ouverture des inscriptions), **plusieurs**
   d'entre eux tomberont sur la latence de connexion à froid documentée en §1 : un lot de réponses à
   10-20 s+ pile au moment où la première impression compte le plus. Ce seuil peut être atteint à
   volume modeste (une **dizaine** d'inscriptions concurrentes suffit) — c'est une question de
   **synchronisation temporelle** du pic, pas de volume total mensuel.
2. **Débit soutenu dépassant les token-buckets (admin)** — en régime établi, le bucket Gemini
   plafonne à ~60 appels/min, SIRENE à ~120/min. Y arriver suppose des **dizaines d'inscriptions par
   minute, en continu** — un volume extraordinaire pour une plateforme B2B écoles françaises (le
   marché adressable total se compte en milliers d'établissements, pas en dizaines de milliers
   s'inscrivant en quelques minutes). Improbable en croissance organique ; plausible seulement lors
   d'un lancement institutionnel largement relayé.

Verdict : le seuil #1 (UX, pic ponctuel) est **plus facilement atteignable** que le seuil #2
(volume agrégé) et devrait être le déclencheur réel d'un chantier asynchrone — pas un compteur
d'inscriptions/jour.

## 4. Ce qu'il faudrait changer (si/quand ce seuil est atteint)

L'étape coûteuse est isolée (§1, étape 5) et le reste du handler la traite déjà de façon
séquentielle simple — le changement est localisé, pas une refonte :

1. Répondre **immédiatement** après l'étape 4 (transaction école+admin + audit), avec le
   statut `pending` et un score de validation `null`/« en cours ». La réponse HTTP actuelle expose
   déjà `status` — le front (`apps/client/web/.../register/page.tsx`) affiche un message de
   confirmation, pas un score en direct : ce changement de timing n'est probablement PAS un
   changement de contrat visible pour l'écran de confirmation actuel, à vérifier au moment de
   l'implémenter.
2. Basculer `computeSchoolValidation` + le `db.update` qui en dépend en **fire-and-forget**
   (`void (async () => { ... })().catch((e) => logger.error(...))`) — **exactement** le motif déjà
   utilisé deux lignes plus bas pour `sendProvisionalInvite`/`sendSchoolReviewNotification` dans ce
   même fichier. Aucun nouveau mécanisme à inventer : le précédent existe déjà dans le code voisin.
3. Notifier l'établissement une fois la validation terminée — déjà fait aujourd'hui via
   `sendProvisionalInvite` (auto-validation) ou la notification admin ; il faudrait ajouter le cas
   symétrique côté ÉCOLE quand le score est bas (aujourd'hui elle n'est notifiée qu'indirectement,
   en étant approuvée ou non par un humain qui a lui-même été notifié).
4. **Limite du fire-and-forget en mémoire** : si le process redémarre entre l'étape 1 et la fin de
   l'étape 5 (déploiement, crash), la validation en vol est perdue silencieusement — l'école reste
   `pending` sans score, ce qui dégrade proprement vers la revue manuelle (pas un état invalide),
   mais ce n'est pas un vrai job durable. Cohérent avec le reste du dépôt aujourd'hui : rate-limit,
   cleanup, transparency checkpoints sont tous « MVP mono-instance, en mémoire » (mêmes commentaires
   dans `middleware/rate-limit.ts`, `lib/cleanup.ts`, `modules/transparency/checkpoint.service.ts`).
   Un vrai job asynchrone durable (table `pending_school_validations` + worker/cron qui la
   consomme, ou une queue) ne devient nécessaire que si CertifyChain passe à plusieurs instances API
   **horizontalement scalées** — pas avant, et pas seulement pour ce chantier isolément.

## 5. Recommandation

Ne rien implémenter maintenant (conforme à la consigne de ce ticket). Si le seuil #1 (§3) est
observé en pratique — remontées utilisateur de lenteur à l'inscription, ou un lancement
institutionnel planifié à volume prévisible — le chantier décrit en §4 est petit (un handler, un
motif déjà présent deux lignes plus bas) et peut être livré en une itération courte, sans toucher à
la génération de clé (déjà découplée) ni au reste du pipeline d'approbation.

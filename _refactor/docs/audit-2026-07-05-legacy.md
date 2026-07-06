# audit.md — Audit qualité & sécurité CertifyChain (reprise de session)

> **But de ce fichier** : la session Claude Code (modèle **Fable 5**, orchestration multi-agents via `Workflow`) qui menait cet audit a **atteint sa limite mensuelle de dépense** en plein milieu de l'audit qualité (bugs/perf/visuel/responsive). Ce document rassemble **toutes les données déjà produites** (résultats complets ou partiels retrouvés dans l'historique des sessions Claude Code de ce projet) pour qu'une nouvelle session puisse reprendre exactement là où ça s'est arrêté, sans rien re-payer de ce qui a déjà été fait.

## 0. État global — à lire en premier

| Dimension | Statut | Détail |
|---|---|---|
| 🔒 **Sécurité** | ✅ **TERMINÉ** (2026-07-04) | 27 findings uniques confirmés (adversarial-vérifiés), rapport complet avec executive summary + checklist de remédiation. **Ne pas refaire** — voir §1. |
| 🐛 **Bugs backend** | ✅ **TERMINÉ** (2026-07-05) | Relancé sur **Opus 4.8** (quota Fable 5 contourné). 3 findings bruts → **2 confirmés** (1 LOW, 1 INFO) après vérif adversariale. Voir **§2.3**. |
| 🐛 **Bugs frontend** | ✅ **TERMINÉ** (2026-07-05) | Relancé sur **Opus 4.8**. **1 CRITICAL confirmé** : route `/claim/[token]` derrière le guard étudiant → onboarding claim **totalement injoignable**. Voir **§2.3**. (L'ancien audit du §3 reste une piste complémentaire.) |
| ⚡ **Perf** | ✅ **TERMINÉ** (2026-07-05) | Relancé sur **Opus 4.8** (schéma durci après un 1ᵉʳ échec "StructuredOutput retry cap"). **3 confirmés (tous LOW)** : reflow Hero, animation layout Navbar, morph border-radius des orbes. Voir **§2.3**. |
| 🎨 **Visuel** | ✅ **TERMINÉ** (2026-07-05) | Review Opus 4.8 : **5 findings contraste WCAG AA** (2 HIGH, 2 MEDIUM, 1 LOW). Vérif adversariale bloquée (limite mensuelle Opus atteinte) → **auto-vérifiés dans la boucle principale** (ratios recalculés, hex des tokens confirmés). Voir **§2.3**. |
| 📱 **Responsive** | ✅ **TERMINÉ** (2026-07-05) | Relancé sur **Opus 4.8**, test explicite 375/768/1440px. **3 confirmés (tous LOW)** : titre HowItWorks nowrap, ThemeToggle vs badge verify, ligne-titre école admin sans flex-wrap. Voir **§2.3**. |

> ✅ **MISE À JOUR 2026-07-05 — audit qualité TERMINÉ.** Le blocage ci-dessous (limite Fable 5 du 04/07) a été contourné en relançant sur **Opus 4.8**, **une dimension à la fois** (workflow mono-dimension `scratchpad/quality-audit-single.js`), avec checkpoint dans ce fichier après chaque dimension. **Résultat : 14 findings qualité confirmés** (détail complet en **§2.3**, synthèse + ordre de correction en **§2.4**). Le reste de cette section §2.1/§2.2 est conservé comme **historique** de l'échec initial.

**Cause de l'échec initial (04/07)** : les 5 agents de l'audit qualité (`bugs-backend`, `bugs-frontend`, `performance`, `visual-design`, `responsive`) ont tous échoué **immédiatement** avec l'erreur `You've hit your monthly spend limit … keep using Fable 5 or switch models`. La session s'est arrêtée juste après (429 `rate_limit`).

**Ce qui a débloqué (05/07)** : bascule modèle **Fable 5 → Opus 4.8** + relance **séquentielle** (1 dimension par workflow, append immédiat) au lieu de 5 en parallèle → aucune dimension terminée n'est perdue si la limite retombe. Un écueil de schéma rencontré en route (perf : l'agent omettait le tableau `findings` requis) a été corrigé en durcissant le script (findings-first, summary plafonné, consigne "OUTPUT DISCIPLINE" — voir note §2.3 › performance). La vérif adversariale du visuel a été bloquée par la limite Opus et **refaite à la main dans la boucle principale** (contraste = calcul déterministe).

---

## 1. 🔒 Sécurité — rapport complet (2026-07-04, COMPLET — ne pas refaire)

**Scope :** `server/` (Hono API), apps web/wallet/admin Next.js, déploiement Docker/Compose
**Méthode :** 7 dimensions en parallèle → vérification adversariale par finding → synthèse priorisée
**38 agents, 470 tool calls, ~1.83M tokens, ~18 min** — 29 findings bruts → **27 uniques après fusion des quasi-doublons**

### 1.1 Executive summary

Le protocole crypto phase-1 de CertifyChain (signature Ed25519 + nonce à usage unique consommé en DB + chaîne de certificats root-signée) est **solide et tient sous revue adversariale** — la seule faiblesse de design de protocole trouvée (la preuve "holder secret" est une tautologie côté serveur, finding #9) est aujourd'hui un contrôle mort, pas un trou exploitable, car la sécurité réelle vient déjà du bearer share-token, du nonce atomique à usage unique, et de la vérification signature/chaîne de certificats.

Le seul finding **HIGH** est réel et doit être corrigé avant le pilote : les bearer tokens (liens de vérification publics et, plus grave, le token de claim wallet étudiant à 180 jours) sont écrits en clair dans les logs stdout car le logging de requêtes capture le chemin d'URL complet. Quiconque a accès aux logs peut récupérer un claim token et prendre le contrôle du rattachement wallet d'un diplôme non réclamé. Correctif simple et peu coûteux (logger le pattern de route, pas le chemin concret).

Le cluster **MEDIUM** est dominé par des trous de cycle de vie session/autorisation (une école révoquée continue de rafraîchir ses sessions ; l'enrôlement TOTP peut être complété par n'importe qui connaissant le mot de passe avant l'utilisateur légitime) et des lacunes de durcissement infra dans `docker-compose.yml` (portail admin et API tous deux bindés sur `0.0.0.0` malgré des commentaires affirmant une exposition privée/VPN-only ; `TRUST_PROXY=true` par défaut sans proxy dans la stack, permettant l'usurpation d'IP pour contourner le rate-limit). Aucun de ces points ne donne à un attaquant non authentifié un accès direct à la prise de contrôle d'un compte arbitraire — ils érodent la défense en profondeur et l'hygiène session/autorisation, et sont peu coûteux à corriger.

Le cluster **LOW/INFO** (17 items) est surtout de la dette de durcissement déjà partiellement documentée dans PLAN.md (le rate-limiter in-memory nécessitant Redis, le `read_only` manquant sur le conteneur db). Quelques items sont des nitpicks TOCTOU/timing-oracle à impact négligeable vu les mitigations environnantes (tokens de claim 192 bits rendant le brute-force théorique).

### Verdict risque pour le lancement pilote

**GO conditionnel.** Aucun finding ne donne à un attaquant non authentifié un chemin direct et non assisté pour forger un diplôme, usurper une école, ou entrer par effraction dans un compte arbitraire depuis l'internet ouvert. Le noyau crypto est solide. Cependant, le finding HIGH (secrets dans les logs) et au moins les deux items MEDIUM auth/session les plus actionnables (sessions persistantes après révocation d'école ; fenêtre de bootstrap MFA) doivent être fermés **avant** l'onboarding de vraies écoles/étudiants, car ils minent directement les deux garanties sur lesquelles le produit est vendu : attestations vérifiées et intégrité des comptes. Les MEDIUM d'infra conteneur sont des changements de config peu coûteux et devraient aussi passer avant le premier déploiement réel.

### 1.2 Table des findings

| # | Sév | Dimension | Fichier:Ligne | Issue |
|---|-----|-----------|-----------|-------|
| 1 | **High** | rgpd-logging | `server/src/middleware/request-id.ts:16` | Bearer tokens (liens verify, claim tokens 180j) loggés en clair via le logging du chemin d'URL complet |
| 2 | Medium | auth-session | `server/src/modules/auth/auth.routes.ts:415` | École révoquée/rejetée continue de faire tourner ses sessions ; le refresh ne revérifie jamais le statut école |
| 3 | Medium | auth-session / csrf | `server/src/lib/cookies.ts:12` | Cookies (dont le domaine admin) posés avec `Domain` sur tout le sous-domaine au lieu de host-only |
| 4 | Medium | auth-session | `server/src/modules/auth/auth.routes.ts:150` | Enrôlement TOTP complétable avec le seul mot de passe — fenêtre persistante de bootstrap MFA |
| 5 | Medium | headers-cors-csrf | `next.config.ts:24` (+ équivalents wallet/admin) | CSP prod autorise `'unsafe-inline'` scripts sur les 3 apps, admin compris |
| 6 | Medium | rgpd-logging | `server/src/lib/mailer.ts:22` | Le mailer écrit le corps complet des mails (codes OTP, URLs de claim) dans les logs quand SMTP n'est pas configuré en prod |
| 7 | Medium | container-infra | `docker-compose.yml:241` | Portail admin publié sur `0.0.0.0:3002` malgré un commentaire "non exposé publiquement" |
| 8 | Medium | container-infra | `docker-compose.yml:86` | `TRUST_PROXY=true` par défaut avec l'API publiée sur `0.0.0.0:4000` sans proxy dans la stack — usurpation d'IP pour contourner le rate-limit |
| 9 | Low | crypto-protocol | `server/src/modules/verify/verify.routes.ts:148` | La "preuve" holder-secret est une tautologie côté serveur — ne contribue à rien aujourd'hui |
| 10 | Low | crypto-protocol / abuse-ratelimit | `server/src/modules/verify/verify.routes.ts:46` | `/verify/:token/challenge` insère des lignes de nonce non validées/non bornées pour des tokens arbitraires |
| 11 | Low | auth-session | `server/src/modules/auth/auth.routes.ts:337` | Compteur de tentatives OTP incrémenté non-atomiquement (TOCTOU) — ~4x plus d'essais que prévu |
| 12 | Low | auth-session | `server/src/modules/auth/auth.routes.ts:394` | Pas de détection de réutilisation de refresh-token — le rejeu d'un token volé n'est ni signalé ni révoqué en famille |
| 13 | Low | auth-session | `server/src/modules/auth/auth.routes.ts:296` | Oracle de timing sur la demande d'OTP étudiant (envoi SMTP synchrone) mine l'anti-énumération |
| 14 | Low | auth-session | `server/src/lib/tokens.ts:26` | Tokens d'accès public et admin partagent le même secret/audience JWT ; `JWT_REFRESH_SECRET` inutilisé |
| 15 | Low | headers-cors-csrf | `server/src/middleware/csrf.ts:30` | Token CSRF double-submit non lié à la session (simple check cookie==header) |
| 16 | Low | headers-cors-csrf | `server/src/modules/verification/verification.routes.ts:83` | `GET /me/proconnect/start` mutant, structurellement exempté de CSRF |
| 17 | Low | rgpd-logging | `server/src/lib/mailer.ts:39` | Adresses email destinataires (PII) loggées non-redactées à chaque envoi |
| 18 | Low | rgpd-logging | `server/src/lib/net.ts:61` | Le sel de pseudonymisation IP d'audit retombe silencieusement sur `OTP_PEPPER` |
| 19 | Low | abuse-ratelimit | `server/src/middleware/rate-limit.ts:30,32` | État de rate-limit/lockout in-memory/single-instance ; croissance non bornée de clés entre les purges GC |
| 20 | Low | container-infra | `docker-compose.yml:31` | Rootfs du conteneur `db` inscriptible malgré un commentaire affirmant le contraire |
| 21 | Low | container-infra | `docker-compose.yml:63` | Tous les secrets, y compris la clé privée racine PKI, injectés en variables d'env en clair |
| 22 | Low | container-infra | `server/Dockerfile:21` (+3 autres) | Images de base pinnées par tag mutable seulement, pas de pin par digest |
| 23 | Info | crypto-protocol | `server/src/crypto/envelope.ts:34` | Le chiffrement enveloppe AES-256-GCM n'utilise pas d'AAD — ciphertexts non liés à leur ligne |
| 24 | Info | auth-session | `server/src/modules/auth/auth.routes.ts:530` | Rate-limit du lien de claim keyé par token (sans objet : entropie 192 bits) |
| 25 | Info | headers-cors-csrf | `server/src/app.ts:56` | Protection CSRF opt-in par route plutôt que par défaut au niveau du routeur |
| 26 | Info | container-infra | `server/.dockerignore:1` | Fichier `.dockerignore` mort (le build context est la racine du repo) |

### 1.3 Détail par finding

#### #1 — HIGH : Fuite de bearer tokens dans les logs via le logging du chemin complet
**Fichier :** `server/src/middleware/request-id.ts:16`, monté sur `*` dans `server/src/app.ts:24`

**Chemin d'exploitation :** `logger.info("http.request", { path: c.req.path, ... })` logge le chemin concret, et des tokens de capacité publics vivent dans le chemin pour deux familles de routes :
- `POST /verify/:token/challenge` et `/verify/:token/proof` (`verify.routes.ts:46,70`)
- `GET/POST /auth/student/claim/:token/...` (`auth.routes.ts:528,570,617`)

La rédaction du logger basée sur le nom de clé (`logger.ts:12-33`) ne peut pas masquer un token intégré comme sous-chaîne de la valeur du champ `path`. Quiconque a accès au log-sink (logs de conteneur, agrégateur de logs, outillage ops) peut :
1. Récupérer un **claim token** (secret bearer 180 jours, `constants.ts:93`) et appeler le flux self-serve claim/OTP avec son propre email → rattacher un diplôme non réclamé à un compte contrôlé par l'attaquant (`claimAlias`, `auth.routes.ts:656-667`) → prise de contrôle complète du wallet de ce diplôme.
2. Récupérer un **verify token**, miner un nonce, et récupérer l'attestation vérifiée (nom du titulaire, programme, mention) sans autorisation.

**Fix :** Logger `c.req.routePath` (la route avec le pattern `:token`, pas le chemin résolu) au lieu de `c.req.path`, ou rédiger/hasher explicitement le segment token pour `/verify/*` et `/auth/student/claim/*` avant de logger. À plus long terme, sortir les bearer tokens des chemins d'URL vers les corps de requête POST.

---

#### #2 — MEDIUM : Une école révoquée garde une session fonctionnelle
**Fichier :** `server/src/modules/auth/auth.routes.ts:415`

Le statut école n'est vérifié qu'au login par mot de passe (ligne 144). La branche `/auth/refresh` school_admin lit `row.school.status` mais ne rejette jamais sur `rejected`/`revoked` avant de miner de nouveaux tokens. `revokeSchool` (`admin.service.ts:208-217`) se contente de basculer la colonne status et ne révoque jamais les `refreshSessions`. Effet net : un admin d'école dont l'école est révoquée continue de faire tourner une session vivante indéfiniment, gardant un accès en lecture à sa propre liste de diplômes/piste d'audit et la capacité d'appeler `POST /diplomas/:id/revoke` (vérifié uniquement sur l'ownership, pas de garde de statut, `diplomas.routes.ts:107`).

Atténuant : la vérification publique de diplôme traite indépendamment tout diplôme d'une école révoquée comme invérifiable (`verify.routes.ts:136-144`), donc ce n'est pas un moyen de saboter la vérification tierce — c'est un accès non autorisé continu aux propres données (déjà visibles) de la partie révoquée.

**Fix :** Rejeter dans la branche school_admin de `/auth/refresh` quand le statut est `rejected`/`revoked` (miroir du check login) ; révoquer toutes les `refreshSessions` des admins d'une école dans `revokeSchool`/`rejectSchool` ; ajouter au minimum une garde de statut école sur `POST /diplomas/:id/revoke`.

---

#### #3 — MEDIUM : Cookies scopés sur tout le domaine plutôt qu'host-only
**Fichier :** `server/src/lib/cookies.ts:12`

Chaque cookie (access, refresh, CSRF, MFA — realms publics `cc_*` et admin `cc_admin_*`) est posé avec `domain: env.COOKIE_DOMAIN`, qui si configuré sur un domaine apex/parent (le choix naturel vu la topologie multi-sous-domaine documentée : web/wallet/admin/API sur des sous-domaines frères) rend le cookie — `cc_admin_at` compris — lisible/envoyé à tout sous-domaine frère. Comme le CORS fait déjà confiance mutuellement à web+wallet+admin comme origines et que le cookie CSRF est délibérément lisible en JS pour le pattern double-submit, un point d'appui XSS dans *n'importe laquelle* des trois apps officielles pourrait lire le cookie CSRF et forger des requêtes admin authentifiées, défaisant complètement l'objectif d'isolation de realm documenté dans CLAUDE.md.

C'est dépendant de la config (pas prouvable depuis le repo — `COOKIE_DOMAIN` défaut à `localhost` en dev), mais rien dans le code n'empêche ou n'avertit contre une valeur apex non sûre, et aucun bénéfice n'est échangé contre le risque : `SameSite=Strict` permet déjà les requêtes same-site entre frères, donc le scoping Domain est inutile.

**Fix :** Omettre `domain` entièrement (cookies host-only scopés au hostname propre de l'API) ; adopter des noms préfixés `__Host-` pour les cookies non path-scopés ; ajouter une garde de validation d'env rejetant un `COOKIE_DOMAIN` qui ne serait pas exactement le hostname de l'API.

---

#### #4 — MEDIUM : Enrôlement TOTP complétable avec le seul mot de passe
**Fichier :** `server/src/modules/auth/auth.routes.ts:150` (school_admin), `:736-754` (admin plateforme)

Pour tout compte avec `totpEnabledAt` null (chaque admin d'école auto-enregistré, `schools.routes.ts:83-88` ; chaque admin plateforme seedé, `seed-admin.ts`), l'étape 1 du login (mot de passe seul) mine un nouveau secret TOTP et retourne le secret base32 brut + l'URI otpauth à quiconque a fourni le bon mot de passe. Un attaquant qui obtient le mot de passe (phishing, credential stuffing, DB fuitée) avant le premier login de l'utilisateur légitime peut enrôler son propre authenticator, compléter l'étape 2, et obtenir une session complète — et comme le secret est maintenant choisi par l'attaquant, le vrai propriétaire échouera ensuite contre un secret qu'il n'a jamais vu, transformant une compromission de credential ponctuelle en **verrouillage MFA persistant sous contrôle de l'attaquant**, silencieusement, sans email de notification ni alerte nulle part dans le code.

**Fix :** Verrouiller l'enrôlement derrière une seconde preuve (ex. lien de confirmation email avec token d'enrôlement à usage unique) plutôt que le mot de passe seul ; envoyer un email de notification à la complétion de l'enrôlement ; logger/alerter sur les logins de comptes privilégiés non-enrôlés, spécialement pour le realm admin plateforme.

---

#### #5 — MEDIUM : La CSP prod autorise `'unsafe-inline'` scripts sur les 3 apps
**Fichier :** `next.config.ts:24`, `wallet/next.config.ts:18`, `admin/next.config.ts:18`

Le `script-src` prod est `'self' 'unsafe-inline'` sur le web public, le wallet étudiant, et le portail admin plateforme pareillement (`'unsafe-eval'` est correctement dev-gated). Ça retire pratiquement toute mitigation XSS basée sur la CSP. Aucun point d'injection live n'existe aujourd'hui (aucun `dangerouslySetInnerHTML`/`eval`/`document.write` trouvé dans les 3 apps), donc ça amplifie l'impact d'un *futur* bug XSS plutôt que d'en être un — mais l'item backlog déjà suivi dans PLAN.md (#18, CSP nonce-based) ne référence que l'app web publique à faible privilège ; les apps wallet et admin, à plus haut privilège, portent le même affaiblissement non suivi.

**Fix :** Prioriser la CSP nonce-based déjà planifiée (`script-src 'self' 'nonce-...' 'strict-dynamic'` via middleware) et la déployer sur `admin/` et `wallet/` en premier — coût de migration le plus faible, gain de privilège le plus élevé.

---

#### #6 — MEDIUM : Le mailer répercute les OTP/URLs de claim dans les logs quand SMTP non configuré en prod
**Fichier :** `server/src/lib/mailer.ts:22`

La garde est `if (env.isDev || !env.SMTP_HOST)`. `SMTP_HOST` défaut à `""` sans exigence de prod (`env.ts:41`), et le `.env.example`/compose prod livrés le laissent non défini par défaut. Donc un déploiement prod out-of-the-box logge silencieusement chaque code OTP, URL de claim 180 jours, et code de vérification postale en clair sous le champ `body`/`text` (pas dans `REDACT_KEYS`) — contredisant directement le commentaire de code adjacent ("Never log mail bodies in production"). L'accès en lecture aux logs devient un bypass d'authentification (la fenêtre OTP de 10 minutes est amplement suffisante).

**Fix :** Changer la condition d'écho en `env.isDev` seul. Exiger `SMTP_HOST` en production (fail fast au démarrage) ou, au minimum, logger une ligne "mail dropped, SMTP unconfigured" **sans** le corps.

---

#### #7 — MEDIUM : Portail admin publié sur toutes les interfaces
**Fichier :** `docker-compose.yml:241`

Le commentaire du service admin affirme qu'il n'est "pas exposé publiquement en prod — derrière Teleport + Tailscale," mais le seul contrôle réel est `ports: ["3002:3002"]`, qui binde `0.0.0.0`. Aucun sidecar Tailscale/Teleport/reverse-proxy n'existe nulle part dans le repo, et la commande de déploiement prod documentée est littéralement `docker compose up --build` — ce qui signifie que cette exposition est le résultat par défaut de suivre les propres instructions du repo sur un hôte à IP publique.

**Fix :** Binder sur loopback (`"127.0.0.1:3002:3002"`) ou retirer le mapping `ports:` et n'atteindre le conteneur que via le sidecar VPN/proxy ; rendre l'adresse de bind surchargeable (`${ADMIN_BIND:-127.0.0.1}`). Appliquer le même fix au port 4000 s'il n'est pas censé être un point d'entrée public.

---

#### #8 — MEDIUM : `TRUST_PROXY=true` par défaut sans proxy dans la stack
**Fichier :** `docker-compose.yml:86` (+ `:124-125`)

Le compose prod hardcode `TRUST_PROXY: "true"` tout en publiant l'API sur `0.0.0.0:4000` sans aucun reverse proxy dans la stack. `clientIp()` (`lib/net.ts`) fait alors confiance à un `X-Forwarded-For` fourni arbitrairement par le client comme vrai pair, permettant à un attaquant de faire tourner de fausses valeurs XFF pour défaire les rate limits **IP-only** : vérification publique (`VERIFY_IP`), inscription (`REGISTER_IP`), l'endpoint de vérification adossé à SIRENE/Gemini (`VERIFICATION_IP` — risque d'amplification de coût contre des appels tiers payants), facturation, et le backstop anonyme global. Le brute-force login/OTP n'est *pas* affecté (ceux-là sont keyés par email/compte, pas par IP).

**Fix :** Défaut `TRUST_PROXY` à `false` et exiger un opt-in explicite une fois un vrai proxy déployé, ou binder l'API sur loopback/réseau interne pour que le seul chemin d'entrée passe par un proxy de confiance.

---

#### #9 — LOW : La "preuve" holder-secret est une tautologie côté serveur
**Fichier :** `server/src/modules/verify/verify.routes.ts:148`

Le client de vérification soumet seulement `{ nonce }` ; le serveur déchiffre lui-même le secret holder, construit la preuve, et vérifie immédiatement cette même valeur contre elle-même via `timingSafeEqual` — l'étape (b) ne peut jamais échouer. Aucune partie ne prouve jamais la possession du secret holder, donc le "holder binding" n'existe pas comme propriété du protocole, bien que les contrôles environnants (bearer token + nonce atomique à usage unique + Ed25519 + chaîne de certificats) délivrent déjà tout ce que les garanties crypto documentées promettent réellement. Pas exploitable aujourd'hui. **Risque à terme :** si le `ProofEngine` Groth16 phase-2 est câblé dans cette même forme d'appel (le serveur construit *et* vérifie sa propre preuve), le SNARK sera tout aussi vide de sens.

**Fix :** Soit rendre le holder binding réel (commitment côté client), soit supprimer l'aller-retour mort et documenter honnêtement la phase 1. Point critique : à l'implémentation de la phase 2, la preuve doit être générée côté prouveur, jamais minée côté serveur.

---

#### #10 — LOW : Inserts de nonce non validés/non bornés sur `/verify/:token/challenge`
**Fichier :** `server/src/modules/verify/verify.routes.ts:46`

Le paramètre de chemin `:token` est inséré tel quel dans `verification_nonces.share_token` (colonne `text` non bornée) sans validation de forme/longueur, pour n'importe quel token même invalide — par design, pour éviter un oracle d'énumération. Borné par `VERIFY_IP` (60/min/IP) et une cadence de nettoyage de 6h.

**Fix :** Ajouter un check de forme peu coûteux (`^[A-Za-z0-9_-]{20,64}$`) avant l'insert — retourner un nonce aléatoire sans le persister pour les tokens malformés.

---

#### #11 — LOW : TOCTOU sur le compteur de tentatives OTP
**Fichier :** `server/src/modules/auth/auth.routes.ts:337` (et vérif OTP de claim à `:651`)

`attempts = otp.attempts + 1` utilise une lecture JS obsolète à travers une frontière `await` plutôt qu'un incrément SQL atomique. N tentatives fausses concurrentes peuvent chacune lire `attempts=0` et toutes réussir.

**Fix :** `UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1 AND attempts < MAX_ATTEMPTS RETURNING attempts`, traiter une mise à jour à zéro ligne comme verrouillée.

---

#### #12 — LOW : Pas de détection de réutilisation de refresh-token
**Fichier :** `server/src/modules/auth/auth.routes.ts:394` (même pattern realm admin ~`:835`)

La rotation révoque le token présenté et en mine un nouveau, mais rejouer un token déjà tourné (révoqué) est indistinguable de garbage — aucune branche ne détecte "token connu, déjà utilisé" pour réagir en révoquant toute la famille de session.

**Fix :** Au refresh, chercher le hash de token sans le filtre `revokedAt` ; si trouvé-mais-révoqué, révoquer toutes les sessions actives pour ce sujet et logger l'événement en audit.

---

#### #13 — LOW : Oracle de timing sur la demande d'OTP mine l'anti-énumération
**Fichier :** `server/src/modules/auth/auth.routes.ts:296`

Le handler retourne toujours `{ok:true}` pour cacher l'existence du compte, mais le chemin email-non-enregistré est un seul SELECT tandis que le chemin enregistré ajoute deux requêtes de plus plus un **awaited** `sendOtpEmail` (vrai aller-retour SMTP en prod) avant de répondre.

**Fix :** `void sendOtpEmail(...).catch(log)` et répondre immédiatement, comme l'idiome fire-and-forget déjà utilisé ailleurs.

---

#### #14 — LOW : Secret/audience JWT partagé entre realms ; `JWT_REFRESH_SECRET` mort
**Fichier :** `server/src/lib/tokens.ts:26`

Les tokens d'accès public et admin partagent la même clé HS256 et audience (`"certifychain-web"`) ; la séparation de realm n'existe que via le nom de cookie + checks de rôle par route. `GET /auth/me` (`auth.routes.ts:489`) appelle un `requireAuth()` nu sans restriction de rôle, donc accepterait aussi un token realm admin.

**Fix :** Intégrer une claim de realm (ou des audiences distinctes) et la vérifier dans chaque garde ; pinner `algorithms: ["HS256"]` sur `jwtVerify`.

---

#### #15 — LOW : Token CSRF double-submit non lié à la session
**Fichier :** `server/src/middleware/csrf.ts:30`

`csrfProtect` vérifie seulement cookie==header ; le token n'est jamais stocké côté serveur ni lié à la session. `SameSite=Strict` bloque déjà le vecteur CSRF cross-site classique tout seul.

**Fix :** Lier le token à la session (stocker le hash dans les claims JWT, ou HMAC(sessionId, secret) recalculé côté serveur).

---

#### #16 — LOW : Endpoint GET mutant structurellement exempté de CSRF
**Fichier :** `server/src/modules/verification/verification.routes.ts:83`

`GET /verification/me/proconnect/start` est authentifié par cookie et mute une ligne DB à chaque appel, mais l'ensemble `SAFE_METHODS` de CSRF exempte GET inconditionnellement.

**Fix :** En faire un `POST` + `csrfProtect()`, ou séparer en un GET read-only et un POST mutant.

---

#### #17 — LOW : Emails destinataires loggés non-redactés en prod
**Fichier :** `server/src/lib/mailer.ts:39`

`mail.sent`/`mail.smtp_failed` loggent `to: mail.to` brut ; `to`/`email` ne sont pas dans `REDACT_KEYS`. Un helper `maskEmail()` existe déjà (`claim.service.ts:11`) mais n'est pas réutilisé ici.

**Fix :** Logger `maskEmail(mail.to)` ou un hash tronqué à la place de l'adresse brute.

---

#### #18 — LOW : Le sel de pseudonymisation IP d'audit retombe sur `OTP_PEPPER`
**Fichier :** `server/src/lib/net.ts:61`

`anonymizeIp()` utilise `env.AUDIT_IP_SALT ?? env.OTP_PEPPER`. Quand non défini (le défaut de `.env.example`), partager le "sel d'audit" pour une demande RGPD de corrélation légitime livre aussi le pepper de hashing OTP.

**Fix :** Exiger `AUDIT_IP_SALT` quand `NODE_ENV=production` (Zod `superRefine`), ou `logger.warn` au démarrage quand le fallback est actif en prod.

---

#### #19 — LOW : État de rate-limit/lockout in-memory (single-instance) avec croissance de clés non bornée entre purges
**Fichier :** `server/src/middleware/rate-limit.ts:30,32`

Tous les plafonds par compte/global vivent dans une `Map` process-local. Déjà suivi dans PLAN.md (#11) comme un compromis MVP single-instance accepté.

**Fix :** Adosser l'état du limiteur/lockout à Redis avant tout scale-out horizontal.

---

#### #20 — LOW : Rootfs du conteneur `db` inscriptible malgré un commentaire affirmant le contraire
**Fichier :** `docker-compose.yml:31`

Chaque service app pose `read_only: true` ; le service `db` non, malgré un commentaire impliquant le contraire, et tourne avec `cap_add: [CHOWN, DAC_OVERRIDE, FOWNER, SETGID, SETUID]`. Déjà suivi dans PLAN.md (#14) en attente d'un test d'init.

**Fix :** Ajouter `read_only: true` (tmpfs + volume nommé couvrent déjà les besoins d'écriture) ; mieux, tourner en `user: postgres` directement et retirer la liste cap_add entièrement.

---

#### #21 — LOW : Clé privée PKI racine livrée en variable d'environnement en clair
**Fichier :** `docker-compose.yml:63`

`env_file: [.env]` injecte `CERTIFYCHAIN_ROOT_PRIVATE_KEY` (l'ancre de confiance signant chaque certificat d'école), `MASTER_ENC_KEY`, et tous les autres secrets dans l'environnement du conteneur API — lisible via `docker inspect`/`/proc/<pid>/environ`.

**Fix :** Déplacer au moins la clé racine et `MASTER_ENC_KEY` vers `secrets:` Docker Compose (basé fichier, convention env `*_FILE`) ou le seam KeyVault/KMS déjà abstrait.

---

#### #22 — LOW : Images de base pinnées par tag mutable seulement
**Fichier :** `server/Dockerfile:21` (+ `Dockerfile.web`, `wallet/Dockerfile`, `admin/Dockerfile`, `postgres:16-alpine` dans compose)

Aucun pin par digest nulle part ; chaque rebuild peut silencieusement tirer un contenu upstream différent.

**Fix :** Pinner par digest (`@sha256:...`) sur les quatre Dockerfiles et l'image Postgres ; automatiser le refresh via Renovate/Dependabot.

---

#### #23 — INFO : Le chiffrement enveloppe AES-256-GCM n'utilise pas d'AAD
**Fichier :** `server/src/crypto/envelope.ts:34`

Usage GCM correct (IV frais, tag d'auth) mais pas de liaison de contexte — tout ciphertext sous la clé maître est interchangeable entre lignes. Nécessite une écriture DB arbitraire préexistante pour exploiter (compromission déjà quasi-totale).

**Fix :** Passer une chaîne de contexte (ex. `"school-key:" + schoolId`) comme AAD à l'encrypt/decrypt.

---

#### #24 — INFO : Rate-limit du lien de claim keyé par token fourni par l'attaquant
**Fichier :** `server/src/modules/auth/auth.routes.ts:530`

Techniquement vrai mais sans objet : les tokens sont des valeurs CSPRNG 192 bits, rendant le brute-force infaisable indépendamment du rate limiting. **Aucune action nécessaire.**

---

#### #25 — INFO : Protection CSRF opt-in par handler, pas par défaut au niveau du routeur
**Fichier :** `server/src/app.ts:56`

Couverture complète actuelle vérifiée sur les neuf routeurs, additions du flux claim comprises — aucun trou live aujourd'hui. Risque de maintenabilité pur pour de futurs contributeurs.

**Fix :** Inverser vers `use("*")` au niveau routeur avec exemptions publiques explicites, ou ajouter un test d'inventaire de routes.

---

#### #26 — INFO : `server/.dockerignore` mort
**Fichier :** `server/.dockerignore:1`

Le build context est la racine du repo, donc seul le `.dockerignore` racine est consulté ; `server/.dockerignore` est silencieusement ignoré mais les patterns du fichier racine couvrent déjà tout ce qu'il aurait bloqué.

**Fix :** Le supprimer ou le remplacer par un commentaire pointant vers le fichier racine.

### 1.4 Checklist de remédiation priorisée

**Avant lancement pilote (vraies écoles/étudiants onboardés) :**
- [ ] **#1** — Arrêter de logger les chemins d'URL concrets pour `/verify/*` et `/auth/student/claim/*` ; logger le pattern de route à la place (HIGH, fix peu coûteux)
- [ ] **#2** — Garder `/auth/refresh` sur le statut école (rejeter `rejected`/`revoked`) ; révoquer `refreshSessions` dans `revokeSchool`/`rejectSchool`
- [ ] **#4** — Ajouter un second facteur (token de confirmation email) à l'enrôlement TOTP, ou au minimum alerter sur les logins admin non-enrôlés
- [ ] **#6** — Corriger la garde d'écho du mailer en `env.isDev` seul ; exiger `SMTP_HOST` en production
- [ ] **#7** — Binder le portail admin sur loopback / réseau VPN-only, pas `0.0.0.0`
- [ ] **#8** — Défaut `TRUST_PROXY` à `false` ; activer seulement une fois un vrai reverse proxy dans la stack
- [ ] **#3** — Confirmer que `COOKIE_DOMAIN` est host-only (pas apex) dans le vrai `.env` prod ; ajouter une garde de validation

**À corriger bientôt après le pilote (coût faible, vraie valeur de durcissement) :**
- [ ] **#5** — CSP nonce-based pour `admin/` et `wallet/` (privilège le plus élevé, apps les plus petites)
- [ ] **#11** — Incrément atomique du compteur de tentatives OTP
- [ ] **#12** — Détection de réutilisation refresh-token + révocation de famille de session
- [ ] **#13** — Fire-and-forget l'envoi d'email de demande OTP
- [ ] **#17**, **#18** — Rédiger les emails dans les logs mailer ; imposer un `AUDIT_IP_SALT` distinct en prod
- [ ] **#21** — Déplacer la clé PKI racine / `MASTER_ENC_KEY` vers une livraison de secrets basée fichier
- [ ] **#20** — `read_only: true` sur le conteneur `db` (tester l'init d'abord)

**Backlog / défense en profondeur (pas d'urgence, risque réel déjà faible) :**
- [ ] **#9** — Retirer ou corriger le check de holder-proof tautologique avant l'intégration du SNARK phase-2 (à faire *avant* Groth16, pas avant le pilote)
- [ ] **#10** — Valider la forme du token de l'endpoint challenge
- [ ] **#14** — Séparer les audiences JWT par realm ; utiliser ou retirer `JWT_REFRESH_SECRET`
- [ ] **#15**, **#16** — Lier le token CSRF à la session ; convertir ProConnect-start en POST
- [ ] **#19** — Rate limiting adossé à Redis avant tout scale-out horizontal (déjà suivi dans PLAN.md)
- [ ] **#22** — Pin par digest de toutes les images de base
- [ ] **#23** — Ajouter AAD au chiffrement enveloppe
- [ ] **#25**, **#26** — CSP router-level par défaut ; supprimer le `.dockerignore` mort
- Aucune action nécessaire : **#24** (tokens 192 bits rendent ceci sans objet)

> ℹ️ Un audit sécurité antérieur (2026-06-23, 24 findings) existe aussi dans l'historique — ses correctifs ont déjà été appliqués et sont documentés dans `PLAN.md` §"🔒 Correctifs audit sécurité (2026-06-23)". **Le rapport ci-dessus (2026-07-04) est plus récent et fait foi** ; il couvre en plus la nouvelle feature "claim" (phase 11).

---

## 2. 🐛⚡🎨📱 Audit qualité (bugs / perf / visuel / responsive) — ÉCHOUÉ, À REFAIRE

### 2.1 Ce qui s'est passé

Un workflow `certifychain-quality-audit` a été lancé le 2026-07-04 juste après le succès de l'audit sécurité, avec 5 agents en parallèle (`bugs-backend`, `bugs-frontend`, `performance`, `visual-design`, `responsive`), chacun avec vérification adversariale prévue par finding. **Les 5 agents ont échoué immédiatement** avec :
`You've hit your monthly spend limit. Run /usage-credits to manage your limit and keep using Fable 5 or switch models to continue this chat.`

Résultat : **0 finding produit.** `confirmedCount: 0`. La session s'est terminée juste après (dernier message de la session : erreur API 429 `rate_limit`, "You've hit your monthly spend limit").

**Vérification faite a posteriori sur les transcripts bruts des 5 agents (pas seulement le résultat final du workflow) :** aucun des 5 n'a produit la moindre phrase d'analyse, hypothèse, ou liste de bugs avant de planter. Ils ont uniquement exécuté des appels d'outils d'exploration (Read/Glob/Grep/Bash), et le tour suivant — celui où ils auraient dû rédiger leurs findings — a immédiatement renvoyé l'erreur de quota. Même les blocs de "thinking" internes sont vides (réflexion étendue rédactée/chiffrée, sans contenu visible). **Il n'y a donc rigoureusement rien à récupérer comme résultat d'audit pour ces 5 dimensions.**

La seule chose factuelle récupérable est la liste exacte des fichiers déjà consultés par chaque agent au moment du crash — utile seulement pour savoir par où chacun avait commencé, pas comme point de données d'audit :

- **`review:bugs-backend`** (67 012 tokens, 10 tool calls) — avait lu, dans l'ordre : `server/src/modules/auth/claim.service.ts`, `server/src/modules/auth/auth.routes.ts`, `server/src/db/schema.ts`, `server/drizzle/0010_student_claim.sql`, `server/src/modules/diplomas/diplomas.service.ts`, `server/src/config/constants.ts`, `server/src/contract/dto.ts`, `server/src/lib/mailer.ts`, `server/src/contract/schemas.ts`, `server/src/config/env.ts`. Exactement la liste "priorité 1" du prompt — n'était pas encore arrivé à la priorité 2 (`modules/**`, `lib/**`, `db/**`, `middleware/**`).
- **`review:bugs-frontend`** (66 432 tokens, 15 tool calls) — avait globbé `wallet/src/app/claim/**` et `wallet/src/**/*.{ts,tsx}`, puis lu : `wallet/src/app/claim/[token]/page.tsx`, `wallet/src/lib/api/endpoints.ts`, `server/src/modules/auth/auth.routes.ts`, `wallet/src/lib/api/client.ts`, `wallet/src/app/login/page.tsx`, `wallet/src/hooks/useSession.ts`, `wallet/src/app/page.tsx`, `wallet/src/components/ui/Toast.tsx`, `wallet/src/app/layout.tsx`, `wallet/src/components/wallet/AppProviders.tsx`, `wallet/src/components/wallet/WalletShell.tsx`, `wallet/src/app/[id]/page.tsx`, `wallet/src/components/wallet/format.ts`. N'avait pas encore touché à `/src` (web) ni `/admin`.
- **`review:performance`** (54 616 tokens, 15 tool calls) — avait listé les dossiers d'app, grep les `"use client"` et les `<img>`, grep les patterns de polling (`setInterval|setTimeout.*fetch|refetchInterval|useSWR|poll`), puis lu : `src/components/HeroSection.tsx`, `src/app/page.tsx`, `src/components/ProblemSection.tsx`, `src/components/HowItWorksSection.tsx`, `src/components/Navbar.tsx`, `src/components/verify/VerifyScan.tsx`, `src/app/layout.tsx`, `wallet/src/app/layout.tsx`, `wallet/src/components/wallet/AppProviders.tsx`, `src/hooks/useSchoolSession.tsx`, et lançait un `find` sur `wallet/src/app/claim`, `src/app/(school)`, `admin/src` quand le crash est survenu.
- **`review:visual-design`** (35 076 tokens, 4 tool calls — le moins avancé) — avait lu `src/app/globals.css`, globbé `wallet/src/app/claim/**/*`, lu `wallet/src/app/claim/[token]/page.tsx`, et lancé un `diff` entre les 3 copies de `globals.css` (web/wallet/admin) juste avant le crash. A écrit une seule phrase de transition ("Now let me read the new uncommitted claim page and the wallet login, and compare the globals.css copies.") mais aucune observation de fond.
- **`review:responsive`** (46 337 tokens, 13 tool calls) — avait globbé les composants des 3 apps, puis grep : largeurs fixes en pixels (`w-\[\d{3,}px\]` etc.), tailles de texte énormes (`text-6xl|text-7xl|text-8xl`), grids sans fallback responsive (`grid-cols-[2-9]` sans `sm:/md:/lg:`), tables sans `overflow-x-auto`, et `overflow-hidden`/`overflow-x-hidden`, puis lu `src/components/HeroSection.tsx`, `src/components/Navbar.tsx`, `src/components/HowItWorksSection.tsx`. N'avait pas encore lu `/wallet` ni `/admin`.

Aucun de ces agents n'a atteint l'appel `StructuredOutput` final. Le seul actif réutilisable est le **script du workflow lui-même**, déjà rédigé et prêt (§2.2) — relancer le script redécouvrira ces mêmes fichiers en quelques secondes (Read/Grep/Glob sont quasi gratuits), donc cette liste ne fait gagner que peu de temps ; elle est incluse ici par exhaustivité.

### 2.2 Script de workflow prêt à relancer

Ce script est **identique** à celui qui a tourné le 04/07 (juste la coquille "审" retirée du prompt `CONTEXT`). Il peut être copié-collé directement dans un appel `Workflow` avec `script: ...`. Il attend que le repo réel soit accessible à `C:\Users\alexa\Documents\projectCoding\CertyChain`.

**Avant de relancer**, envisager de passer `model: 'claude-sonnet-5'` (ou un autre modèle non épuisé) dans les options `agent()` si la limite mensuelle Fable 5 n'est pas encore reset (`/usage-credits`).

```js
export const meta = {
  name: 'certifychain-quality-audit',
  description: 'Bugs, performance, visual design & responsive audit of CertifyChain: parallel per-dimension review → adversarial verification → ranked findings',
  phases: [
    { title: 'Review' },
    { title: 'Verify' },
  ],
}

const REPO = 'C:\\Users\\alexa\\Documents\\projectCoding\\CertyChain'

const CONTEXT = `
PROJECT: CertifyChain — B2B SaaS for issuing/verifying digital diplomas by cryptographic proof.
Monorepo layout:
- /src            → public web app (Next.js 16, React 19): landing (marketing), school portal src/app/(school)/ecole/*, public verify page src/app/verify/[token]
- /wallet/src     → student wallet app (Next.js, port 3001): /, /[id], /login (OTP), /claim/[token] (NEW, uncommitted)
- /admin/src      → platform admin app (Next.js, port 3002)
- /server/src     → Hono API (Node 22, TypeScript, Drizzle/PostgreSQL)
Styling: Tailwind CSS v4, custom design system in src/app/globals.css (classes: glass, glass-strong, neumorph, neumorph-sm, grad-text, bg-mesh, cta-primary, lift, etc.), fonts Space Grotesk/Inter/Outfit. Each app has its own copy of globals.css and ui/ components (deliberate duplication).
Animations: Framer Motion + GSAP/ScrollTrigger; prefers-reduced-motion must be respected.
There is UNCOMMITTED work in progress (student claim feature): server/src/modules/auth/claim.service.ts, additions in server/src/modules/auth/auth.routes.ts, server/src/modules/diplomas/diplomas.service.ts, wallet/src/app/claim/, server/drizzle/0010_student_claim.sql — this fresh code is the highest bug-risk area, audit it carefully.

RULES:
- Only report REAL, code-grounded issues. For each finding cite exact file (repo-relative) and line, and QUOTE the evidence.
- Do NOT report security vulnerabilities (a separate security audit covers those) — focus strictly on your dimension.
- Do NOT report style nitpicks with no user impact. No speculation without code evidence.
- Deliberate/documented choices are not findings (e.g. design-system duplication across apps, dev mailer logging to console).
`

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dimension: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
          file: { type: 'string', description: 'path relative to repo root' },
          line: { type: 'number' },
          category: { type: 'string' },
          description: { type: 'string' },
          evidence: { type: 'string', description: 'quoted code proving the issue' },
          recommendation: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['title', 'severity', 'file', 'line', 'description', 'evidence', 'recommendation', 'confidence'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['dimension', 'findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'refuted', 'partial'] },
    adjustedSeverity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
    reasoning: { type: 'string' },
    fixHint: { type: 'string', description: 'concrete minimal fix if confirmed' },
  },
  required: ['verdict', 'adjustedSeverity', 'reasoning'],
}

const DIMENSIONS = [
  {
    key: 'bugs-backend',
    prompt: `OUTPUT DISCIPLINE: your StructuredOutput call is your ONLY deliverable. Call it exactly once, at the very end, with your complete real findings — never with placeholder/test data.
Hunt for BACKEND BUGS (correctness only, not security) in ${REPO}/server/src.
Priority 1 — the fresh UNCOMMITTED claim feature: modules/auth/claim.service.ts, the new claim endpoints appended in modules/auth/auth.routes.ts, the modified modules/diplomas/diplomas.service.ts, db/schema.ts changes, drizzle/0010_student_claim.sql (does the SQL migration match schema.ts? column names/types/constraints/indexes?), lib/mailer.ts additions, config/constants.ts additions, contract/dto.ts additions.
Priority 2 — the rest: modules/**, lib/**, db/**, middleware/**.
Check: unawaited/floating promises, missing error handling on async paths, null/undefined dereference (drizzle queries returning undefined rows used without check), race conditions (check-then-act without transaction/unique-constraint backstop), wrong Drizzle operators (and/or/eq misuse, missing where clauses), transaction misuse, incorrect status codes breaking client logic, off-by-one in pagination, date/TTL arithmetic errors, enum/dto drift between contract and db schema, wrong variable reuse, dead branches that should be live.`,
  },
  {
    key: 'bugs-frontend',
    prompt: `OUTPUT DISCIPLINE: your StructuredOutput call is your ONLY deliverable. Call it exactly once, at the very end, with your complete real findings — never with placeholder/test data.
Hunt for FRONTEND BUGS (correctness only, not security) across the three Next.js apps in ${REPO}: /src (web: school portal src/app/(school)/ecole/*, verify page src/app/verify/[token], landing components), /wallet/src (especially the NEW uncommitted wallet/src/app/claim/ flow and login page changes, lib/api/endpoints.ts additions), /admin/src.
Check: React 19 / Next 16 App Router pitfalls (params/searchParams are Promises in Next 15+ — any non-awaited access?), hydration mismatches (Date.now/locale rendering in server components, window access), useEffect dependency bugs and stale closures, race conditions in OTP/login/claim flows (double submit, no abort on unmount, setState after unmount), unhandled promise rejections in API calls (missing catch → stuck loading spinners), incorrect error-state handling (error shown but loading never cleared), client/server component misuse ("use client" missing where hooks are used), broken navigation (router.push to routes that do not exist — cross-check app router file structure), api client/endpoint drift (frontend endpoints.ts calling API paths that do not exist in server routes — cross-check with server/src/modules/**/*.routes.ts and app.ts route mounting), form validation gaps causing bad requests, key-less list renders causing state bleed.`,
  },
  {
    key: 'performance',
    prompt: `Audit PERFORMANCE across the three Next.js apps in ${REPO} (/src, /wallet/src, /admin/src) and next.config.ts / wallet/next.config.ts / admin/next.config.ts.
Check: raw <img> vs next/image (unoptimized images, missing width/height → CLS), oversized client bundles ("use client" on components that could be server components — especially whole pages marked client for one small hook), heavy libs imported client-side (GSAP/Framer imported in server-renderable components, full-lib imports), unnecessary re-renders (context providers re-creating value objects each render, missing memo on hot lists, state lifted too high causing landing-wide re-renders), animation perf (animating layout properties like width/height/top instead of transform/opacity, missing will-change, scroll listeners without passive/throttle, GSAP ScrollTrigger not killed on unmount → leaks), font loading (multiple font families, display swap), polling intervals too aggressive, fetch waterfalls (sequential awaits that could be parallel, missing Suspense streaming), missing pagination on large lists, backdrop-filter overuse on large scroll surfaces (glassmorphism is expensive — flag only egregious stacking).`,
  },
  {
    key: 'visual-design',
    prompt: `Audit VISUAL DESIGN QUALITY of ${REPO} against its own design system (read src/app/globals.css first — tokens and utility classes are defined there; wallet and admin have their own copies wallet/src/app/globals.css, admin/src/app/globals.css).
Check: WCAG AA contrast violations — compute actual contrast ratios of token combinations used in code (e.g. muted/muted-soft text on ivory/surface backgrounds, white text on gradient accents, placeholder colors, disabled states; cite the hex values from globals.css and computed ratio; AA = 4.5:1 normal text, 3:1 large text/UI components); inconsistent design-system usage (raw hex/arbitrary values where a token exists, mixing rounded radii on sibling cards, glass on glass stacking that destroys readability); spacing rhythm breaks (inconsistent section paddings between adjacent landing sections, cramped forms); focus states (missing :focus-visible on interactive glass elements — keyboard users must see focus); animation quality (missing prefers-reduced-motion guards in Framer/GSAP usage — grep for useReducedMotion / matchMedia('(prefers-reduced-motion') and flag animated components that lack it; infinite animations that never pause; animation durations wildly inconsistent); dark mode (ThemeToggle exists — do all pages/tokens work in dark theme or are there hardcoded light-only colors?); icon/text alignment in buttons and badges.`,
  },
  {
    key: 'responsive',
    prompt: `Audit RESPONSIVE behavior at 375px / 768px / 1440px of the three Next.js apps in ${REPO} (/src especially the landing components src/components/*.tsx, school portal and verify page; /wallet/src pages incl. new claim flow; /admin/src pages).
Check by reading JSX + Tailwind classes: fixed pixel widths/heights without responsive variants (w-[600px] with no max-w/sm: variant → 375px overflow); grids that never collapse (grid-cols-3 without sm:/md: fallback); tables without overflow-x-auto wrappers (school diploma list, admin tables — will explode on mobile); absolute-positioned decorations that overflow viewport horizontally (check overflow-x-hidden on containers); text sizes that don't scale (text-6xl/7xl hero without sm: variant); touch targets < 44px (icon buttons p-1/p-1.5, tightly packed links — cite the computed size); horizontal scrolling marquees/chips behavior on mobile; modals/drawers usability at 375px (fixed widths, unreachable close buttons); forms at 375px (side-by-side fields without stacking); navbar behavior (is there a mobile menu? does the desktop nav overflow at 768px?); safe-area/viewport meta issues. Flag only real breakage or hard-to-use UI, with the exact classes as evidence.`,
  },
]

phase('Review')
log(`Auditing ${DIMENSIONS.length} quality dimensions (bugs backend/frontend, perf, visual, responsive) in parallel…`)

const perDimension = await pipeline(
  DIMENSIONS,
  (d) =>
    agent(`${CONTEXT}\n\nYou are a senior reviewer. ${d.prompt}\n\nBe exhaustive within your dimension. Return structured findings; if clean, return an empty findings array with a summary saying so.`, {
      label: `review:${d.key}`,
      phase: 'Review',
      schema: FINDINGS_SCHEMA,
      effort: 'high',
    }),
  (review, d) => {
    if (!review || !review.findings || review.findings.length === 0) return { dimension: d.key, verified: [] }
    return parallel(
      review.findings.map((f) => () =>
        agent(`${CONTEXT}\n\nYou are an adversarial reviewer. A prior auditor reported this ${d.key} finding:\n\n` +
          `TITLE: ${f.title}\nSEVERITY: ${f.severity}\nFILE: ${f.file}:${f.line}\nDESCRIPTION: ${f.description}\n` +
          `EVIDENCE: ${f.evidence}\nRECOMMENDATION: ${f.recommendation}\n\n` +
          `Open the cited file in ${REPO} and surrounding code. Try HARD to REFUTE it: is it real and user-impacting, ` +
          `or a false positive / already handled elsewhere / a deliberate documented choice? For visual/responsive claims, ` +
          `verify the actual CSS classes and tokens exist and behave as claimed (read the app's own globals.css). For ` +
          `contrast claims, recompute the ratio from the actual hex values. For bug claims, trace the actual call path. ` +
          `Adjust severity to what the evidence supports. If confirmed, give a concrete minimal fix hint.`, {
          label: `verify:${d.key}:${f.file}:${f.line}`,
          phase: 'Verify',
          schema: VERDICT_SCHEMA,
          effort: 'high',
        }).then((v) => ({ finding: f, verdict: v })),
      ),
    ).then((verified) => ({ dimension: d.key, verified: verified.filter(Boolean) }))
  },
)

const confirmed = []
for (const dim of perDimension.filter(Boolean)) {
  for (const item of dim.verified) {
    if (item && item.verdict && item.verdict.verdict !== 'refuted') {
      confirmed.push({
        dimension: dim.dimension,
        ...item.finding,
        severity: item.verdict.adjustedSeverity || item.finding.severity,
        verdict: item.verdict.verdict,
        fixHint: item.verdict.fixHint || '',
        reasoning: item.verdict.reasoning,
      })
    }
  }
}

const rank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
confirmed.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9))

log(`Quality audit complete: ${confirmed.length} confirmed findings after adversarial verification.`)

return { confirmedCount: confirmed.length, confirmed }
```

**Important pour la relance :** avant de lancer, mettre à jour le paragraphe `CONTEXT` — la feature "claim" mentionnée comme "UNCOMMITTED" a peut-être été committée entre-temps (vérifier `git log` / `git status` dans `server/src/modules/auth/claim.service.ts`). Si elle est maintenant committée, retirer la mention "uncommitted" pour ne pas biaiser les agents.

---

## 2.3 🔁 Reprise séquentielle de l'audit qualité (2026-07-05, en cours — Opus 4.8)

> **Méthode de reprise :** au lieu de relancer les 5 dimensions en parallèle (ce qui replantait sur la limite mensuelle), chaque dimension est relancée **une par une** via un workflow mono-dimension (`scratchpad/quality-audit-single.js`, `args` = clé de dimension). Dès qu'une dimension finit, ses findings confirmés sont écrits ici, **puis** la suivante démarre — de sorte qu'aucune dimension terminée n'est perdue si la limite retombe. Modèle : **Opus 4.8** (les agents héritent du modèle de la boucle principale ; la limite Fable 5 ne s'applique plus). Chaque dimension : 1 agent de review (`effort: high`) → 1 agent de vérification adversariale par finding → on ne garde que `verdict != refuted`.

### 🐛 bugs-backend — ✅ TERMINÉ (run `wf_de063400-867`, 4 agents, ~229k tokens, ~7 min)

**3 findings bruts → 2 confirmés** (1 refuté). La migration SQL `0010_student_claim.sql` correspond fidèlement à `schema.ts`, et la transaction `claimAlias` (merge/activation) est correcte et race-safe (re-check `verifiedAt`, ordre des updates FK correct, pas de collision d'unicité d'alias possible au merge). Le refuté (voir plus bas) était le seul candidat "medium".

| # | Sév | Fichier:Ligne | Issue |
|---|-----|---------------|-------|
| B1 | **Low** | `server/src/modules/diplomas/diplomas.service.ts:95` | Émission de diplôme non transactionnelle : émission concurrente sur une même paire (école, email) neuve → 500 non géré + ligne `students` orpheline |
| B2 | Info | `server/src/modules/admin/admin.service.ts:63` | Le compteur "Élèves" du dashboard admin inclut les étudiants provisoires non réclamés (dérive de libellé KPI, pré-existante à la feature claim) |

#### B1 — LOW : Émission non-atomique (check-then-act) → 500 + étudiant orphelin
**Fichier :** `server/src/modules/diplomas/diplomas.service.ts:95` (issueDiploma, lignes 43-170)

`issueDiploma` n'est **pas** enveloppé dans une transaction. Pour une paire (école, `holderEmail`) neuve, il enchaîne 4 statements auto-commit : (1) SELECT alias existant (79-88), (2) INSERT `students` (95-98), (3) INSERT `student_email_aliases` (102-111), (4) INSERT `diploma` (116-134). Classique check-then-act : deux émissions concurrentes pour la même paire neuve ne trouvent aucun alias, insèrent chacune un `students`, et le 2ᵉ INSERT alias viole l'index unique `student_email_aliases_school_email_idx` (`schoolId, lower(email)`, `schema.ts:261-264`). L'index **empêche la corruption de données**, mais la violation n'est **pas catchée** :
- Route single-issue (`diplomas.routes.ts:44`) : pas de try/catch → **500 brut** renvoyé à l'admin école.
- Route CSV (`routes.ts:178-185`) : catchée et ligne **skippée**.

Dans les deux cas, la ligne `students` déjà committée (95-98) n'est **pas** rollback → **orpheline** (sans alias ni diplôme). Même orphelinage si l'INSERT diploma échoue après le commit de l'alias. **Corollaire vérifié :** si l'échec survient à l'INSERT diploma après commit de l'alias, une reprise passe dans la branche `existingAlias` avec `verifiedAt` null et `freshAlias` undefined → l'email d'invitation claim (162-167) est **skippé** et le titulaire ne reçoit jamais son lien.

**Déclencheur réaliste :** double-clic / double-submit de l'admin sur le même `holderEmail` neuf, ou tout échec après commit de l'alias. Impact bénin (un 500 ou une ligne CSV skippée + une ligne orpheline), d'où **Low**.

**Fix :** envelopper find-or-create-student + create-alias + insert-diploma dans un seul `db.transaction(async (tx) => { … })` (rollback complet en cas d'échec). Y catcher la violation d'unicité alias (Postgres `23505` sur `student_email_aliases_school_email_idx`) et re-SELECT l'alias désormais existant pour résoudre `studentId` au lieu de laisser throw → première émission concurrente idempotente. Ajouter aussi un try/catch sur la route single-issue (`diplomas.routes.ts:44`) pour renvoyer une erreur propre plutôt qu'un 500 brut.

#### B2 — INFO : Le compteur "Élèves" inclut les étudiants provisoires
**Fichier :** `server/src/modules/admin/admin.service.ts:63`

`db.select({ value: count() }).from(students)` compte **toutes** les lignes `students` sans filtre (exposé `students` ligne 90, libellé "Élèves" dans `admin/src/app/page.tsx:84`). Depuis la feature claim, `issueDiploma` crée une ligne `students` provisoire (`email: null`) par (école, email) neuf, à l'émission. **Mais** (vérif adversariale) : le code **pré-feature** insérait déjà `email: input.holderEmail` à l'émission — le compteur incluait **déjà** tout destinataire n'ayant jamais ouvert le wallet. La métrique n'a **jamais** signifié "utilisateurs wallet actifs" ; c'est une ambiguïté de libellé KPI **pré-existante**, pas une régression de la feature claim. Le seul effet réellement nouveau est mineur et auto-corrigé : une personne avec des diplômes de 2 écoles a transitoirement 2 lignes provisoires jusqu'au merge au claim (`claim.service.ts:47-59`). **Downgradé de Low → Info.**

**Fix (décision produit, pas un bug) :** si "Élèves" veut dire "titulaires de diplôme" (sens historique), relabéliser en "Titulaires". Si on veut de vrais "utilisateurs wallet actifs", compter explicitement les réclamés (`count(case when email is not null …)`) **en tant que KPI distinct** — ne pas appliquer silencieusement `WHERE email IS NOT NULL` à la tuile existante (chute brutale trompeuse).

#### ❌ Refuté (non retenu) — "Diplôme définitivement inaccessible après expiration du claim token"
**Fichier cité :** `server/src/modules/diplomas/diplomas.service.ts:151` (severity annoncée : medium)

Le finding prétendait qu'un titulaire se retrouve "sans aucun moyen d'accéder au diplôme". **Réfuté par le code :** à l'expiration, la valeur `claimToken` de l'alias n'est **jamais** modifiée/nullée (l'émission ne fait que placer `claimTokenExpiresAt` dans le passé ; `claimAlias` laisse le token en place, `claim.service.ts:71-78`), donc `loadClaimableAlias(token)` continue de le résoudre. Pas de stranding permanent. **Non retenu comme finding.**

### 🐛 bugs-frontend — ✅ TERMINÉ (run `wf_77872f98-b77`, 2 agents, ~168k tokens, ~5 min)

**1 finding brut → 1 confirmé (CRITICAL).** Recoupements faits par l'agent, tous **OK** (donc pas de findings) : `wallet/src/lib/api/endpoints.ts` s'aligne sur les routes serveur (claim/auth/wallet/verify) ; params Promise Next 15 correctement `await`és (server components) / `use()`és (client) ; pas de mismatch d'hydratation (rendu date/locale uniquement client après fetch) ; `useToast` mémoïsé (pas de boucle d'effet) ; gardes double-submit présentes sur OTP/login/claim.

| # | Sév | Fichier:Ligne | Issue |
|---|-----|---------------|-------|
| F1 | **Critical** | `wallet/src/components/wallet/AppProviders.tsx:11` | La route `/claim/[token]` n'est pas dans `PUBLIC_ROUTES` → le guard étudiant redirige tout claimeur non-authentifié vers `/login` : la feature claim est **injoignable** pour son cas d'usage primaire |

#### F1 — CRITICAL : La route claim est derrière le guard d'auth étudiant → onboarding injoignable
**Fichier :** `wallet/src/components/wallet/AppProviders.tsx:11` (et `:30`, `:33` ; guard dans `useSession.ts:73-78`)

`AppProviders` (monté sur **toutes** les routes via `wallet/src/app/layout.tsx:52`) est la porte globale du wallet : tout `pathname` absent de `PUBLIC_ROUTES` est enveloppé dans `GuardedApp`, qui appelle `useRequireRole("student", "/login")` et `router.replace("/login")` dès que la session est null (après `loading`). Or `PUBLIC_ROUTES` ne contient **que** `"/login"` — la nouvelle route `/claim/[token]` n'y est **pas**. Mais tout le but du flux claim est d'onboarder un étudiant **neuf, sans session** (il prouve un email perso via OTP pour **créer** la session — `claim/[token]/page.tsx:117-119`, `router.push("/")` seulement *après* succès). Donc un visiteur non-authentifié ouvrant le lien email `WALLET_ORIGIN/claim/<token>` (généré dans `diplomas.service.ts` + resend `auth.routes.ts`) tombe dans `GuardedApp`, la session est null → `router.replace("/login")` **avant que `ClaimPage` ne monte**. **La feature est 100 % injoignable pour son cas primaire.** Aucun `wallet/middleware.ts` alternatif n'existe (vérifié via glob). Défaut secondaire : même un étudiant déjà connecté verrait `ClaimPage` imbriqué dans le chrome `WalletShell` au lieu d'un rendu nu comme `/login`.

**Fix :** traiter `/claim/*` comme public. Dans `AppProviders.tsx`, remplacer `const isPublic = PUBLIC_ROUTES.has(pathname);` par p.ex. `const isPublic = pathname === "/login" || pathname.startsWith("/claim");`. Rend la page claim nue (comme `/login`), sans guard ni chrome `WalletShell`, pour que le claimeur non-authentifié puisse compléter l'OTP et créer sa session.

> ⚠️ **Priorité de correction : CRITICAL — feature récemment ajoutée et cassée à 100 %.** Recoupe le finding sécurité #1 (le lien claim, une fois joignable, fuite via les logs) — les deux touchent le même flux claim.

### ⚡ performance — ✅ TERMINÉ (run `wf_80730ef7-0aa`, 4 agents, ~170k tokens, ~5 min)

> ⚙️ **Note de méthode :** la 1ʳᵉ tentative (`wf_fc37f88c-baa`) a échoué sur `StructuredOutput retry cap (5) exceeded` — l'agent avait tout mis dans un `summary` prose géant et **omis le tableau `findings` requis** (les prompts `bugs-*` avaient une consigne "OUTPUT DISCIPLINE" que `performance/visual/responsive` n'avaient pas). Corrigé dans `quality-audit-single.js` : (1) `findings` placé **en 1ᵉʳ** dans le schéma, (2) `summary` plafonné à 600 car., (3) consigne "OUTPUT DISCIPLINE" ajoutée au wrapper de review commun. Relance OK. **Les dimensions restantes bénéficient du même durcissement.**

**3 findings bruts → 3 confirmés (tous LOW).** Verdict général : les 3 apps sont globalement bien optimisées (auto-cleanup `useGSAP`, contextes mémoïsés, pagination, `next/font` swap, pas de `<img>` brut, fetches parallèles). Les seuls problèmes sont des **reflows forcés et animations de propriétés de layout** dans les composants animés de la landing.

| # | Sév | Fichier:Ligne | Issue |
|---|-----|---------------|-------|
| P1 | Low (partial) | `src/components/HeroSection.tsx:35` | Le handler `mousemove` du Hero lit des `getBoundingClientRect()` non cachés + écritures de style hors du rAF existant |
| P2 | **Low** | `src/components/Navbar.tsx:61` | La Navbar anime `width`/`maxWidth`/`borderRadius` (propriétés de layout) au scroll via spring Framer → reflow par frame |
| P3 | **Low** | `src/app/globals.css:306` | `orb-morph` anime `border-radius` en boucle infinie 14s sur de gros orbes floutés (blur 40-48px) sans `will-change`/`contain` |

#### P1 — LOW (partial) : Lectures de layout non cachées dans le `mousemove` du Hero
**Fichier :** `src/components/HeroSection.tsx:35` (+ `:53`)

Le listener `mousemove` lit `root.getBoundingClientRect()` (l.35) et `paraRef.current.getBoundingClientRect()` (l.53) **synchrones à chaque event**, et seule l'écriture du transform de la carte est batchée dans un `requestAnimationFrame` (l.44-48). **Nuance de la vérif adversariale (→ partial) :** le mécanisme "deux reflows forcés par event / thrashing continu" est **surévalué** — `getBoundingClientRect` ne force un reflow que si le layout est *dirty*, or toutes les écritures de ce handler sont non-layout (transform compositor-only l.46/50 ; `--mx/--my` pilotent un `maskImage` radial = paint, l.169-170, pas layout). En hover stationnaire les rects servent une géométrie cachée. **Vrai résidu :** rects non cachés + écritures glow/para hors du rAF existant — point d'efficacité mineur, pas du thrashing medium.

**Fix :** cacher les rects `root`/`para` dans des refs, rafraîchies seulement au `scroll`/`resize` passif ; déplacer les écritures glow (l.50) et `--mx/--my` (l.54-55) dans le rAF qui écrit déjà le transform de la carte → le `mousemove` ne stocke que `clientX/clientY` bruts, zéro lecture layout synchrone.

#### P2 — LOW : La Navbar anime des propriétés de layout au scroll
**Fichier :** `src/components/Navbar.tsx:61` (target `animate`, l.61-67 ; spring l.42-47/68)

Le `motion.nav` transitionne `width` (`85vw`/`100%`) et `maxWidth` (`72rem`/`100%`) via spring quand le seuil de scroll est franchi. `width`/`maxWidth` sont **layout-triggering** : Framer les anime sur le main thread en écrivant le style inline à chaque frame → le navigateur **reflow le sous-arbre nav** (logo/liens/boutons) à chaque frame du spring ~0.5s (contrairement au `y` transform, compositor-only). **Retrigger confirmé :** `scrolled = window.scrollY > 20` (l.34) → du jitter autour de 20px peut flipper le booléen en boucle, chaque flip relançant un spring. Aucune garde `prefers-reduced-motion` (`initial={false}` ne supprime que l'anim de width au 1ᵉʳ paint). Low car sous-arbre petit + toggle ~1×/franchissement.

**Fix :** garder la nav dans un conteneur `max-width` fixe et piloter le rétrécissement par **transform** (`scaleX`/`translateY`) au lieu d'animer `width`/`maxWidth` ; ou basculer une classe CSS + transition `max-width`. Optionnel : gater derrière `prefers-reduced-motion`.

#### P3 — LOW : `orb-morph` anime `border-radius` en boucle sur de gros orbes floutés
**Fichier :** `src/app/globals.css:306` (keyframes) / `:310` (`.animate-morph`)

`@keyframes orb-morph` anime `border-radius` en boucle infinie 14s, sans `will-change`/`contain`, appliqué à de **gros orbes (360-460px) fortement floutés** (`blur 40-48px`) : `HeroSection.tsx:83` (420px/40px) & `:92` (460px/48px), `VerifyExperience.tsx:78,87`, `claim/[token]/page.tsx:134,143`. Animer `border-radius` change la région de clip chaque frame → **re-rasterisation d'une grande surface floutée** (paint-heavy), 2 orbes simultanés par viewport. **Nuances vérif :** (1) `HeroSection.tsx:101` porte `animate-float-slow`, **pas** `animate-morph` → 2 orbes morphant dans le hero, pas 3 (légère surévaluation) ; (2) `prefers-reduced-motion` est géré globalement (`globals.css:52-58` force `animation-iteration-count:1`) → épargne les utilisateurs reduced-motion ; le coût ne touche que les utilisateurs motion par défaut (la majorité).

**Fix :** ajouter `will-change: border-radius; contain: paint;` à `.animate-morph` (`globals.css:310`) pour promouvoir chaque orbe sur sa propre couche et confiner le repaint ; **mieux** : réimplémenter le morph via `transform` (scale/rotate d'une forme à rayon fixe) → composite GPU sans repaint par frame.

### 🎨 visual-design — ✅ TERMINÉ (run `wf_98b1c93f-59d`, review OK ; vérif auto en boucle principale)

> ⚠️ **Méthode particulière (limite mensuelle Opus atteinte) :** l'agent de **review** a produit ses 5 findings avec succès, **mais les 5 agents de vérification adversariale ont tous échoué** sur `You've hit your monthly spend limit` (la limite mensuelle frappe maintenant aussi Opus 4.8 sur les sous-agents). Les findings ont donc été **récupérés depuis `journal.jsonl`** puis **vérifiés directement dans la boucle principale** (Opus 4.8, non bloquée) : hex des tokens relus dans `globals.css` (l.11-34) et usages relus dans `Badge.tsx` — puis **ratios de contraste recalculés à la main** (formule WCAG relative-luminance). Recoupements exacts : cyan **2.17:1**, magenta **3.00:1**, muted-soft **3.06:1** (light). Ces 5 findings sont donc **confirmés** (méthodologie déterministe), pas juste "review".

**Verdict général :** design system discipliné sur l'animation (tout GSAP/Framer garde `prefers-reduced-motion`), le rythme d'espacement des sections, et les anneaux `focus-visible`. Les vrais problèmes sont des **échecs de contraste WCAG AA gravés dans les tokens de couleur** : les badges tint-sur-tint (cyan/magenta/success/danger) et le token de texte `muted-soft` passent bien sous 4.5:1 en thème clair (certains aussi en sombre). Tous en `text-xs` (12px) = texte normal → seuil AA **4.5:1** applicable. **Recoupe l'ancien audit §3** (Badge contraste, muted-soft) → forte corroboration.

| # | Sév | Fichier:Ligne | Ratio mesuré | Issue |
|---|-----|---------------|--------------|-------|
| V1 | **High** | `src/components/ui/Badge.tsx:23` | **2.17:1** | Chip `cyan` : `text-cyan-500` (#06B6D4) sur `bg-cyan-100` (#CFFAFE). Réutilisé comme chip de contenu + tuile d'icône (`FeaturesGrid.tsx:214`, `HowItWorksSection.tsx:167`, `SharePanel.tsx:202`). Light-only (cyan-100 remappé en sombre). |
| V4 | **High** | `src/app/globals.css:16` | **3.06:1** light / **3.80:1** dark | Token `muted-soft` (#8891A3 clair / #6C7389 sombre) utilisé pour du **vrai contenu informatif** à 10-12px : labels de champs (`DiplomaCard`, `DiplomaDetailCard`), en-têtes de table (`ui/Table.tsx:75`), hints `Stat`, footers (`claim`, `login`). Échoue dans **les deux thèmes**. |
| V2 | Medium | `src/components/ui/Badge.tsx:24` | **3.00:1** | Chip `magenta` : `text-magenta-500` (#EC4899) sur `bg-magenta-100` (#FCE7F3). OK pour grand texte, **KO** pour les labels `text-xs` où il est utilisé (`FeaturesGrid.tsx:268`, `HowItWorksSection.tsx:174`). Light-only. |
| V3 | Medium | `src/components/ui/Badge.tsx:20` | **~2.2:1** (success) / **~3.2:1** (danger) | Badges `success`/`danger` : accent en texte sur un lavis 12 % de la même teinte sur blanc. Utilisés comme badges de statut **live** (`SharePanel.tsx:101` danger, `:105` success). Light-only. |
| V5 | Low | `src/components/ui/Input.tsx:14` | **~2.78:1** | `placeholder:text-muted-soft` (#8891A3) sur la surface `neumorph-inset` (#EEF1FA). Placeholders porteurs de format (OTP `123456`, email) durs à lire. |

#### V1 — HIGH : Chip `cyan` texte 2.17:1 (échoue AA)
**Fichier :** `src/components/ui/Badge.tsx:23` — `cyan: { chip: "bg-cyan-100 text-cyan-500" }`. `#06B6D4` sur `#CFFAFE` = **2.17:1** (recalculé, exact), loin des 4.5:1 (et sous le plancher 3:1 grand texte/UI). Passe seulement en sombre (cyan-100 → #0C2A34). **Fix :** pour texte/icône, cyan plus foncé (cyan-700 ~#0E7490 sur cyan-100 ≈ 4.5:1), ou inverser en texte blanc sur fond cyan-500 plein. Garder le pâle-sur-pâle uniquement pour la déco non informative.

#### V4 — HIGH : Token `muted-soft` sous AA dans les DEUX thèmes
**Fichier :** `src/app/globals.css:16` — `--color-muted-soft: #8891A3` (light, **3.06:1** sur #FAFBFF) / `#6C7389` (dark, **3.80:1** sur surface #11152F). Utilisé **partout** pour du contenu réel à 10-12px (labels majuscules, en-têtes de table, hints, footers) → la petite taille aggrave le déficit. **Fix :** foncer `muted-soft` jusqu'à 4.5:1 (light ~#6B7284 ou plus foncé ; dark ~#8A91A8 ou plus clair) pour les usages texte, **ou** réserver `muted-soft` au décoratif/grand et utiliser `muted` (#5B6474, ~5.8:1 — vérifié) pour les petits labels.

#### V2 — MEDIUM : Chip `magenta` 3.00:1 (KO texte petit)
**Fichier :** `src/components/ui/Badge.tsx:24`. `#EC4899` sur `#FCE7F3` = **3.00:1** (recalculé, exact) — OK grand texte / composant UI, mais < 4.5:1 pour les labels `text-xs` réellement utilisés. Light-only. **Fix :** foncer le texte (magenta-600/700) pour les chips petit texte, ou réserver ce couple aux grands textes (≥18.66px bold).

#### V3 — MEDIUM : Badges `success`/`danger` soft-tint échouent AA (light)
**Fichier :** `src/components/ui/Badge.tsx:20-21`. `success` (#10B981 sur ~#E2F6F0) ≈ **2.2:1**, `danger` (#EF4444 sur ~#FDE8E8) ≈ **3.2:1** — sous 4.5:1 pour le petit texte des badges. Utilisés comme badges de statut **live** (état de lien de partage). Sombre OK (tint sur surface foncée). **Fix :** monter l'opacité du lavis et/ou foncer le texte (`text-emerald-700`/`text-red-700` sur le fond /12) pour passer 4.5:1 en clair.

#### V5 — LOW : Placeholder d'input ~2.78:1
**Fichier :** `src/components/ui/Input.tsx:14` — `placeholder:text-muted-soft`. #8891A3 sur la surface `neumorph-inset` #EEF1FA = **~2.78:1**. Placeholders porteurs de format (OTP `123456` `claim/[token]/page.tsx:302`, hint email) durs à lire. **Fix :** token de placeholder plus foncé (`muted`) pour ~3:1+, et garder le hint de format dans le `hint` du `Field` (déjà fait sur le form claim) plutôt que dans le seul placeholder.

> 📌 **Note d'application des correctifs contraste :** ces 5 findings partagent une **racine commune = les tokens** (`Badge.tsx` tones + `--color-muted-soft`). Corriger `Badge.tsx` (5 tones) + foncer/segmenter `muted-soft` dans les **3 copies** de `globals.css` (web/wallet/admin) règle la quasi-totalité des occurrences d'un coup. Pattern de référence déjà correct dans le repo : le pastel-chip `bg-*/12 text-*` foncé de `Toast.tsx`.

### 📱 responsive — ✅ TERMINÉ (run `wf_e123400d-30e`, 5 agents, ~266k tokens, ~7 min)

**3 findings bruts → 3 confirmés (tous LOW).** La limite mensuelle s'était **desserrée** → les 5 agents (review + 3 vérif + 1) ont tous réussi, avec vérification géométrique explicite à 375/768/1440px. **Verdict général :** les 3 apps sont globalement responsive (le `Table` partagé s'enveloppe en `overflow-x-auto`, les deux portails ont un drawer mobile, hero/pricing/features utilisent `clamp` fluide + grids qui collapsent). Quelques cassures réelles mais mineures aux viewports étroits.

| # | Sév | Fichier:Ligne | Issue |
|---|-----|---------------|-------|
| R1 | Low (partial) | `src/components/HowItWorksSection.tsx:340` | Titre d'étape en `whitespace-nowrap` non gaté : "Recruteur / Vérificateur" frôle/déborde le padding de la carte pleine largeur sur les téléphones les plus étroits (~320-360px) |
| R2 | **Low** | `src/components/verify/VerifyExperience.tsx:29` | Le `ThemeToggle` `fixed top-4 right-4 z-50` recouvre le coin du badge "Vérification sécurisée" de l'en-tête sur tout viewport < ~1088px |
| R3 | **Low** | `admin/src/app/schools/[id]/page.tsx:180` | Ligne-titre école (nom + jusqu'à 3 badges statut/SIRENE/auto-validée) en `flex` sans `flex-wrap` → débordement horizontal possible à 375px si nom long + plusieurs badges |

#### R1 — LOW (partial) : Titre d'étape `whitespace-nowrap` à viewport étroit
**Fichier :** `src/components/HowItWorksSection.tsx:340`

Le `<h3 className="… whitespace-nowrap">` (non gaté `lg:`) rend le plus long titre "Recruteur / Vérificateur" dans une carte **empilée pleine largeur** sur mobile (`flex flex-col lg:flex-row` l.308 ; carte `p-7 … flex-1 min-w-0`), le titre en `flex-1` après une icône `w-12` + `gap-3`. **Nuances vérif (→ partial) :** à **exactement 375px** la colonne texte fait ~211px et le titre en Space Grotesk Bold 18px ~200-210px → ça **tient de justesse** au bord ; ça ne déborde clairement qu'à ~320-360px. Aussi, "clippé par `overflow-hidden` de la section" est **inexact** : le débordement consomme d'abord les 28px de padding droit de la carte, et le `overflow-hidden` de section (l.238) ne clippe que hors-viewport. Symptôme réel = titre à l'étroit touchant/franchissant le padding droit de la carte sur les plus petits téléphones. **Fix :** gater `lg:whitespace-nowrap` (ou retirer `whitespace-nowrap`) → le titre peut wrapper sur petits écrans.

#### R2 — LOW : `ThemeToggle` fixe recouvre le badge d'en-tête de la page verify
**Fichier :** `src/components/verify/VerifyExperience.tsx:29` (badge l.109 ; `ThemeToggle` `h-10 w-10`, `ThemeToggle.tsx:20`)

`<ThemeToggle className="fixed top-4 right-4 z-50" />` occupe une boîte 16-56px du bord droit/haut. L'en-tête `max-w-5xl mx-auto px-6` : sous 1024px il est pleine largeur, le badge "Vérification sécurisée" a son bord droit ~24px du bord viewport. **Géométrie vérifiée :** chevauchement horizontal ~32px, et verticalement le badge (~30-54px du haut) est **entièrement** dans la plage 16-56px du toggle → le toggle (`z-50`) couvre le coin haut-droit du badge + la fin du texte. **Correction du rapport :** le conflit persiste jusqu'à ~1088px (pas seulement ≤768px). Purement cosmétique (toggle reste cliquable, badge décoratif, ~20px de coin masqué) → **low**. **Fix :** placer `ThemeToggle` dans le flux de l'en-tête (cluster flex à droite `<div className="flex items-center gap-2">{badge}<ThemeToggle/></div>`) au lieu de l'overlay fixe ; ou `hidden lg:inline-flex` sur le badge (l.109).

#### R3 — LOW : Ligne-titre école (admin) sans `flex-wrap`
**Fichier :** `admin/src/app/schools/[id]/page.tsx:180`

`<div className="flex items-center gap-3">` groupe le `h1` (`text-2xl sm:text-3xl`) + jusqu'à 3 pills non-rétrécissables (`SchoolStatusBadge`, "Auto-validée", "SIRENE vérifié/non confirmé"), **sans `flex-wrap`**. Dans `AdminShell` `<main className="… px-4 …">` (`AdminShell.tsx:203`), à 375px seuls ~343px dispo ; largeur min combinée des badges (~325px avec `gap-3`) + mot le plus long du nom (~150px) ≈ 475px > 343px → **débordement horizontal** (pas de `overflow-x-hidden` sur le div/main ; `autoValidated` et `sireneVerified` sont des booléens indépendants pouvant être vrais ensemble). Edge-case (nom long + multi-badges), page admin interne → **low**. **Fix :** `flex flex-wrap items-center gap-2` (optionnel `gap-y-2`) → les badges passent sous le nom, comme le groupe de boutons d'action déjà en `flex-wrap` (l.201).

---

## 2.4 ✅ Synthèse de l'audit qualité (reprise 2026-07-05 terminée)

**Les 5 dimensions sont collectées.** Total : **14 findings confirmés** sur l'ensemble bugs/perf/visuel/responsive (hors sécurité §1).

| Dimension | Findings confirmés | Répartition |
|---|---|---|
| 🐛 bugs-backend | 2 | 1 Low + 1 Info |
| 🐛 bugs-frontend | **1** | **1 Critical** |
| ⚡ performance | 3 | 3 Low |
| 🎨 visual-design | 5 | 2 High + 2 Medium + 1 Low |
| 📱 responsive | 3 | 3 Low |
| **Total** | **14** | 1 Crit · 2 High · 2 Med · 8 Low · 1 Info |

### Ordre de correction recommandé (qualité + sécurité fusionnés, critique → bas)

1. ✅ **🐛 F1 — CRITICAL — CORRIGÉ (2026-07-05)** (`wallet/src/components/wallet/AppProviders.tsx`) : route `/claim/*` derrière le guard étudiant → **feature claim 100 % injoignable**. **Fix appliqué** : helper `isPublicRoute()` traite `/claim/*` comme public par préfixe (rendu nu, sans guard ni chrome `WalletShell`). ⬜ Reste à vérifier via Docker. Recoupe le HIGH sécurité #1 (même flux claim).
2. **🔒 Sécurité #1 — HIGH** (`request-id.ts:16`) : bearer/claim tokens loggés en clair. Cf. §1.3.
3. **🎨 V1 + V4 — HIGH contraste** (`Badge.tsx:23` cyan 2.17:1 ; `globals.css:16` muted-soft 3.06:1) : corriger à la racine (tokens + 3 copies globals.css). Emporte V2/V3/V5 au passage.
4. **🔒 Sécurité MEDIUM** (#2 refresh école révoquée, #4 bootstrap MFA, #6 mailer, #7/#8 infra Docker) : cf. checklist §1.4.
5. **🎨 V2/V3 — MEDIUM contraste** (magenta 3.0:1, success/danger) : inclus dans le fix tokens du point 3.
6. **🐛 B1 — LOW** (`diplomas.service.ts:95`) : émission non-transactionnelle → 500 + orphelin. `db.transaction` + catch 23505.
7. **⚡ P1/P2/P3 — LOW perf** (Hero reflow, Navbar layout-anim, orb morph) + **📱 R1/R2/R3 — LOW responsive** + **🎨 V5 — LOW** + **🐛 B2 — INFO** : polish, à grouper en fin de passe.

> **Prochaine étape logique** (hors collecte) : appliquer ces correctifs par priorité, en vérifiant via Docker (`docker compose`), puis répercuter dans `PLAN.md`. L'audit lui-même est **terminé**.

## 3. 🕰️ Données historiques réutilisables (2026-06-23 — à revérifier vs le code actuel)

Un audit frontend antérieur (`certifychain-frontend-review`, 7 surfaces en parallèle : correctness/UX/a11y/responsive/hydration/contract) a produit **26 findings confirmés** le 2026-06-23. **⚠️ Cet audit précède la feature "claim" (phase 11, 2026-07-03) et d'autres évolutions récentes** — à retraiter comme point de départ, pas comme vérité actuelle. De plus, la dimension `school` (portail école) n'a jamais été revue (l'agent a planté avec une erreur "Overloaded"), et la synthèse finale/rapport n'a pas pu être générée (limite de session atteinte) — ce qui suit est reconstruit directement depuis les findings bruts confirmés.

Recoupement avec les catégories demandées : `bugs-frontend` ≈ toutes les dimensions ci-dessous ; `visuel` ≈ `ui-kit-a11y` (contraste, focus states) ; `responsive` ≈ `responsive-motion-xbrowser` (touch targets, drawer mobile) — mais **aucun test explicite à 375px/768px/1440px** n'a été fait, contrairement à ce que demande le nouvel audit qualité.

### HIGH

**Verified result is not announced to assistive technology** — `src/components/verify/VerifiedCard.tsx:65` (dimension verify-recruiter). Le verdict de succès (l'info la plus critique de la page) s'affiche dans un `motion.div` sans `role="status"`/`aria-live`, contrairement à `FailedCard` qui a `role="alert"` (`FailedCard.tsx:81`). Un utilisateur de lecteur d'écran n'est jamais notifié qu'un diplôme a été vérifié avec succès. **Fix :** envelopper la zone de résultat dans `role="status" aria-live="polite"` (ou assertive).

**No refresh-on-401 : les sessions meurent silencieusement à l'expiration de l'access token** — `src/lib/api/client.ts:110` (dimension api-client-hooks). Le wrapper fetch n'a aucun chemin de refresh ; un 401 n'est jamais rejoué via `POST /auth/refresh` (qui existe et fonctionne côté serveur, `auth.routes.ts:267`). Grep de `refresh` dans `src` = zéro résultat. Conséquence : un utilisateur connecté est éjecté vers le login bien avant la fin de sa fenêtre de refresh de 30 jours. **Fix :** ajouter `refresh()` à `endpoints.ts` + un refresh-and-retry single-flight sur 401 dans `request()`.

**Verification verdict is not announced to screen readers on success (critère d'acceptation core)** — `src/components/verify/VerifyExperience.tsx:114` (dimension responsive-motion-xbrowser, même cause racine que le finding ci-dessus sur VerifiedCard). Le contenu qui switch dans `AnimatePresence` (lignes 114-153) n'est pas une région `aria-live`. **Fix :** envelopper la zone de swap de phase dans `<div aria-live="polite" aria-atomic="true">`, et/ou déplacer le focus vers le titre du résultat.

### MEDIUM

- **Révocation de lien de partage destructive sans confirmation** — `src/components/wallet/SharePanel.tsx:130`. Clic sur "Révoquer" appelle directement la mutation, sans dialogue de confirmation, alors que l'action équivalente côté école (révocation de diplôme) est bien gated par une Modal. Fix : réutiliser la Modal existante.
- **Le layout école affiche le contenu protégé même sans session valide (flash de contenu protégé)** — `src/app/(school)/ecole/layout.tsx:17`. `GuardedApp` ne check que `loading`, jamais `session` ni le rôle — contrairement au layout wallet qui fait `loading || !session`. Fix : aligner sur le pattern wallet.
- **`useRequireRole` ne distingue pas une vraie erreur réseau/5xx d'un 401 propre** — `src/hooks/useSession.ts:73`. Une panne API transitoire déclenche une redirection vers le login au lieu d'un état d'erreur "serveur injoignable".
- **Toasts d'erreur perdent leur urgence assertive** — `src/components/ui/Toast.tsx:192`. `role="alert"` imbriqué dans un conteneur `aria-live="polite"` — nesting non défini par ARIA, peut désactiver l'annonce assertive.
- **Badge status tones et texte muted-soft échouent au contraste WCAG AA** — `src/components/ui/Badge.tsx:19`. Ratios mesurés : cyan-500/cyan-100 ≈ 2.17:1, magenta-500/magenta-100 ≈ 3.0:1, success/danger sur fond /12 ≈ 2.27:1 / 3.23:1 — tous < 4.5:1 requis. `muted-soft` (#8891A3) sur blanc ≈ 3.17:1, utilisé comme vrai texte (en-têtes de table, hints). Fix : foncer vers des teintes 600/700, remplacer `muted-soft` par `muted` (#5B6474, ≈5.97:1) pour le texte réel.
- **Drawer mobile école sans focus trap, Escape, aria-modal ni verrouillage de scroll** — `src/components/school/AppShell.tsx:154`. `role="dialog"` déclaré mais aucun des comportements de dialog n'est implémenté, alors que `Modal.tsx` a déjà tout ça (à réutiliser).
- **Formulaire waitlist ne soumet nulle part — emails silencieusement jetés, faux succès affiché** — `src/components/WaitlistSection.tsx:98`. Aucun fetch/backend ; `setSubmitted(true)` affiche un message de succès factice. Atténué par un fallback fonctionnel vers `/ecole/register`. Fix : câbler à un vrai endpoint ou rediriger vers `/ecole/register`/mailto en attendant.

### LOW / INFO (synthèse — 17 items, voir détail complet dans l'historique de session si besoin de citations exactes)

- Focus jamais déplacé vers le verdict de vérification (`VerifyExperience.tsx:115`)
- Crash potentiel si l'API renvoie `result:"verified"` sans objet `diploma` (`VerifyExperience.tsx:128`) — actuellement non atteignable via le flux normal, mais fragile
- État d'erreur transport sans annonce live persistante au-delà du toast (`VerifyExperience.tsx:198`)
- Hiérarchie de titres : pas de `h1` pendant la phase de chargement de la page verify (`VerifyScan.tsx:72`)
- Bouton "Vérifier le diplôme" persistant et redondant sous un verdict déjà affiché (`VerifyExperience.tsx:156`)
- Pas de contrôle "renvoyer le code"/cooldown sur l'étape OTP wallet (`wallet/login/page.tsx:157`) — un contournement à 2 clics existe déjà
- Erreur OTP annoncée deux fois (alerte inline + toast) (`wallet/login/page.tsx:66`)
- États de chargement/vide du wallet non annoncés aux lecteurs d'écran (`wallet/page.tsx:77`)
- Cartes diplôme affichent un faux hash de "signature" et le mauvais nom de moteur crypto ("ZKP Groth16" au lieu d'Ed25519 réel) (`DiplomaDetailCard.tsx:109`)
- Fallback clipboard ne fait qu'afficher un toast, pas de sélection manuelle réelle (`SharePanel.tsx:55`)
- Lignes de tableau cliquables non opérables au clavier (`ui/Table.tsx:106`) — actuellement du code mort (`onRowClick` jamais utilisé), donc latent
- Touch targets icon-only à 36px (`school/AppShell.tsx:190`) — sous la recommandation 44px AAA, mais passe l'AA (24px)
- `retrying` prop hardcodée à `false` sur le bouton retry de `FailedCard` — cosmétique, chemin non atteignable (`VerifyExperience.tsx:137`)
- `useRequireRole` ne gate pas sur `schoolStatus` — mais c'est un comportement intentionnel (écran d'activation), pas un bug (`useSession.ts:75`)
- `Button` n'est pas un composant `forwardRef`, contrairement à `Input`/`Select` (`ui/Button.tsx:65`)
- Placeholder du `Select` natif n'apparaît que si `value`/`defaultValue=""` est forcé — actuellement du code mort, aucun appelant ne passe `placeholder` (`ui/Select.tsx:50`)

> Le détail complet (preuve exacte + raisonnement de vérification adversariale mot pour mot) de ces 26 findings reste dans les données de session Claude Code de ce projet si besoin de le ressortir (workflow `certifychain-frontend-review`, exécuté 2026-06-23 18:55, run `wf_61ab6693-0ff`). Vu que ni la dimension `school` ni la synthèse finale n'ont pu être complétées à l'époque, et que le code a bougé depuis (feature claim), **le plus efficace est de les re-vérifier via le nouveau script §2.2** plutôt que de les prendre pour argent comptant.

---

## 4. 📎 Autres audits disponibles dans l'historique (hors périmètre de cette liste, pour référence)

Ces audits ne rentrent pas dans les 5 catégories demandées (bugs/sécurité/perf/visuel/responsive) mais existent dans l'historique de sessions Claude Code de ce projet si besoin :

- **`verify-readme-claims`** (2026-06-24) — vérification factuelle de 98 affirmations du README/PLAN.md vs le code réel ; 3 signalées (ex. répertoire `(marketing)/` inexistant mentionné dans README.md:44 ; driver E2E `scratchpad/e2e.mjs` documenté mais absent du working tree).
- **`certifychain-spec-gap-analysis`** (2026-06-23) — analyse d'écarts vs le cahier des charges, 7/7 dimensions scorées. Résultats déjà en grande partie repris dans `PLAN.md` §"🔍 Analyse d'écarts vs Cahier des Charges (2026-06-24)".
- **`certifychain-security-audit`** (2026-06-23, 24 findings) — version antérieure de l'audit sécurité, **supersédée** par le rapport du §1 ci-dessus ; ses correctifs sont documentés dans `PLAN.md` §"🔒 Correctifs audit sécurité".
- **`certifychain-security-audit`** (2026-07-03) — tentative interrompue (`status: killed`), supersédée par le run réussi du 04/07 (§1).
- **`understand-verify-impl`**, **`certifychain-portals`**, **`certifychain-build`** (2026-06-16 à 06-29) — workflows de compréhension/construction du projet, pas des audits qualité.

---

## 5. Recommandations pour la prochaine session

1. **Ne pas refaire la sécurité** (§1) — elle est complète, adversarialement vérifiée, et actionnable telle quelle. Commencer directement par appliquer la checklist §1.4 si le temps le permet.
2. **Relancer le script §2.2** pour bugs/perf/visuel/responsive — c'est la vraie priorité manquante. Vérifier d'abord le quota Fable 5 (`/usage-credits`) ou basculer sur un autre modèle via l'option `model` de `agent()`.
3. Avant de relancer, **mettre à jour le statut "uncommitted" de la feature claim** dans le prompt `CONTEXT` du script si elle a été committée depuis (vérifier `git status`/`git log` sur `server/src/modules/auth/claim.service.ts`, `wallet/src/app/claim/`).
4. Traiter les 26 findings du §3 comme des **pistes à re-vérifier**, pas des vérités actuelles — le nouveau run du script §2.2 les retrouvera probablement indépendamment (dimensions `bugs-frontend`/`visual-design`/`responsive` recoupent largement `verify-recruiter`/`ui-kit-a11y`/`responsive-motion-xbrowser`), avec en plus une vraie vérification à 375px/768px/1440px et une couverture de la dimension `school` jamais faite.
5. Une fois bugs/perf/visuel/responsive obtenus, envisager de fusionner ce fichier dans `PLAN.md` (comme cela a été fait pour l'audit sécurité de juin) plutôt que de garder `audit.md` séparé indéfiniment.

---

## 6. 🔧 Correctifs appliqués (2026-07-05, Opus 4.8)

> **Portée :** application des findings par priorité (critique → bas). ✅ **Vérification Docker FAITE (2026-07-05)** — voir §7.

### ✅ Corrigés

| Finding | Sév | Fichier(s) | Correctif |
|---|-----|-----------|-----------|
| **F1** | 🔴 Crit | `wallet/.../wallet/AppProviders.tsx` | `/claim/*` public par préfixe (`isPublicRoute`) → onboarding claim joignable |
| **Sec #1** | 🟠 High | `server/.../middleware/request-id.ts` | `redactPathTokens()` masque `:token` de `/verify/*` & `/auth/student/claim/*` dans les logs |
| **V1–V5** | 🟠 High → Low | `Badge.tsx`, `Input.tsx`, `globals.css` (×3 apps) + `FeaturesGrid`/`HowItWorks`/`HeroSection`/`SharePanel`/admin | Chips accent en `-700 dark:-300` (AA ✓, ratios recalculés), `--color-muted-soft` foncé (#6B7284 light / #7E859C dark), placeholder → `text-muted`, badges SIRENE/Signal admin idem |
| **Sec #2** | 🟡 Med | `auth.routes.ts`, `admin.service.ts`, `diplomas.routes.ts` | Garde de statut sur `/auth/refresh` + `revokeSchoolAdminSessions()` dans reject/revoke + garde statut sur `POST /diplomas/:id/revoke` |
| **Sec #6/#17** | 🟡 Med/Low | `server/.../lib/mailer.ts`, `lib/mask.ts` (nouveau) | Écho du corps mail = `env.isDev` seul (jamais en prod) ; destinataires loggés via `maskEmail()` ; `maskEmail` extrait dans `lib/mask.ts` |
| **Sec #7/#8** | 🟡 Med | `docker-compose.yml` | `TRUST_PROXY` défaut `false` ; admin bind `127.0.0.1` (`ADMIN_BIND`), API bind surchargable (`API_BIND`) |
| **B1** | 🟢 Low | `server/.../diplomas/diplomas.service.ts` | `issueDiploma` en `db.transaction` + retry-once sur violation d'unicité alias (23505) → plus d'orphelin ni de 500 concurrent |
| **P1/P2/P3** | 🟢 Low | `HeroSection.tsx`, `Navbar.tsx`, `globals.css` (×3) | Hero : rects cachés + toutes écritures dans 1 rAF ; Navbar : garde `useReducedMotion` + hystérésis scroll (20/10) ; orbes : `will-change: border-radius` (sans `contain: paint` qui clipperait le flou) |
| **R1/R2/R3** | 🟢 Low | `HowItWorksSection.tsx`, `VerifyExperience.tsx`, `admin/.../schools/[id]/page.tsx` | `lg:whitespace-nowrap` ; `ThemeToggle` déplacé dans le flux de l'en-tête (badge `hidden sm:`) ; `flex flex-wrap` sur la ligne-titre école |
| **B2** | ⚪ Info | `admin/src/app/page.tsx` | Tuile KPI "Élèves" → "Titulaires" (libellé fidèle au comptage réel ; pas de filtre silencieux) |

### ⏸️ Différés (raison documentée — nécessitent un changement plus large + tests Docker)

| Finding | Sév | Raison du report |
|---|-----|------------------|
| **Sec #3** cookies host-only | 🟡 Med | Couplé au double-submit CSRF : les fronts lisent `cc_csrf` via `document.cookie` en cross-sous-domaine (`wallet/.../api/client.ts:47`) → un cookie host-only casserait le CSRF. Fix sûr = d'abord lier le token CSRF à la session (**Sec #15**), puis passer host-only. Nécessite la topologie prod réelle. |
| **Sec #4** bootstrap MFA | 🟡 Med | Fermer le trou demande un vrai 2ᵉ facteur (token de confirmation email à l'enrôlement TOTP) — refonte du flux login à tester en profondeur. Une 1/2-mesure (notif/audit) donnerait une fausse assurance ; reporté plutôt que risquer un bug d'auth non vérifiable (Docker down). |
| **Sec #5** CSP `unsafe-inline` | 🟡 Med | CSP nonce-based = middleware Next par app (génération de nonce + propagation) sur les 3 apps. Changement d'archi à tester ; aucun point d'injection live aujourd'hui (amplifie un futur XSS, n'en est pas un). Déjà backlog PLAN.md #18. |
| **Sec #9–#26** (hors ci-dessus) | Low/Info | Backlog durcissement / défense en profondeur, conformément à la propre checklist §1.4 (ex. #19 Redis rate-limit, #21 secrets Docker, #22 pin digest, #23 AAD). Risque réel déjà faible. |

### 🔎 À faire ensuite
1. Vérifier visuellement le contraste en thème clair **et** sombre (les chips accent + `muted-soft` ont changé de teinte).
2. Committer (les correctifs touchent les 4 services + `docker-compose.yml`).

---

## 7. ✅ Vérification Docker (2026-07-05) — RÉUSSIE

Docker Desktop démarré, puis :

```bash
docker compose build server web wallet admin
```

**Résultat : les 4 images buildent avec 0 erreur.**
- `server` — `tsup` (esbuild + TS) → `dist/server.cjs` (345.74 KB), build en 1.1s.
- `web` — `next build` (Turbopack) : compilé, **TypeScript OK** (6.2s), 11 routes générées (landing, `/ecole/*`, `/verify/[token]`).
- `wallet` — `next build` : compilé, **TypeScript OK** (4.3s), 4 routes (`/`, `/[id]`, `/claim/[token]`, `/login`) — confirme que la route claim (fix F1) build sans erreur.
- `admin` — `next build` : compilé, **TypeScript OK** (4.5s), 8 routes (`/`, `/audit`, `/diplomas`, `/login`, `/schools`, `/schools/[id]`, `/settings`).

**Tests unitaires serveur** (image `builder` intermédiaire, car le runtime `server` est distroless sans shell — testé via `docker build --target builder` + `docker run … pnpm test`, `.env` monté en volume) :

```
# tests 51
# suites 10
# pass 51
# fail 0
```

Couverture confirmée sans régression : `ProofEngine` (Ed25519+nonce, 8 sous-tests incl. rejet signature forgée/rejeu/tamper/mauvais secret holder), TOTP (vecteurs RFC 6238), rate-limit/login-throttle, anonymisation IP RGPD, Gemini parseResult. **Aucun test ne couvre encore `issueDiploma`/`claimAlias`/`mailer` directement (pas de régression détectée, mais pas de test dédié aux changements B1/Sec#6/#17 — à considérer pour une prochaine session).**

**Conclusion : tous les correctifs appliqués (§6) sont buildables et ne cassent aucun test existant.** Image de test intermédiaire nettoyée (`docker rmi certychain-server-builder`) — n'affecte pas les images de service `docker compose build`.

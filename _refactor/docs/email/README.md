# Provider e-mail de production (P4, `audit.md` D3 / `docs/architecture.md` §12.2)

> Rédigé le 2026-07-28, mis à jour le même jour (ajout STARTTLS) : un compte de test fourni par
> l'utilisateur (Ethereal) n'écoute **qu'en STARTTLS** (port 587) — le port 465 (TLS implicite)
> time out. `apps/server/src/lib/smtp.ts` supporte désormais les deux modes ; voir §2 et §4.

## 1. Pourquoi c'est bloquant

Sans provider configuré, `apps/server/src/lib/mailer.ts` **abandonne silencieusement** chaque
e-mail dès que `NODE_ENV` n'est pas `development` (`logger.warn("mail.dropped_no_smtp", …)`, sans
le corps du message — volontaire, pour ne pas fuiter d'OTP/lien dans les logs). Concrètement, tant
qu'aucun `SMTP_HOST` n'est renseigné en production : **aucune invitation élève, aucun code de
connexion OTP, aucun lien de récupération ne part** — et rien ne le signale à l'utilisateur final
(seul l'opérateur qui lit les logs voit `mail.dropped_no_smtp`). C'est une action de souscription
à faire, pas une limitation technique du client SMTP.

## 2. Le client SMTP maison — ce qu'il sait faire, vérifié dans `smtp.ts`

`apps/server/src/lib/smtp.ts` est un client SMTP minimal, sans dépendance (`node:net`/`node:tls`
seulement — cohérent avec la contrainte distroless/pur-JS du reste du dépôt, `v2.md` §6 piège 7).
Vérifié dans le code (pas seulement dans le commentaire d'en-tête) :

| Capacité | Supporté | Où dans `smtp.ts` |
|---|---|---|
| Connexion en clair (dev, ex. Mailpit `:1025`) | ✅ | `cfg.secure=false, cfg.starttls=false` → `net.connect` |
| **TLS implicite** dès la connexion (ex. port `465`) | ✅ | `cfg.secure=true` → `tls.connect` |
| **STARTTLS** (upgrade TLS explicite, typiquement port `587`) | ✅ | `cfg.starttls=true` → `STARTTLS` puis ré-EHLO chiffré |
| `AUTH LOGIN` (base64 user/password) | ✅ | jamais envoyé sur un canal non chiffré (voir §3) |
| `EHLO`, `MAIL FROM`, `RCPT TO`, `DATA` | ✅ | protocole SMTP minimal complet |
| En-têtes UTF-8 (sujet accentué) | ✅ | RFC 2047 encoded-word, `encodeHeaderWord` |
| Corps encodé proprement (pas de dot-stuffing accidentel) | ✅ | base64 + wrap76 (RFC 2045) |

Les deux modes TLS (`SMTP_SECURE` / `SMTP_STARTTLS`, `config/env.ts`) sont mutuellement exclusifs
et choisis explicitement — jamais déduits du port. Choisir l'un ou l'autre selon ce que le provider
propose ; les deux fonctionnent identiquement côté livraison.

## 3. STARTTLS — pourquoi c'est sûr (jamais d'identifiants en clair)

`smtp.ts` refuse de retomber sur un `AUTH LOGIN` en clair dans les deux cas d'échec possibles :
serveur qui n'annonce pas `STARTTLS` dans ses capacités `EHLO` alors qu'il est exigé, ou élévation
TLS qui échoue. Après une élévation réussie, un second `EHLO` est ré-émis sur le canal chiffré (RFC
3207 §4.2) — plusieurs providers n'annoncent `AUTH` **que** là, jamais en clair, précisément pour
empêcher un client bogué de s'authentifier avant l'élévation.

`docs/architecture.md` §12.2 affirme : « Client SMTP maison, déjà 100 % compatible Resend SMTP sans
changer une ligne ». Confirmé : Resend expose son relais SMTP sur `smtp.resend.com:465` (TLS
implicite) avec `AUTH LOGIN` (utilisateur `resend`, mot de passe = clé API) — exactement ce que
`smtp.ts` implémentait déjà. Aucune incompatibilité réelle trouvée pour Resend ni pour les autres
providers de §4 (tous exposent aussi une variante `587`/STARTTLS, désormais supportée).

## 4. Providers courants — variables à renseigner

Les 6 variables lues par `config/env.ts` (voir aussi `.env.example`) — **TLS implicite** (port 465,
la plupart des providers) :

```
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASSWORD=
SMTP_SECURE=true
SMTP_STARTTLS=false
SMTP_FROM="CertifyChain <no-reply@votre-domaine.fr>"
```

Ou **STARTTLS** (port 587 — cas d'Ethereal, seul mode qu'il expose ; aussi disponible chez tous les
providers de la table ci-dessous en alternative au port 465) :

```
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_SECURE=false
SMTP_STARTTLS=true
SMTP_FROM="CertifyChain <no-reply@votre-domaine.fr>"
```

⚠️ `SMTP_FROM` doit utiliser un domaine dont vous contrôlez le DNS (SPF/DKIM/DMARC configurés chez
le provider) — sinon la délivrabilité (arrivée en spam, voire rejet pur) sera mauvaise quel que
soit le provider choisi. C'est une étape de configuration DNS **chez le registrar/provider DNS**,
distincte de ces variables.

| Provider | `SMTP_HOST` | Port TLS implicite | Port STARTTLS | `SMTP_USER` |
|---|---|---|---|---|
| **Resend** (recommandé — mentionné dans l'audit, offre gratuite généreuse) | `smtp.resend.com` | `465` | `587` | `resend` (mot de passe = clé API Resend) |
| **Mailgun** | `smtp.mailgun.org` (ou `smtp.eu.mailgun.org` en zone UE) | `465` | `587` | login SMTP créé dans le dashboard Mailgun (pas la clé API HTTP) |
| **SendGrid** | `smtp.sendgrid.net` | `465` | `587` | `apikey` (littéralement ce mot ; mot de passe = clé API) |
| **Postmark** | `smtp.postmarkapp.com` | `465` | `587` | Server API Token (utilisé comme user ET password) |
| **Ethereal** (compte de test — pas un provider de prod) | `smtp.ethereal.email` | `465` (⚠️ time out en pratique) | `587` (seul mode qui répond) | identifiants du compte Ethereal |

### Procédure générique de souscription

1. Créer un compte chez le provider choisi, vérifier le domaine d'envoi (ajout d'enregistrements
   DNS SPF/DKIM fournis par le provider — délai de propagation possible avant le premier envoi).
2. Générer les identifiants **SMTP** (pas une clé API REST générique — certains providers, comme
   Mailgun, distinguent les deux) dans le dashboard.
3. Renseigner les 6 variables ci-dessus (mode implicite OU STARTTLS, jamais les deux — voir §3) dans
   `.env` (jamais commit — voir `.env.example`).
4. Redémarrer le serveur (`docker compose restart server` ou `docker compose up -d --build server`
   si le changement touche aussi l'image) — ces variables ne sont PAS `NEXT_PUBLIC_*`, un restart
   simple suffit (contrairement aux secrets racine PKI, voir
   `docs/security/root-secrets-rotation.md`).
5. Vérifier : déclencher un envoi réel (ex. inscription élève ou `pnpm smoke` avec Mailpit
   remplacé par le vrai provider — attention à ne PAS pointer les tests automatisés vers un
   provider de production, réserver `pnpm smoke`/dev à Mailpit) et confirmer la réception hors
   dossier spam.

## 5. Ce qui reste vrai en dev (aucun changement)

`docker-compose-dev.yml` continue de pointer `SMTP_HOST` vers le conteneur Mailpit local — aucune
inscription à un provider n'est nécessaire pour développer ou lancer `pnpm smoke`. Cette
souscription ne concerne que le déploiement de **production**.

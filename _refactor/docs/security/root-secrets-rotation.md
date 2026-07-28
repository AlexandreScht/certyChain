# Secrets racine — génération, Docker secrets, rotation

> P2 (`docs/architecture.md` §12.2 « Secrets racine (clé privée PKI + master key AES) »,
> `audit.md` D2). Rédigé le 2026-07-28, à la suite du passage de `PQ_POLICY` à `require` par
> défaut (voir [ADR-0006](../architecture/decisions/0006-post-quantum-hybrid.md)) et de
> l'épinglage navigateur ([ADR-0007](../architecture/decisions/0007-browser-root-pinning.md)).

## 1. Les trois secrets concernés

Trois valeurs, et seulement trois, justifient le traitement « Docker secrets » (fichier monté en
tmpfs, invisible via `docker inspect` / `/proc/<pid>/environ` — contrairement à une simple
variable `environment:`) : ce sont les seuls secrets dont la compromission romprait la racine de
confiance **entière** du système, pas un compte ou une intégration isolée.

| Variable | Rôle | Portée d'une compromission |
|---|---|---|
| `CERTIFYCHAIN_ROOT_PRIVATE_KEY` | Clé privée Ed25519 de la racine PKI — signe le certificat de **chaque** école | Un attaquant pourrait certifier une fausse école et donc forger des diplômes acceptés par tout vérificateur |
| `CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY` | Clé privée ML-DSA-65 de la même racine (V4, hybride) | Idem, pour la moitié post-quantique de la signature — `PQ_POLICY=require` par défaut signifie qu'**aucun** diplôme n'est émis sans elle |
| `MASTER_ENC_KEY` | Clé AES-256-GCM du `KeyVault` (`apps/server/src/crypto/envelope.ts`) qui chiffre au repos toutes les données sensibles en base (clés privées école, secrets TOTP, clés d'émission VC…) | Déchiffre **tout** ce que le `KeyVault` protège dans la base, d'un coup |

Les autres secrets (SMTP, Stripe, INSEE, Gemini, ProConnect, `OTP_PEPPER`, `AUDIT_IP_SALT`, JWT…)
restent en variable d'environnement classique (`.env`, `env_file`) : leur compromission reste
grave mais **localisée** à une intégration ou un mécanisme, jamais à la racine de confiance
entière — migrer *tout* vers des Docker secrets serait une charge opérationnelle disproportionnée
pour un gain marginal sur ces variables-là (cf. le même raisonnement coût/bénéfice que
`docs/kms/README.md` §3 pour le KMS).

## 2. Génération (première installation)

```bash
# Racine Ed25519 + MASTER_ENC_KEY + OTP_PEPPER + secrets JWT (une seule commande) :
corepack pnpm@9.12.0 --filter @certifychain/server keys:root

# Racine ML-DSA-65 (V4, requise par défaut depuis PQ_POLICY=require) :
corepack pnpm@9.12.0 --filter @certifychain/server keys:root:pq
```

Les deux commandes impriment des lignes `CLE=valeur` prêtes à copier. **Deux destinations
possibles**, mutuellement compatibles (voir §3) :

- **`.env`** (comportement historique, toujours supporté) — simple copier-coller sous les clés
  correspondantes ; voir `.env.example` pour la liste complète et les avertissements associés
  (notamment : le serveur refuse de démarrer sans une paire ML-DSA-65 valide, `PQ_POLICY` étant
  `require` par défaut).
- **Docker secrets** (`secrets/<nom>`, §3) — écrire *uniquement la valeur*, sans le nom de la
  variable ni le signe `=`, dans le fichier correspondant.

⚠️ Les clés Ed25519 et ML-DSA-65 sont **indépendantes l'une de l'autre** (courbes différentes,
pas de dérivation entre les deux) — générer l'une ne régénère jamais l'autre, et il n'existe pas
de commande unique qui fait les deux.

## 3. Docker secrets (convention `<VAR>_FILE`)

`apps/server/src/config/env.ts` résout, AVANT toute validation Zod, la convention suivante pour
ces trois variables (et uniquement celles-ci) :

> Si `<VAR>_FILE` est défini (un chemin de fichier), sa valeur **prime** sur `<VAR>` : le contenu
> du fichier (trailing newline retiré) devient la valeur effective. Sinon, `<VAR>` est utilisé
> tel quel (comportement historique, inchangé).

Cette résolution se fait **en Node**, dans `env.ts` lui-même — le conteneur applicatif est
**distroless** (`apps/server/Dockerfile`, pas de `sh`), donc aucun script d'entrypoint shell n'est
possible pour faire ce travail en amont. Un chemin invalide (fichier absent, droits refusés) fait
échouer le démarrage explicitement (`process.exit(1)`, message citant la variable **et** le
chemin fautif) — jamais un repli silencieux vers `<VAR>`. Couverture de test :
`tests/jest/server/env-secret-files.spec.ts`.

### Activation

```bash
mkdir -p secrets
echo -n "<contenu de CERTIFYCHAIN_ROOT_PRIVATE_KEY>"    > secrets/certifychain_root_private_key
echo -n "<contenu de CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY>" > secrets/certifychain_root_pq_private_key
echo -n "<contenu de MASTER_ENC_KEY>"                   > secrets/master_enc_key

docker compose -f docker-compose.yml -f docker-compose.secrets.yml up -d --build
```

`docker-compose.secrets.yml` (overlay **optionnel**, non appliqué par défaut) déclare les trois
`secrets:` Compose et pointe `<VAR>_FILE` vers `/run/secrets/<nom>` dans le conteneur `server` —
voir ce fichier et `secrets/README.md` pour le détail. Sans cet overlay, rien ne change : les
trois valeurs restent lues depuis `.env` comme aujourd'hui.

⚠️ `secrets/` est gitignoré (sauf son `README.md`) — ne JAMAIS committer le contenu réel d'un
secret, y compris temporairement pour tester.

## 4. Rotation — clé publique Ed25519 / ML-DSA (racine PKI)

C'est la rotation **la plus lourde des trois**, et la seule qui touche le navigateur.

1. **Générer** la nouvelle paire (§2). Ne PAS écraser encore l'ancienne — les deux doivent
   coexister pendant la fenêtre de bascule (voir point 3).
2. **Épingler les deux racines, navigateur ET serveur.** Côté client, c'est câblé depuis
   l'ADR-0007 : `apps/client/web/src/lib/trusted-roots.ts` parse
   `NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY` / `NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY` comme
   un **CSV**, précisément pour ce cas. **Depuis l'audit du 2026-07-28, le serveur fait exactement
   la même chose** : `config/env.ts` parse `CERTIFYCHAIN_ROOT_PUBLIC_KEY` /
   `CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY` en CSV (`certifychainRootPublicKeys` /
   `certifychainRootPqPublicKeys`, mêmes règles de trim/filtre que le navigateur), et
   `SERVER_TRUSTED_ROOTS` (`apps/server/src/modules/verify/verify.routes.ts`) épingle **toute** la
   liste — plus une seule racine. Le jour de la rotation, mets la **même** valeur
   `ancienne,nouvelle` dans les quatre variables (`CERTIFYCHAIN_ROOT_PUBLIC_KEY`,
   `CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY`, et leurs équivalents `NEXT_PUBLIC_*`) — un opérateur copie
   les mêmes valeurs des deux côtés sans rien re-dériver. Convention non ambiguë : la **première**
   entrée de la liste CSV est celle que la clé **privée** correspondante signe réellement
   (`CERTIFYCHAIN_ROOT_PRIVATE_KEY` / `CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY`, toujours des valeurs
   **uniques** — on ne signe jamais qu'avec une seule racine à la fois, seule la vérification en
   accepte plusieurs) ; place donc la **nouvelle** racine en premier dès que tu mets à jour ces
   variables, y compris **avant** l'étape 4 ci-dessous si tu veux préparer le changement à l'avance
   (le serveur continue de vérifier avec l'ancienne clé privée jusqu'à l'étape 4 — seule la liste
   des clés **publiques** acceptées grandit ici).
   ⚠️ Le serveur retrouve, pour CHAQUE certificat d'école, la racine Ed25519 qui l'a réellement
   signé (`crypto/keys.ts#findTrustedEd25519RootFor`, essayée contre toute la liste) — un
   certificat émis avant la rotation reste donc vérifiable indéfiniment tant que l'ancienne clé
   publique reste dans la liste (étape 5). **Limite connue, non couverte par ce correctif** : côté
   ML-DSA-65 (V4), la vérification du certificat post-quantique d'une école reste entièrement
   déléguée à `packages/shared` (v2.md §6 piège n°6 : une seconde implémentation de vérification
   côté serveur romprait la règle « une seule implémentation ») — le serveur embarque toujours la
   racine PQ **courante** (première de la liste) dans le bundle qu'il construit, jamais celle qui a
   réellement signé le certificat PQ d'une école ancienne. Concrètement : un certificat d'école
   ML-DSA-65 émis avant une rotation PQ cesserait de se vérifier dès la bascule de la clé privée
   PQ, MÊME si l'ancienne clé publique PQ reste épinglée — à corriger avant la première rotation
   PQ réelle (aucune rotation PQ n'a encore eu lieu en production à ce jour, `PQ_POLICY=require`
   étant très récent).
3. **⚠️ REBUILD OBLIGATOIRE DES 3 IMAGES FRONT** (`web`, `wallet`, `admin`). `NEXT_PUBLIC_*` est
   figé dans le bundle JS **au moment du `next build`** par Next.js, jamais relu au runtime
   ([ADR-0007](../architecture/decisions/0007-browser-root-pinning.md) §8,
   `apps/client/web/src/lib/trusted-roots.ts`). Un simple `docker compose restart` ou même un
   redéploiement des conteneurs **sans rebuild** continue de vérifier contre l'**ANCIENNE** racine
   uniquement — la nouvelle racine ne serait tout simplement pas dans le bundle servi au
   navigateur. Commande complète :
   ```bash
   docker compose build web wallet admin
   docker compose up -d web wallet admin
   ```
4. **Basculer le serveur** sur la nouvelle clé **privée** (`CERTIFYCHAIN_ROOT_PRIVATE_KEY[_FILE]` /
   `CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY[_FILE]`) — désormais, tous les **nouveaux** certificats
   d'école sont signés par la nouvelle racine.
5. **Ne jamais retirer l'ancienne clé PUBLIQUE de la liste épinglée** tant qu'un diplôme signé par
   l'ancienne racine reste vérifiable (potentiellement indéfiniment — `CLAUDE.md` §1 : « la preuve
   est autonome », un diplôme émis un jour doit rester vérifiable des années plus tard). Retirer
   l'ancienne clé privée du serveur est en revanche sûr immédiatement après l'étape 4 (elle ne sert
   plus qu'à signer, jamais à vérifier).

## 5. Rotation — `MASTER_ENC_KEY`

Plus délicate qu'elle n'y paraît : **il n'existe aujourd'hui aucun outil de re-chiffrement
automatique.** `EnvelopeKeyVault` (`apps/server/src/crypto/envelope.ts`) ne connaît qu'**une seule**
clé à la fois — le préfixe `v1` du format stocké (`v1.<iv>.<tag>.<ciphertext>`) est une version de
**format**, pas une version de **clé** ; il n'y a pas de rotation « douce » intégrée.

Remplacer `MASTER_ENC_KEY` sans ré-encoder les données déjà stockées **rend illisible** tout ce
que l'ancien `KeyVault` avait chiffré (clés privées école en base, secrets TOTP, clés d'émission
VC…) — l'école concernée ne pourrait plus émettre de diplôme, l'admin/école ne pourrait plus se
reconnecter en TOTP, etc.

Ceci n'est **pas** un chantier de code de ce ticket (P2 se limite à la convention `<VAR>_FILE` et
à cette documentation) — mais toute rotation réelle de `MASTER_ENC_KEY` doit, avant de basculer la
variable, écrire puis exécuter un script de migration qui :
1. démarre avec l'**ancienne** clé chargée (un `KeyVault` temporaire distinct du singleton
   `keyVault` exporté, ou un second processus) ;
2. lit chaque ligne chiffrée par l'ancien `KeyVault` (colonnes `encryptedPrivateKey` des écoles,
   secrets TOTP, clés VC…) ;
3. déchiffre avec l'ancienne clé, ré-chiffre avec la nouvelle, ré-écrit — **en transaction**, comme
   toute autre migration de ce dépôt (`v2.md` §6 piège 8 : pas de rattrapage asynchrone partiel) ;
4. seulement alors, bascule `MASTER_ENC_KEY` dans `.env`/le Docker secret et redémarre le serveur.

Tant que ce script n'existe pas, la seule rotation sûre de `MASTER_ENC_KEY` est celle effectuée
**avant la toute première mise en production** (base vide, rien à re-chiffrer) — exactement le cas
couvert par §2 ci-dessus.

## 6. Ce qui n'est PAS couvert ici

- La rotation des clés Ed25519 **par école** (`schools.encryptedPrivateKey`) — mécanisme
  indépendant, hors racine PKI, non traité par ce document.
- Un HSM/Vault complet pour ces trois secrets — écarté pour un pilote solo dev, cf.
  `docs/architecture.md` §12.2 (« Pas de HSM/Vault complet pour l'instant, disproportionné ») et
  `docs/kms/README.md` (même arbitrage pour les clés d'école).
- L'automatisation de la rotation (aucun cron/job ne déclenche jamais une rotation) — ce document
  décrit une procédure **manuelle**, délibérément : la fréquence attendue (incident de sécurité
  avéré, ou décision planifiée) ne justifie pas l'outillage d'une rotation automatique aujourd'hui.
- **Le couplage racine-du-certificat / racine-du-checkpoint dans `ProofBundleDTO.root`** —
  `bundle.root.publicKey` est un champ UNIQUE partagé par deux vérifications indépendantes côté
  `packages/shared` : la chaîne de certification de l'école (`verifyProofBundle`) ET la signature
  du checkpoint de transparence (`verifyTransparency`). Le serveur (§4 ci-dessus) embarque
  désormais la racine qui a RÉELLEMENT signé le certificat de l'école interrogée — mais le
  checkpoint le plus récent couvrant ce diplôme peut, après une rotation, avoir été signé par une
  racine **différente** (les checkpoints sont recréés périodiquement sur tout l'arbre, y compris
  longtemps après qu'un diplôme ancien a été émis). Si ces deux racines diffèrent, AUCUNE valeur
  unique de `bundle.root.publicKey` ne peut satisfaire les deux vérifications à la fois — un
  vérificateur verrait alors la preuve du diplôme réussir mais la preuve de transparence échouer
  (« invalid checkpoint signature »), ce qui n'est pas encore résolu. Ce cas ne s'est jamais
  produit en pratique (aucune rotation n'a encore eu lieu) ; le résoudre proprement demanderait de
  faire porter à `verifyTransparency` sa propre recherche de racine (comme
  `findTrustedEd25519RootFor` le fait pour un certificat) plutôt que de dépendre du champ `root`
  partagé — un changement qui n'a pas été fait ici pour rester dans le périmètre strict de ce
  ticket (CSV + non-régression).

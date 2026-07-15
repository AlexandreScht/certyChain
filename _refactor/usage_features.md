---
École (émettrice)

F1 — Accrochage CDC
- Prérequis : organisme habilité côté CDC, puis module activé par l'admin plateforme (toggle sur la fiche école dans l'app admin). Tant que désactivé : carte « contactez CertifyChain », rien n'est saisissable.
- Menu Accrochage CDC → page /ecole/accrochag
  a. État et configuration : SIRET certificateur, identifiants CDC émetteur/certificateur, contrat, e-mail →
Enregistrer.
  b. Préparation des identités : tableau des diplômes RNCP éligibles ; pour chaque badge « Identité manquante » →
modale de saisie du NIR (masqué, jamais réaffe d'obtention → « Chiffrer et enregistrer ».Import CSV possible (modèle téléchargeable).
  c. Génération : cocher les diplômes complet téléchargement du XML conforme (SHA-256affiché, rien conservé en base) → dépôt manuel sur l'espace certificateurs CDC (lien fourni).
  d. Historique : par lot — « Marquer déposé te rendu), annuler, re-télécharger, détailacceptés/rejetés par élève.

F2 — Export EUDI : l'école n'est pas concernée — l'export est déclenché par l'élève depuis son wallet.

Élève (wallet)

F1 — Accrochage CDC : non concerné — opération entièrement côté école, aucun écran dans le wallet.

F2 — Export EUDI
- Prérequis : feature active côté serveur (VCéligible (eudiExportAvailable : actif, nonrévoqué) — sinon le bouton n'apparaît pas.
- Page détail du diplôme → bloc « Portefeuillter à mon portefeuille européen (EUDI) ».
- Une modale affiche un QR code (deep link openid-credential-offer://) + un code de transaction à 5 chiffres copiable.
L'élève scanne le QR avec son app EUDI Wallet à rebours de 10 min, bouton « Régénérerl'offre » si expirée.
- Le wallet européen récupère le diplôme (SD-l'école révoque ensuite, le statut passe à «révoqué » dans le wallet via la status list.

Vérificateur / recruteur (lien public /verify/[token], sans compte)

- F1 : non concerné — l'accrochage ne produit rien sur le lien public.
- F2 : non concerné par le flux de l'app — laa vérification de base CertifyChain(signature, certificat PKI, révocation), indépendante des deux features. La vérification d'un VC EUDI présenté se ferait dans un vérificateur EUDI tiers.
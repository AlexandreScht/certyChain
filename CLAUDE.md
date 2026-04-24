# CertyChain - Project Instructions & Context

## Project Overview

**CertifyChain** est une plateforme SaaS B2B dédiée à l'émission et à la vérification de diplômes numériques. Elle s'appuie sur la cryptographie (Preuves à Divulgation Nulle / ZKP) pour garantir l'infalsifiabilité des diplômes et certifier les établissements (via des certificats PKI).

## Stack

- Framework: Next.js 16.2.4 (App Router) - _Attention: version très récente avec changements d'API possibles_
- React: React 19
- CSS: Tailwind CSS v4 (avec `@tailwindcss/postcss`)
- Animations: Framer Motion, GSAP (`@gsap/react`)
- Icons: Lucide React
- Package manager: pnpm (Workspace)
- Langage: TypeScript
- DB: [À définir ultérieurement, focus sur la landing page pour le moment]

## Commandes Principales

- **Installation :** `pnpm install`
- **Développement :** `pnpm dev` (lance le serveur sur `localhost:3000`)
- **Build :** `pnpm build`
- **Production :** `pnpm start`
- **Linting :** `pnpm lint`

## Conventions

- Toujours typer avec TypeScript strict (Typer strictement les props des composants et les retours de fonctions).
- Nommer les composants en PascalCase.
- Lancer lint avant chaque PR (`pnpm lint`).
- Ajouter la directive `"use client";` en haut de fichier **uniquement** si nécessaire (interactions, hooks d'état comme `useState`/`useEffect`/`useRef`, ou animations Framer Motion/GSAP).
- **Animations :**
  - Utilisez **Framer Motion** pour les animations déclaratives simples, les transitions de vue, et les animations au scroll.
  - Utilisez **GSAP** pour les animations complexes, les timelines séquentielles ou les effets poussés.
  - Pensez toujours à vérifier les préférences d'accessibilité (ex: `prefers-reduced-motion`).

## Architecture

- `/src/app` : pages et routes (Contient la logique de routage Next.js App Router). Par défaut, les composants ici sont des Server Components.
- `/src/components` : composants UI réutilisables (ex: `HeroSection`, `Navbar`, etc.).
- `/public` : assets statiques (images, polices, etc.).

## Décisions importantes

- On utilise les Server Components par défaut pour les performances et le SEO.
- Le design doit être **premium et dynamique** (animations fluides, glassmorphism, effet "wow" attendu).
  - Utilisez les classes utilitaires personnalisées (ex: `glass`, `glass-strong`, `neumorph-sm`, `grad-text`) déjà mises en place pour maintenir la cohérence visuelle.
- Pas de Redux, zustand seulement si nécessaire plus tard.
- **Informations Spécifiques Next.js 16 :** Attention aux breaking changes potentiels de Next.js 16. APIs, conventions, and file structure may differ. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Vault Obsidian

Vault path : C:\Users\alexa\Documents\obsidian\CertyChaine

## Règles de logging automatique dans Obsidian

### À chaque début de session

- Lire vault/context/stack.md pour reprendre le contexte
- Lire vault/logs/session-courante.md si il existe

### À chaque décision technique

Écrire dans vault/decisions/[sujet]-[date].md :

- Le problème posé
- Les options envisagées
- La décision prise et pourquoi

### À chaque bug résolu

Écrire dans vault/logs/bugs.md (en append) :

- Description du bug
- Cause identifiée
- Solution appliquée

### À chaque fin de session

Mettre à jour vault/context/session-courante.md avec :

- Ce qui a été fait
- Ce qui est en cours
- Les blocages éventuels
- Prochaines étapes

### À chaque nouvelle dépendance installée

Mettre à jour vault/context/stack.md

### Format des notes

## Toujours commencer par un frontmatter YAML :

date: [date du jour]
projet: [nom du projet]
tags: [décision/bug/session/stack]

---

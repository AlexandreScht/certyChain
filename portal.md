# CertifyChain — Portail des services

> URLs d'accès locaux (dev) et via Docker Compose.

---

## Services applicatifs

| Service | URL | Description |
|---|---|---|
| **Portail ecole** | http://localhost:3000 | Site marketing + portails école, wallet, vérification |
| **Portail eleve** | http://localhost:3001 | portails eleve, wallet |
| **Portail Admin** | http://localhost:3002 | Back-office privé (MFA TOTP requis) |
| **API Hono** | http://localhost:4000 | REST API backend |
| **Health check API** | http://localhost:4000/health | Retourne `200 OK` si le serveur est up |

---

## Outils de développement

| Outil | URL | Description |
|---|---|---|
| **Mailpit** (UI emails) | http://localhost:8025 | Capture les emails sortants (codes OTP, notifications) |
| **Mailpit** (SMTP) | localhost:1025 | Point d'entrée SMTP interne |
| **pgweb** (BDD) | http://localhost:8081 | Explorateur PostgreSQL (lecture de la base en dev) |

---

## accée comptes

| accée | URL | Description |
|---|---|---|
| **Portail École** | http://localhost:3000/ecole/login | Login admin école (argon2) |
| **Portail Wallet (élève)** | http://localhost:3001/wallet/login | Login OTP email sans mot de passe |
| **Vérification publique** | http://localhost:3000/verify/`<token>` | Page recruteur (lien généré par le seed) |

---

## Comptes de démo (après `pnpm db:seed`)

| Rôle | Identifiants | URL de connexion |
|---|---|---|
| Admin | `admin@certifychain.local` / `Admin2026Secure!` | http://localhost:3002/login |
| Admin école | `admin@ecole-demo.fr` / `DemoPassw0rd!24` | http://localhost:3000/ecole/login |
| Élève (OTP) | `alex.dubois@example.com` — code OTP dans les logs API ou Mailpit | http://localhost:3001/wallet/login |
| Lien vérification | imprimé par le seed dans la console | http://localhost:3000/verify/`<token>` |

---

## Lancer la stack

```bash
# Option A — Docker (tout-en-un)
docker compose up --build

# Option B — Dev local (PostgreSQL requis sur :5432)
pnpm db:migrate && pnpm db:seed
pnpm stack:dev          # web :3000 + api :4000 en parallèle

# Admin seul (port 3002)
pnpm --filter @certifychain/admin dev
```

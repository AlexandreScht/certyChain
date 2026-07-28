# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# CertifyChain — Wallet (Next.js) · multi-stage · standalone · distroless non-root
# Portefeuille élève. Build context = racine du workspace (lockfile + packages/).
# ─────────────────────────────────────────────────────────────────────────────

# ── Builder ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# Manifests first (better layer caching). Every workspace member's package.json
# must be present for `pnpm install --frozen-lockfile` to match the lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contract/package.json ./packages/contract/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY apps/client/web/package.json ./apps/client/web/package.json
COPY apps/client/wallet/package.json ./apps/client/wallet/package.json
COPY apps/client/admin/package.json ./apps/client/admin/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Sources: workspace packages (no-build-step, transpiled by Next), the server
# sources (type-only `AppType` import checked during `next build`), then the app.
COPY packages ./packages
COPY apps/server ./apps/server
COPY apps/client/wallet ./apps/client/wallet

# NEXT_PUBLIC_* are inlined into the client bundle at BUILD time.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Root pinning (audit 2026-07-27) — parity with `apps/client/web/Dockerfile`.
# Not consumed by any wallet source file today (only `web` renders the offline
# verifier), wired here so the three fronts share one build-arg contract and
# any future wallet-side verification UI gets the same anchor for free.
ARG NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY=
ARG NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY=
ENV NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY=$NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY
ENV NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY=$NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN pnpm --filter @certifychain/wallet build

# ── Runner (distroless, runs as uid 65532) ───────────────────────────────────
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1

# Next standalone output (monorepo): the app's server.js lives under its
# workspace path apps/client/wallet/.
COPY --from=builder --chown=65532:65532 /app/apps/client/wallet/.next/standalone ./
COPY --from=builder --chown=65532:65532 /app/apps/client/wallet/.next/static ./apps/client/wallet/.next/static
COPY --from=builder --chown=65532:65532 /app/apps/client/wallet/public ./apps/client/wallet/public

USER 65532:65532
EXPOSE 3001
CMD ["apps/client/wallet/server.js"]

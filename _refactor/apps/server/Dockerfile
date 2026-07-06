# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# CertifyChain — API (Hono) · multi-stage · single-file bundle · distroless non-root
# Build context = racine du workspace (le lockfile pnpm et packages/ y vivent).
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

# Sources needed by the server build: the API itself + the contract package
# (bundled into the single CJS file by tsup's `noExternal`).
COPY packages/contract ./packages/contract
COPY apps/server ./apps/server
RUN pnpm --filter @certifychain/server build

# ── Runner (distroless, runs as uid 65532, no shell, no package manager) ──────
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=4000

# Self-contained bundle + migration SQL only. No node_modules at runtime.
# Layout identical to the pre-refactor image: /app/dist + /app/drizzle
# (runMigrations resolves `drizzle/` from the working directory).
COPY --from=builder --chown=65532:65532 /app/apps/server/dist ./dist
COPY --from=builder --chown=65532:65532 /app/apps/server/drizzle ./drizzle

USER 65532:65532
EXPOSE 4000
CMD ["dist/server.cjs"]

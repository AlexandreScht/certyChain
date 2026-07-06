# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# CertifyChain — Web (Next.js) · multi-stage · standalone · distroless non-root
# Landing publique + portail École + page /verify.
# Build context = racine du workspace (lockfile pnpm + packages/ + apps/).
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
COPY apps/client/web ./apps/client/web

# NEXT_PUBLIC_* are inlined into the client bundle at BUILD time, so the public
# API URL must be provided as a build arg (compose passes build.args). Without
# this the bundle bakes in the localhost default and breaks in production.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN pnpm --filter @certifychain/web build

# ── Runner (distroless, runs as uid 65532) ───────────────────────────────────
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1

# Next standalone output (monorepo): the app's server.js lives under its
# workspace path apps/client/web/.
COPY --from=builder --chown=65532:65532 /app/apps/client/web/.next/standalone ./
COPY --from=builder --chown=65532:65532 /app/apps/client/web/.next/static ./apps/client/web/.next/static
COPY --from=builder --chown=65532:65532 /app/apps/client/web/public ./apps/client/web/public

USER 65532:65532
EXPOSE 3000
CMD ["apps/client/web/server.js"]

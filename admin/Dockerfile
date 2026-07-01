# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# CertifyChain — Admin (Next.js) · multi-stage · standalone · distroless non-root
# Build context = repo root (the pnpm workspace lockfile lives there).
# ─────────────────────────────────────────────────────────────────────────────

# ── Builder ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# Manifests first (better layer caching). Lockfile must exist: run `pnpm install` once.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/package.json
COPY admin/package.json ./admin/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
# NEXT_PUBLIC_* are inlined into the client bundle at BUILD time.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN pnpm --filter @certifychain/admin build

# ── Runner (distroless, runs as uid 65532) ───────────────────────────────────
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3002 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1

# Next standalone output (monorepo): the app's server.js lives under admin/.
COPY --from=builder --chown=65532:65532 /app/admin/.next/standalone ./
COPY --from=builder --chown=65532:65532 /app/admin/.next/static ./admin/.next/static
COPY --from=builder --chown=65532:65532 /app/admin/public ./admin/public

USER 65532:65532
EXPOSE 3002
CMD ["admin/server.js"]

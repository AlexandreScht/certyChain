# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# CertifyChain — API (Hono) · multi-stage · single-file bundle · distroless non-root
# Build context = repo root (le lockfile pnpm du workspace y vit).
# ─────────────────────────────────────────────────────────────────────────────

# ── Builder ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY server ./server
RUN pnpm --filter @certifychain/server build

# ── Runner (distroless, runs as uid 65532, no shell, no package manager) ──────
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=4000

# Self-contained bundle + migration SQL only. No node_modules at runtime.
COPY --from=builder --chown=65532:65532 /app/server/dist ./dist
COPY --from=builder --chown=65532:65532 /app/server/drizzle ./drizzle

USER 65532:65532
EXPOSE 4000
CMD ["dist/server.cjs"]

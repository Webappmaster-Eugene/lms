# ──────────────────────────────────────────────
# Stage 1: base — shared Alpine image with Node 20
# ──────────────────────────────────────────────
FROM node:20-alpine AS base

# ──────────────────────────────────────────────
# Stage 2: deps — install ALL dependencies
# ──────────────────────────────────────────────
FROM base AS deps

# libc6-compat required for sharp / esbuild native bindings on Alpine
RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN corepack enable pnpm \
    && pnpm i --frozen-lockfile

# ──────────────────────────────────────────────
# Stage 3: builder — build Next.js + Payload CMS
# ──────────────────────────────────────────────
FROM base AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Payload reads PAYLOAD_SECRET during next build (type generation / import map).
# Dummy value here; real secret is injected at runtime via docker-compose env.
ARG PAYLOAD_SECRET=build-time-placeholder-secret-min-32-chars
ENV PAYLOAD_SECRET=${PAYLOAD_SECRET}

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time.
# Pass the production URL as a build arg so it's baked into the JS bundle.
ARG NEXT_PUBLIC_SERVER_URL=http://localhost:3000
ENV NEXT_PUBLIC_SERVER_URL=${NEXT_PUBLIC_SERVER_URL}

ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable pnpm \
    && pnpm run build

# ──────────────────────────────────────────────
# Stage 4: runner — minimal production image
# ──────────────────────────────────────────────
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Public assets (icons, static files)
COPY --from=builder /app/public ./public

# Pre-create .next dir with correct ownership for prerender cache
RUN mkdir .next \
    && chown nextjs:nodejs .next

# Standalone output (server.js + minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Media directory for Payload uploads (mounted as Docker volume)
RUN mkdir -p media \
    && chown nextjs:nodejs media

# curl for healthcheck
RUN apk add --no-cache curl

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -sf http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]

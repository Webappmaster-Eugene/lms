# ──────────────────────────────────────────────
# Stage 1: base — shared Alpine image with Node 22
# ──────────────────────────────────────────────
# Node 22, а не 20: isolated-vm (песочница тренажёра) требует V8 из Node 22 —
# под Node 20 он не собирается, там нет v8::SourceLocation. Node 20 к тому же
# уже вне поддержки, а локальная разработка идёт на 22.
FROM node:22-alpine AS base

# libc6-compat required for sharp / esbuild native bindings on Alpine.
# Installed in base so all stages (deps, builder, runner) inherit it.
RUN apk add --no-cache libc6-compat

# ──────────────────────────────────────────────
# Stage 2: deps — install ALL dependencies
# ──────────────────────────────────────────────
FROM base AS deps

WORKDIR /app

# Тулчейн для сборки isolated-vm: готовых бинарников под musl нет, модуль
# собирается из исходников и требует компилятор с поддержкой C++20.
RUN apk add --no-cache python3 make g++ linux-headers

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Образ собирается на Raspberry Pi по Wi-Fi, и в те же минуты сборщик отправляет на
# сервер готовые образы соседних сервисов. Трёх попыток pnpm по умолчанию при такой
# просадке канала не хватает: 12.10.2026 установка упала по ETIMEDOUT на одном пакете
# из 1081. Стор лежит в кеше сборщика, поэтому повторная сборка докачивает
# недостающее, а не начинает заново.
RUN --mount=type=cache,id=lms-pnpm-store,target=/pnpm-store \
    corepack enable pnpm \
    && pnpm i --frozen-lockfile --store-dir=/pnpm-store \
        --fetch-retries=8 --fetch-timeout=180000 --network-concurrency=8

# Пакеты, которые нужны песочнице тренажёра в рантайме, но которых нет в
# standalone-выводе Next: компилятор/изолят подгружаются отдельным раннером,
# а официальный SDK проверки пароля — нативным динамическим import.
#
# Копируется каталог пакета ИЗ СТОРА pnpm целиком: рядом с самим пакетом там
# лежат и его зависимости (isolated-vm подгружает node-gyp-build уже в рантайме).
# Ключ -L разыменовывает символьные ссылки — в рантайм-образе .pnpm не будет.
RUN mkdir -p /runtime-deps \
    && cp -RL node_modules/.pnpm/isolated-vm@*/node_modules/. /runtime-deps/ \
    && cp -RL node_modules/.pnpm/typescript@*/node_modules/. /runtime-deps/ \
    && cp -RL node_modules/.pnpm/payload@*/node_modules/. /runtime-deps/ \
    && rm -f /runtime-deps/isolated-vm/*.tgz

# ──────────────────────────────────────────────
# Stage 3: builder — build Next.js + Payload CMS
# ──────────────────────────────────────────────
FROM deps AS builder

WORKDIR /app
COPY . .

# Ensure public dir exists even if git doesn't track it (no files inside)
RUN mkdir -p public

# Ассеты Monaco (public/monaco/vs) и вшитый харнесс тренажёра генерируются
# скриптами. Запускаются явно: `npx next build` ниже идёт мимо npm-скриптов,
# поэтому хук prebuild не сработает.
RUN node scripts/copy-monaco.mjs \
    && node scripts/build-harness.mjs

# Payload reads PAYLOAD_SECRET during next build (type generation / import map).
# Dummy value here; real secret is injected at runtime via docker-compose env.
ARG PAYLOAD_SECRET=build-time-placeholder-secret-min-32-chars
ENV PAYLOAD_SECRET=${PAYLOAD_SECRET}

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time.
# Pass the production URL as a build arg so it's baked into the JS bundle.
ARG NEXT_PUBLIC_SERVER_URL=http://localhost:3000
ENV NEXT_PUBLIC_SERVER_URL=${NEXT_PUBLIC_SERVER_URL}

ENV NEXT_TELEMETRY_DISABLED=1

# Limit Node.js heap to prevent OOM kills on memory-constrained build servers.
# Next.js + Payload CMS compilation is very memory-intensive.
ENV NODE_OPTIONS=--max-old-space-size=2048

# Линтер и проверка типов уже прошли до push (`pnpm smoke`, CI). На сборщике под
# эмуляцией этот шаг занимал ~40 минут и исчерпывал память: 13.10.2026 сборщик завис
# на нём, и выкат упал. Причина и условие — в next.config.mjs.
ENV LMS_SKIP_BUILD_CHECKS=1

# Sentry: имя релиза и загрузка source maps браузерного кода. Токен приходит
# BuildKit-секретом (compose: build.secrets) и не остаётся ни в слоях, ни в истории
# образа. Без токена сборка та же, а стек браузерных ошибок в Sentry будет сжатым.
ARG SENTRY_RELEASE=
ARG SENTRY_ORG=
ARG SENTRY_PROJECT=
ENV SENTRY_RELEASE=${SENTRY_RELEASE} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT=${SENTRY_PROJECT}

# Source maps удаляет и плагин Sentry, но публичными они стали бы при его сбое:
# .next/static раздаётся без входа, поэтому удаляем их здесь ещё раз.
RUN --mount=type=secret,id=sentry_auth_token,required=false \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" npx next build \
    && find .next/static -name '*.map' -delete

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

# Песочница тренажёра. Скрипт раннера запускается как отдельный процесс и в
# граф импортов Next не входит, поэтому трассировка standalone его не увидит —
# копируем явно вместе с двумя пакетами, которые он подгружает сам.
COPY --from=builder --chown=nextjs:nodejs /app/src/server/trainer ./src/server/trainer
COPY --from=deps --chown=nextjs:nodejs /runtime-deps ./node_modules

# Проверка песочницы на этапе сборки: если нативный модуль не собрался или
# не доехал до образа, сборка должна упасть здесь, а не у пользователя при
# первой же отправке решения.
RUN node --no-node-snapshot -e "\
const ivm = require('isolated-vm'); \
const isolate = new ivm.Isolate({ memoryLimit: 16 }); \
const context = isolate.createContextSync(); \
if (context.evalSync('1 + 1') !== 2) { throw new Error('изолят не считает') } \
if (context.evalSync('typeof process') !== 'undefined') { throw new Error('изолят видит хост') } \
isolate.dispose(); \
require('typescript'); \
require('node:fs').accessSync('/app/src/server/trainer/runner-child.mjs'); \
require('node:fs').accessSync('/app/src/server/trainer/typescript-service.mjs'); \
require('node:fs').accessSync('/app/public/monaco/vs'); \
console.log('Песочница тренажёра и ассеты Monaco на месте')"

# Динамический import SDK не виден трассировке Next. Проверяем его именно
# в standalone-образе, где нет node_modules исходного репозитория.
RUN node --input-type=module -e "\
import { createRequire } from 'node:module'; \
import { pathToFileURL } from 'node:url'; \
const sdkURL = new URL('./auth/strategies/local/authenticate.js', pathToFileURL(createRequire('/app/package.json').resolve('payload'))); \
const { authenticateLocalStrategy } = await import(sdkURL.href); \
if (await authenticateLocalStrategy({ doc: { id: 1, salt: 'build-check', hash: '00' }, password: 'build-check' })) { throw new Error('SDK принимает неверный пароль') }"

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

COPY --chown=nextjs:nodejs scripts/trainer-app-start.mjs ./scripts/trainer-app-start.mjs
COPY --chown=nextjs:nodejs trainer-runtime/auth-token.mjs ./trainer-runtime/auth-token.mjs

CMD ["node", "scripts/trainer-app-start.mjs"]

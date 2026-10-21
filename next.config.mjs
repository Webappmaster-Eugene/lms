import { withPayload } from '@payloadcms/next/withPayload'
import { withSentryConfig } from '@sentry/nextjs/config'

// Образ собирается на Raspberry Pi под эмуляцией amd64: линтер и проверка типов внутри
// `next build` идут там около сорока минут и упираются в память сборщика — он зависает,
// и выкат падает. Обе проверки обязательны до push (`pnpm smoke`) и повторяются в CI,
// поэтому Dockerfile их отключает; локальная сборка и smoke проверяют всё как раньше.
const skipBuildChecks = process.env.LMS_SKIP_BUILD_CHECKS === '1'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // «X-Powered-By: Next.js, Payload» — готовая подсказка сканерам уязвимостей. При false
  // заголовок не ставит ни Next, ни withPayload.
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: skipBuildChecks },
  eslint: { ignoreDuringBuilds: skipBuildChecks },

  // OTel обращается к fs/net/tls и подгружает перехватчики динамическим require —
  // через webpack он не проходит: в sdk-trace-base 2.9+ реализация заменена на
  // shim-реэкспорт, и после сборки BasicTracerProvider оказывается undefined
  serverExternalPackages: [
    '@opentelemetry/api',
    '@opentelemetry/api-logs',
    '@opentelemetry/auto-instrumentations-node',
    '@opentelemetry/exporter-logs-otlp-http',
    '@opentelemetry/exporter-metrics-otlp-http',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/resources',
    '@opentelemetry/sdk-logs',
    '@opentelemetry/sdk-metrics',
    '@opentelemetry/sdk-node',
    '@opentelemetry/semantic-conventions',
    'require-in-the-middle',
    'import-in-the-middle',
    // Нативный модуль V8-изолятов: бандлер его не соберёт, он должен
    // подгружаться из node_modules как есть
    'isolated-vm',
    // Компилятору нужны файлы lib.*.d.ts из своего пакета — через бандл
    // они не доезжают
    'typescript',
  ],

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          // Срок короткий, пока HSTS обкатывается: если HTTPS сломается, браузер не пустит на сайт до его конца.
          { key: 'Strict-Transport-Security', value: 'max-age=86400' },
          // Полноэкранный режим (слайды, видео, роадмап) и буфер обмена («Поделиться») нужны — их не ограничиваем.
          {
            key: 'Permissions-Policy',
            value: 'accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/api/media/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'Vary', value: 'Cookie, Authorization' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        source: '/monaco/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, must-revalidate' }],
      },
      {
        source: '/fonts/inter/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // Админке общий CSP не подходит (свои скрипты и стили Payload), но встраивать её
        // во фрейм нельзя: иначе кликджекинг действий администратора
        source: '/admin/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        source: '/((?!admin|api).*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            // Плеер берёт видео с CDN Яндекса, а тот отвечает 403 на запрос с чужим
            // referer. Повторные Range-запросы (хвост файла, перемотка) браузер шлёт
            // уже вне цепочки редиректов, поэтому referer снимаем на уровне документа.
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "frame-src 'self' https://miro.com https://www.youtube.com https://youtube.com",
              "connect-src 'self'",
              // blob: нужен плееру MPEG-TS: mpegts.js отдаёт видео через MediaSource,
              // а его поток адресуется blob-ссылкой
              "media-src 'self' https: blob:",
              "worker-src 'self' blob:",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

const configWithPayload = withPayload(nextConfig)
const headersWithPayload = configWithPayload.headers
const themeHintKeys = new Set(['Accept-CH', 'Vary', 'Critical-CH'])

const configWithHeaders = {
  ...configWithPayload,
  async headers() {
    const rules = await headersWithPayload()
    return rules.flatMap((rule, index) => {
      // Payload добавляет этот набор последним. На учебных страницах Critical-CH
      // вызывает повторный запрос, хотя их тема определяется в браузере.
      const isPayloadThemeBundle = index === rules.length - 1 && rule.source === '/:path*'
        && [...themeHintKeys].every((key) => rule.headers.some((header) => header.key === key && header.value === 'Sec-CH-Prefers-Color-Scheme'))
      if (!isPayloadThemeBundle) return [rule]
      const themeHints = rule.headers.filter((header) => themeHintKeys.has(header.key) && header.value === 'Sec-CH-Prefers-Color-Scheme')
      const otherHeaders = rule.headers.filter((header) => !themeHints.includes(header))
      return [
        ...(otherHeaders.length ? [{ ...rule, headers: otherHeaders }] : []),
        { ...rule, source: '/admin/:path*', headers: themeHints },
      ]
    })
  },
}

// Source maps уходят в Sentry только при заданном SENTRY_AUTH_TOKEN (сборка в
// Dokploy) и удаляются из образа после загрузки: исходники платформы не
// раздаются браузерам. Без токена сборка та же, отчёты просто со сжатым стеком.
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT)

export default withSentryConfig(configWithHeaders, {
  // Свой GlitchTip (errors.nadtocheev.ru); без SENTRY_URL плагин грузил бы в sentry.io.
  sentryUrl: process.env.SENTRY_URL || undefined,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !uploadSourceMaps,
  telemetry: false,
  sourcemaps: { disable: !uploadSourceMaps, deleteSourcemapsAfterUpload: true },
  // В образе нет .git: версию передаёт сборка (SENTRY_RELEASE), коммиты не связываем.
  release: { name: process.env.SENTRY_RELEASE || undefined, create: uploadSourceMaps, finalize: uploadSourceMaps, setCommits: false },
  widenClientFileUpload: true,
  // Ошибки сервера ловит onRequestError в instrumentation.ts, трассы — наш OTel.
  // Обёртки Sentry вокруг каждого серверного компонента дали бы только лишние спаны.
  webpack: {
    autoInstrumentServerFunctions: false,
    autoInstrumentMiddleware: false,
    autoInstrumentAppDirectory: false,
  },
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeTracing: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
})

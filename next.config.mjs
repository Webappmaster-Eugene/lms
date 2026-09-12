import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  // OTel обращается к fs/net/tls и подгружает перехватчики динамическим require —
  // через webpack он не проходит: в sdk-trace-base 2.9+ реализация заменена на
  // shim-реэкспорт, и после сборки BasicTracerProvider оказывается undefined
  serverExternalPackages: [
    '@opentelemetry/api',
    '@opentelemetry/api-logs',
    '@opentelemetry/auto-instrumentations-node',
    '@opentelemetry/exporter-logs-otlp-http',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/resources',
    '@opentelemetry/sdk-logs',
    '@opentelemetry/sdk-node',
    '@opentelemetry/semantic-conventions',
    'require-in-the-middle',
    'import-in-the-middle',
  ],

  async headers() {
    return [
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
              "frame-src https://miro.com https://www.youtube.com https://youtube.com",
              "connect-src 'self'",
              "media-src 'self' https:",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default withPayload(nextConfig)

export type SentryDsn = {
  readonly dsn: string
  readonly publicKey: string
  readonly projectId: string
  /** Адрес приёма конвертов: `https://host[/path]/api/<project>/envelope/`. */
  readonly envelopeUrl: string
}

/**
 * Разбирает DSN вида `https://<key>@<host>[/<path>]/<project>`. Ошибка формата
 * не должна ронять приложение: трекер просто остаётся выключенным.
 */
export function parseSentryDsn(value: string | undefined): SentryDsn | null {
  const dsn = value?.trim()
  if (!dsn) return null
  try {
    const url = new URL(dsn)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    const publicKey = decodeURIComponent(url.username)
    const segments = url.pathname.split('/').filter(Boolean)
    const projectId = segments.pop()
    if (!publicKey || url.password || !projectId || !/^\d+$/.test(projectId)) return null
    const prefix = segments.length ? `/${segments.join('/')}` : ''
    return { dsn, publicKey, projectId, envelopeUrl: `${url.protocol}//${url.host}${prefix}/api/${projectId}/envelope/` }
  } catch {
    return null
  }
}

export function serverSentryDsn(): SentryDsn | null {
  return parseSentryDsn(process.env.SENTRY_DSN)
}

/**
 * Куда туннель шлёт отчёты браузера. Отдельный ключ того же проекта со своим
 * лимитом в Sentry не даст мусорным отчётам из открытого туннеля выесть квоту
 * серверных ошибок. Без него — общий SENTRY_DSN.
 */
export function browserSentryDsn(): SentryDsn | null {
  return parseSentryDsn(process.env.SENTRY_BROWSER_DSN) ?? serverSentryDsn()
}

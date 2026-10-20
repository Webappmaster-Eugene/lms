/**
 * Очистка текстов и событий трекера ошибок от персональных данных и секретов.
 * Модуль без зависимостей: тот же код работает в браузере, на сервере и в edge.
 *
 * В Sentry уходит то, что видит любой участник проекта, и хранится там дольше,
 * чем логи контейнера. Поэтому письма, токены сброса пароля, подписанные ссылки
 * и параметры SQL вырезаются до отправки, а не фильтрами на стороне Sentry.
 */

// Длины частей адреса ограничены не ради RFC: без верхней границы строка без
// пробелов и «@» разбирается за квадратичное время, и 100 КБ текста ошибки
// блокировали процесс на секунды прямо в beforeSend.
const EMAIL = /[^\s@<>"'(),;:/[\]]{1,64}@[^\s@<>"'(),;:/]{1,253}\.[a-z]{2,}/gi
const BEARER = /\b(Bearer|JWT)\s+[A-Za-z0-9._~+/=-]+/g
// Payload, Next и наши подписи кладут токены как JWT или длинные hex/base64url.
const JWT_LIKE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)?/g
// Ключ с любым префиксом (access_token, resetPasswordToken, x-api-key), в том числе
// в кавычках, как в JSON-теле, попавшем в текст ошибки.
const SECRET_PAIR = /(["']?)\b([\w-]{0,40}(?:token|secret|password|passwd|authorization|cookie|api[-_]?key|private[-_]?key|sentry_key|signature)|public_key|sig)\1\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;&}]+)/gi
const URL_WITH_PARTS = /\b(https?|wss?|postgres(?:ql)?|rediss?|smtps?):\/\/([^\s"'<>]+)/gi
// Drizzle кладёт в сообщение «Failed query: <sql>\nparams: <значения>» — сам запрос
// помогает найти место, а значения могут оказаться токеном или адресом ученика.
const SQL_PARAMS = /(\bparams|\bparameters)\s*:\s*[\s\S]*$/i
const SENSITIVE_KEY = /pass(?:word|wd)?|secret|token|cookie|authorization|api[-_]?key|private|session|^email$|e-?mail|signature/i

// Токены в самом пути: комната собеседования (/trainer/interview/<uuid>) пускает
// любого вошедшего, превью тренажёра — по lease-токену. Слаги курсов — строчные
// слова через дефис, под эти шаблоны они не попадают.
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_SEGMENT = /^[0-9a-f]{32,}$/i
const OPAQUE_SEGMENT = /^(?=[\w-]*[A-Z])(?=[\w-]*\d)[\w-]{24,}$/
const TOKEN_PARENTS = new Set(['interview', 'preview', 'preview-release', 'unsubscribe'])

function redactPathSegments(pathname: string): string {
  const segments = pathname.split('/')
  return segments
    .map((segment, index) => {
      if (!segment) return segment
      const parent = segments[index - 1] ?? ''
      if (UUID_SEGMENT.test(segment) || HEX_SEGMENT.test(segment) || OPAQUE_SEGMENT.test(segment)) return '[token]'
      return TOKEN_PARENTS.has(parent) && segment.length >= 16 ? '[token]' : segment
    })
    .join('/')
}

function redactUrl(_match: string, scheme: string, rest: string): string {
  const atIndex = rest.indexOf('@')
  const slashIndex = rest.indexOf('/')
  // Логин и пароль в DSN БД или Redis — до первого «/» после схемы.
  const withoutCredentials = atIndex !== -1 && (slashIndex === -1 || atIndex < slashIndex) ? `[redacted]@${rest.slice(atIndex + 1)}` : rest
  const queryIndex = withoutCredentials.search(/[?#]/)
  const beforeQuery = queryIndex === -1 ? withoutCredentials : withoutCredentials.slice(0, queryIndex)
  const pathStart = beforeQuery.indexOf('/')
  const location = pathStart === -1 ? beforeQuery : `${beforeQuery.slice(0, pathStart)}${redactPathSegments(beforeQuery.slice(pathStart))}`
  return `${scheme}://${location}${queryIndex === -1 ? '' : '?[redacted]'}`
}

/** Убирает из произвольного текста адреса почты, токены, учётные данные в ссылках и параметры SQL. */
export function redactText(value: string): string {
  return value
    .replace(SQL_PARAMS, '$1: [redacted]')
    .replace(URL_WITH_PARTS, redactUrl)
    .replace(BEARER, '$1 [redacted]')
    .replace(JWT_LIKE, '[redacted token]')
    .replace(SECRET_PAIR, '$2=[redacted]')
    .replace(EMAIL, '[redacted email]')
}

/** Путь страницы без query, hash и токенов в сегментах пути. */
export function redactUrlPath(value: string): string {
  if (!value) return value
  const relative = !/^[a-z][a-z0-9+.-]*:\/\//i.test(value)
  try {
    const url = new URL(value, 'https://lms.invalid')
    const suffix = url.search || url.hash ? '?[redacted]' : ''
    const pathname = redactPathSegments(url.pathname)
    return relative ? `${pathname}${suffix}` : `${url.origin}${pathname}${suffix}`
  } catch {
    return redactText(value.split(/[?#]/)[0] ?? '')
  }
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key)
}

/**
 * Рекурсивно чистит данные контекста: чувствительные ключи вырезаются целиком,
 * строки — через redactText. Глубина ограничена, чтобы циклические и огромные
 * объекты не превращали отправку ошибки в новую ошибку.
 */
export function redactData(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactText(value)
  if (value === null || typeof value !== 'object') return value
  if (depth >= 5) return '[depth limit]'
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactData(item, depth + 1))

  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    result[key] = isSensitiveKey(key) ? '[redacted]' : redactData(item, depth + 1)
  }
  return result
}

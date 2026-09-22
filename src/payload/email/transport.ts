import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import nodemailer from 'nodemailer'

const IMPLICIT_TLS_PORT = 465
const DEFAULT_SMTP_PORT = IMPLICIT_TLS_PORT

const CONNECTION_TIMEOUT_MS = 10_000
const GREETING_TIMEOUT_MS = 10_000
const SOCKET_TIMEOUT_MS = 20_000

type SmtpSettings = {
  readonly host: string
  readonly port: number
  readonly user: string
  readonly pass: string
  readonly fromAddress: string
  readonly fromName: string
}

/** Ошибка в самих переменных SMTP, а не в работе почтового сервера. */
class SmtpConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SmtpConfigError'
  }
}

/**
 * Конфиг Payload инициализируется на каждом обращении к нему, поэтому одна
 * и та же жалоба на настройки иначе пишется в лог на каждый запрос и топит
 * в себе всё остальное.
 */
const reportedProblems = new Set<string>()

/** Запоминает проблему и возвращает `false`, если о ней уже сообщали. */
function registerProblem(message: string): boolean {
  if (reportedProblems.has(message)) return false

  reportedProblems.add(message)

  return true
}

function reportFailureOnce(message: string): void {
  if (registerProblem(message)) console.error(message)
}

function reportWarningOnce(message: string): void {
  if (registerProblem(message)) console.warn(message)
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new SmtpConfigError(
      `SMTP_HOST is set, but ${name} is missing or empty. ` +
        'Set every SMTP_* variable, or clear SMTP_HOST to disable outgoing email entirely.',
    )
  }

  return value
}

function parsePort(raw: string | undefined): number {
  if (!raw) return DEFAULT_SMTP_PORT

  const port = Number(raw)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new SmtpConfigError(
      `Invalid SMTP_PORT: "${raw}". Expected an integer between 1 and 65535.`,
    )
  }

  return port
}

/**
 * Пустой `SMTP_HOST` — штатный режим «почта выключена», возвращает `null`.
 * Заданный `SMTP_HOST` с неполными настройками — `SmtpConfigError`.
 */
function readSmtpSettings(): SmtpSettings | null {
  const host = process.env.SMTP_HOST?.trim()

  if (!host) return null

  const user = requireEnv('SMTP_USER')
  const pass = requireEnv('SMTP_PASS')
  const port = parsePort(process.env.SMTP_PORT?.trim())

  const fromAddress = process.env.EMAIL_FROM_ADDRESS?.trim() || user
  const fromName = process.env.EMAIL_FROM_NAME?.trim() || 'MentorCareer LMS'

  if (fromAddress.toLowerCase() !== user.toLowerCase()) {
    // 553 Sender address rejected, если From не алиас ящика аутентификации.
    reportWarningOnce(
      `[email] EMAIL_FROM_ADDRESS (${fromAddress}) differs from SMTP_USER (${user}). ` +
        'This works only if the From address is a verified alias of the authenticated mailbox.',
    )
  }

  return { host, port, user, pass, fromAddress, fromName }
}

/**
 * Сломанные настройки почты выключают почту, а не приложение. Адаптер
 * собирается при инициализации конфига Payload, то есть на пути любого
 * запроса: исключение отсюда превращает опечатку в одной переменной в отказ
 * всего сайта, включая курсы и тренажёр, которым почта не нужна. Тихо
 * проглотить тоже нельзя — письма восстановления пароля перестают доходить
 * незаметно, поэтому причина пишется в лог как ошибка.
 */
export function buildEmailAdapter(): ReturnType<typeof nodemailerAdapter> | undefined {
  let settings: SmtpSettings | null

  try {
    settings = readSmtpSettings()
  } catch (error) {
    if (!(error instanceof SmtpConfigError)) throw error

    reportFailureOnce(
      `[email] Outgoing email is DISABLED: ${error.message} ` +
        'Password resets and notifications will not be delivered until this is fixed.',
    )

    return undefined
  }

  if (!settings) return undefined

  const secure = settings.port === IMPLICIT_TLS_PORT

  return nodemailerAdapter({
    defaultFromAddress: settings.fromAddress,
    defaultFromName: settings.fromName,
    transport: nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure,
      // Без этого nodemailer отправит логин и пароль открытым текстом,
      // если сервер не анонсирует STARTTLS.
      requireTLS: !secure,
      auth: {
        user: settings.user,
        pass: settings.pass,
      },
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: GREETING_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
    }),
  })
}

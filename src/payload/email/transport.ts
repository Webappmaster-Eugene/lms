import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import nodemailer from 'nodemailer'

/**
 * Порт с implicit TLS: соединение шифруется сразу, без STARTTLS.
 * Рекомендованный порт VK WorkSpace (smtp.mail.ru) и Яндекса.
 */
const IMPLICIT_TLS_PORT = 465

/** Порт submission: соединение открывается в открытую и апгрейдится через STARTTLS. */
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

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(
      `SMTP is partially configured: SMTP_HOST is set, but ${name} is missing or empty. ` +
        'Set every SMTP_* variable, or clear SMTP_HOST to disable outgoing email entirely.',
    )
  }

  return value
}

function parsePort(raw: string | undefined): number {
  if (!raw) return DEFAULT_SMTP_PORT

  const port = Number(raw)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid SMTP_PORT: "${raw}". Expected an integer between 1 and 65535.`)
  }

  return port
}

/**
 * Читает SMTP-настройки из окружения.
 *
 * Возвращает `null`, если `SMTP_HOST` не задан — это штатный режим «почта выключена»
 * (локальная разработка, сборка образа). Если же `SMTP_HOST` задан, но остальные
 * переменные нет — бросает исключение: тихо не отправлять письма хуже, чем не стартовать.
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
    // VK WorkSpace и Яндекс отвергают письмо (553 Sender address rejected), если
    // From не совпадает с ящиком аутентификации и не является его подтверждённым алиасом.
    console.warn(
      `[email] EMAIL_FROM_ADDRESS (${fromAddress}) differs from SMTP_USER (${user}). ` +
        'This works only if the From address is a verified alias of the authenticated mailbox.',
    )
  }

  return { host, port, user, pass, fromAddress, fromName }
}

/**
 * Собирает email-адаптер Payload поверх nodemailer.
 * Возвращает `undefined`, если почта намеренно выключена.
 */
export function buildEmailAdapter(): ReturnType<typeof nodemailerAdapter> | undefined {
  const settings = readSmtpSettings()

  if (!settings) return undefined

  const secure = settings.port === IMPLICIT_TLS_PORT

  return nodemailerAdapter({
    defaultFromAddress: settings.fromAddress,
    defaultFromName: settings.fromName,
    transport: nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure,
      // На submission-порту форсируем STARTTLS: без этого nodemailer молча
      // отправит логин и пароль открытым текстом, если сервер не анонсирует TLS.
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

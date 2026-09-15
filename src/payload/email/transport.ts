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
 * Пустой `SMTP_HOST` — штатный режим «почта выключена», возвращает `null`.
 * Заданный `SMTP_HOST` с неполными настройками — исключение: тихо не отправлять
 * письма хуже, чем не стартовать.
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
    console.warn(
      `[email] EMAIL_FROM_ADDRESS (${fromAddress}) differs from SMTP_USER (${user}). ` +
        'This works only if the From address is a verified alias of the authenticated mailbox.',
    )
  }

  return { host, port, user, pass, fromAddress, fromName }
}

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

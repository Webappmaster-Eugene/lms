export const MAX_BROADCAST_ATTEMPTS = 5

export type BroadcastSendOutcome = {
  status: 'sent' | 'failed' | 'pending'
  /** Короткий код без адресов и текста ответа сервера: его видит администратор. */
  error: string | null
  retryDelay: number
  /**
   * Сбой не про конкретного получателя (SMTP недоступен, отозван пароль): остальные
   * письма прогона тоже не уйдут, а попытку получателю засчитывать нельзя — иначе
   * ночной простой почты навсегда пометит всю рассылку неудачной.
   */
  transportDown: boolean
}

/** Пауза всей отправки, пока почтовый сервер недоступен. */
export const TRANSPORT_PAUSE_MS = 10 * 60_000

const TRANSPORT_CODES = new Set(['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ETLS', 'EPROTOCOL', 'ECONNRESET', 'ECONNREFUSED'])
// 421 — сервис недоступен, 454 — временный отказ TLS/авторизации, 530/534/535 — логин или пароль.
const TRANSPORT_RESPONSES = new Set([421, 454, 530, 534, 535])
const AUTH_RESPONSES = new Set([530, 534, 535])

function smtpResponseCode(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('responseCode' in error)) return null
  const code = error.responseCode
  return typeof code === 'number' && Number.isInteger(code) ? code : null
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  return typeof error.code === 'string' && /^[A-Z_]{2,32}$/.test(error.code) ? error.code : null
}

/**
 * 550–554 и отказ во всех получателях — адрес не примут и завтра, повтор только
 * съест лимит ящика. Недоступный SMTP или неверный пароль ящика — общая беда всех
 * писем: пауза без списания попытки. Остальные 4xx (ящик переполнен, временная
 * ошибка у получателя) повторяем с растущей паузой.
 */
export function broadcastSendOutcome(error: unknown, attempt: number): BroadcastSendOutcome {
  if (error === null || error === undefined) return { status: 'sent', error: null, retryDelay: 0, transportDown: false }
  const response = smtpResponseCode(error)
  const code = errorCode(error)
  if ((response !== null && response >= 550 && response <= 554) || code === 'EENVELOPE') {
    return { status: 'failed', error: response !== null ? `smtp_${response}` : 'rejected', retryDelay: 0, transportDown: false }
  }
  const auth = code === 'EAUTH' || (response !== null && AUTH_RESPONSES.has(response))
  const label = auth ? 'auth' : code === 'ETIMEDOUT' ? 'timeout' : response !== null ? `smtp_${response}` : code ? 'network' : 'unknown'
  if (auth || (code !== null && TRANSPORT_CODES.has(code)) || (response !== null && TRANSPORT_RESPONSES.has(response))) {
    return { status: 'pending', error: label, retryDelay: TRANSPORT_PAUSE_MS, transportDown: true }
  }
  return {
    status: attempt < MAX_BROADCAST_ATTEMPTS ? 'pending' : 'failed',
    error: label,
    // 5, 15, 45, 135 минут: временные отказы почтовых серверов обычно длятся часы, а не секунды.
    retryDelay: Math.min(86_400_000, 300_000 * 3 ** Math.max(0, attempt - 1)),
    transportDown: false,
  }
}

const ERROR_LABELS: Readonly<Record<string, string>> = {
  rejected: 'адрес отклонён почтовым сервером',
  timeout: 'почтовый сервер не ответил вовремя',
  auth: 'почтовый сервер не принял логин или пароль',
  network: 'нет соединения с почтовым сервером',
  unknown: 'неизвестная ошибка отправки',
  unsubscribed: 'получатель отписался от рассылок',
  inactive: 'аккаунт отключён',
  no_email: 'у аккаунта нет адреса',
  cancelled: 'рассылка остановлена',
}

export function broadcastErrorLabel(code: string | null | undefined): string {
  if (!code) return ''
  const smtp = /^smtp_(\d{3})$/.exec(code)
  if (smtp) return Number(smtp[1]) >= 550 ? `адрес отклонён почтовым сервером (${smtp[1]})` : `почтовый сервер временно отказал (${smtp[1]})`
  return ERROR_LABELS[code] ?? code
}

import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Робокасса: ссылка на оплату, проверка ResultURL/SuccessURL и сверка через OpStateExt.
 * Модуль без Payload и базы. Пароли магазина нигде не логируются и не попадают в тексты ошибок.
 */

export type RobokassaHash = 'md5' | 'sha256'

export type RobokassaConfig = {
  merchantLogin: string
  password1: string
  password2: string
  isTest: boolean
  hash: RobokassaHash
}

const PAY_URL = 'https://auth.robokassa.ru/Merchant/Index.aspx'
const OP_STATE_URL = 'https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt'
const OP_STATE_TIMEOUT_MS = 10_000
const MAX_INV_ID = 2_147_483_647
const MAX_DESCRIPTION = 100
const MAX_ITEM_NAME = 128
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000

/**
 * Без логина или паролей текущего режима оплата не подключена (null). У тестового режима
 * свои пароли (ROBOKASSA_TEST_PASSWORD1/2): храним оба набора, режим меняет ROBOKASSA_IS_TEST.
 * Опечатка в хеше - ошибка сразу, а не тихое отключение.
 */
export function robokassaConfig(env: NodeJS.ProcessEnv = process.env): RobokassaConfig | null {
  const merchantLogin = env.ROBOKASSA_MERCHANT_LOGIN?.trim() ?? ''
  const test = env.ROBOKASSA_IS_TEST?.trim().toLowerCase()
  const isTest = test === '1' || test === 'true'
  const password1 = (isTest ? env.ROBOKASSA_TEST_PASSWORD1 : env.ROBOKASSA_PASSWORD1)?.trim() ?? ''
  const password2 = (isTest ? env.ROBOKASSA_TEST_PASSWORD2 : env.ROBOKASSA_PASSWORD2)?.trim() ?? ''
  if (!merchantLogin || !password1 || !password2) return null
  const hash = (env.ROBOKASSA_HASH?.trim().toLowerCase() || 'sha256')
  if (hash !== 'md5' && hash !== 'sha256') {
    throw new Error('ROBOKASSA_HASH должен быть md5 или sha256')
  }
  return { merchantLogin, password1, password2, isTest, hash }
}

export function signatureHash(hash: RobokassaHash, text: string): string {
  return createHash(hash).update(text, 'utf8').digest('hex')
}

/** Копейки в строку рублей без float-арифметики: 4500000 -> '45000.00'. */
export function formatOutSum(amountKopecks: number): string {
  if (!Number.isSafeInteger(amountKopecks) || amountKopecks <= 0) {
    throw new Error('Сумма платежа должна быть целым положительным числом копеек')
  }
  const rubles = Math.floor(amountKopecks / 100)
  return `${rubles}.${String(amountKopecks % 100).padStart(2, '0')}`
}

/** Сумма из уведомления Робокассы: в бою шесть знаков после точки, в тесте два. Всё сомнительное - null. */
export function parseOutSum(value: string): number | null {
  if (typeof value !== 'string' || value.length > 20) return null
  const match = /^(\d{1,15})(?:\.(\d{1,6}))?$/.exec(value)
  if (!match) return null
  const fraction = (match[2] ?? '').padEnd(6, '0')
  if (fraction.slice(2) !== '0000') return null
  const kopecks = Number(match[1]) * 100 + Number(fraction.slice(0, 2))
  return Number.isSafeInteger(kopecks) ? kopecks : null
}

export type ReceiptItem = {
  name: string
  quantity: number
  /** Сумма позиции в рублях (не в копейках). */
  sum: number
  payment_method: 'full_payment' | 'full_prepayment'
  payment_object: 'service'
  tax: 'none'
}

export type Receipt = { items: ReceiptItem[], sno?: string }

function checkReceipt(receipt: Receipt, amountKopecks: number): void {
  if (receipt.items.length === 0) throw new Error('В чеке нет позиций')
  let total = 0
  for (const item of receipt.items) {
    if (item.name.length === 0 || item.name.length > MAX_ITEM_NAME) {
      throw new Error(`Название позиции чека должно быть от 1 до ${MAX_ITEM_NAME} знаков`)
    }
    total += Math.round(item.sum * 100)
  }
  // Расхождение чека и суммы Робокасса отклонит уже на её стороне, лучше увидеть сразу.
  if (total !== amountKopecks) throw new Error('Сумма позиций чека не равна сумме платежа')
}

function checkInvId(invId: number): void {
  if (!Number.isInteger(invId) || invId < 1 || invId > MAX_INV_ID) {
    throw new Error(`Номер счёта должен быть целым от 1 до ${MAX_INV_ID}`)
  }
}

function sortedShp(shp: Record<string, string>): string[] {
  return Object.keys(shp).sort().map((key) => `${key}=${shp[key]}`)
}

/** Строка для хеша подписи ссылки. Receipt в ней закодирован ровно один раз. */
export function paymentSignatureBase(
  config: RobokassaConfig,
  input: { outSum: string, invId: number, encodedReceipt: string, shp?: Record<string, string> },
): string {
  const shp = input.shp ?? {}
  const prefixed: Record<string, string> = {}
  for (const key of Object.keys(shp)) prefixed[`Shp_${key}`] = shp[key]
  return [config.merchantLogin, input.outSum, String(input.invId), input.encodedReceipt, config.password1, ...sortedShp(prefixed)].join(':')
}

/** Срок оплаты по московскому времени в формате документации YYYY-MM-DDThh:mm. */
export function formatExpirationDate(date: Date): string {
  return new Date(date.getTime() + MOSCOW_OFFSET_MS).toISOString().slice(0, 16)
}

export type PaymentInput = {
  invId: number
  amountKopecks: number
  description: string
  receipt: Receipt
  email?: string
  expiresAt?: Date
  shp?: Record<string, string>
}

export function buildPaymentUrl(config: RobokassaConfig, input: PaymentInput): string {
  checkInvId(input.invId)
  const outSum = formatOutSum(input.amountKopecks)
  if (input.description.length === 0 || input.description.length > MAX_DESCRIPTION) {
    throw new Error(`Описание платежа должно быть от 1 до ${MAX_DESCRIPTION} знаков`)
  }
  checkReceipt(input.receipt, input.amountKopecks)
  const shp = input.shp ?? {}
  for (const key of Object.keys(shp)) {
    if (!/^[A-Za-z0-9_]+$/.test(key)) throw new Error('Ключ пользовательского параметра: только латиница, цифры и подчёркивание')
  }
  const encodedReceipt = encodeURIComponent(JSON.stringify(input.receipt))
  const signature = signatureHash(config.hash, paymentSignatureBase(config, { outSum, invId: input.invId, encodedReceipt, shp }))

  const params = new URLSearchParams()
  params.set('MerchantLogin', config.merchantLogin)
  params.set('OutSum', outSum)
  params.set('InvId', String(input.invId))
  params.set('Description', input.description)
  // Принимающая сторона раскодирует один раз и получит ту самую строку, что вошла в подпись.
  params.set('Receipt', encodedReceipt)
  params.set('SignatureValue', signature)
  params.set('Culture', 'ru')
  params.set('Encoding', 'utf-8')
  if (input.email) params.set('Email', input.email)
  if (input.expiresAt) params.set('ExpirationDate', formatExpirationDate(input.expiresAt))
  if (config.isTest) params.set('IsTest', '1')
  for (const key of Object.keys(shp).sort()) params.set(`Shp_${key}`, shp[key])
  return `${PAY_URL}?${params.toString()}`
}

export type RobokassaNotice = {
  invId: number
  amountKopecks: number
  outSum: string
  shp: Record<string, string>
  opKey?: string
  fee?: string
  paymentMethod?: string
  incCurrLabel?: string
  email?: string
}

export type NoticeResult =
  | { ok: true, notice: RobokassaNotice }
  | { ok: false, reason: 'missing' | 'signature' | 'amount' | 'inv_id' | 'test' }

/** Строка подписи уведомления: OutSum как пришла, затем все Shp_* по алфавиту. */
export function noticeSignatureBase(outSum: string, invId: string, password: string, params: Record<string, string>): string {
  const shp: Record<string, string> = {}
  for (const key of Object.keys(params)) if (key.startsWith('Shp_')) shp[key] = params[key]
  return [outSum, invId, password, ...sortedShp(shp)].join(':')
}

function sameHex(expected: string, received: string): boolean {
  if (!/^[0-9a-f]+$/i.test(received) || received.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
}

function verifyNotice(config: RobokassaConfig, params: Record<string, string>, password: string): NoticeResult {
  const outSum = params.OutSum
  const invIdText = params.InvId
  const received = params.SignatureValue
  if (!outSum || !invIdText || !received) return { ok: false, reason: 'missing' }
  // IsTest не входит в подпись ссылки: боевой магазин тестовую операцию не принимает, даже если пароли совпали.
  if (!config.isTest && params.IsTest === '1') return { ok: false, reason: 'test' }
  const expected = signatureHash(config.hash, noticeSignatureBase(outSum, invIdText, password, params))
  if (!sameHex(expected, received)) return { ok: false, reason: 'signature' }
  const amountKopecks = parseOutSum(outSum)
  if (amountKopecks === null || amountKopecks <= 0) return { ok: false, reason: 'amount' }
  const invId = /^\d{1,10}$/.test(invIdText) ? Number(invIdText) : 0
  if (invId < 1 || invId > MAX_INV_ID) return { ok: false, reason: 'inv_id' }
  const shp: Record<string, string> = {}
  for (const key of Object.keys(params)) if (key.startsWith('Shp_')) shp[key.slice(4)] = params[key]
  return {
    ok: true,
    notice: {
      invId,
      amountKopecks,
      outSum,
      shp,
      opKey: params.OpKey || undefined,
      fee: params.Fee || undefined,
      paymentMethod: params.PaymentMethod || undefined,
      incCurrLabel: params.IncCurrLabel || undefined,
      email: params.EMail || undefined,
    },
  }
}

export const verifyResultNotice = (config: RobokassaConfig, params: Record<string, string>) =>
  verifyNotice(config, params, config.password2)

export const verifySuccessReturn = (config: RobokassaConfig, params: Record<string, string>) =>
  verifyNotice(config, params, config.password1)

export const resultResponse = (invId: number): string => `OK${invId}`

export type OperationState = {
  state: 'not_found' | 'pending' | 'cancelled' | 'paid' | 'refunded' | 'unknown'
  stateCode: number | null
  amountKopecks?: number
  opKey?: string
  incCurrLabel?: string
}

function tag(xml: string, name: string): string | null {
  const match = new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`).exec(xml)
  return match ? match[1] : null
}

function block(xml: string, name: string): string | null {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)
  return match ? match[1] : null
}

const STATE_BY_CODE: Record<number, OperationState['state']> = {
  5: 'pending',
  10: 'cancelled',
  20: 'pending',
  50: 'pending',
  60: 'refunded',
  80: 'pending',
  100: 'paid',
}

/** Только боевые платежи: для IsTest метод OpStateExt ничего не возвращает (документация Робокассы). */
export async function fetchOperationState(
  config: RobokassaConfig,
  invId: number,
  fetchImpl: typeof fetch = fetch,
): Promise<OperationState> {
  checkInvId(invId)
  const query = new URLSearchParams({
    MerchantLogin: config.merchantLogin,
    InvoiceID: String(invId),
    Signature: signatureHash(config.hash, `${config.merchantLogin}:${invId}:${config.password2}`),
  })
  let text: string
  try {
    const response = await fetchImpl(`${OP_STATE_URL}?${query.toString()}`, { signal: AbortSignal.timeout(OP_STATE_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`Робокасса ответила кодом ${response.status}`)
    text = await response.text()
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Робокасса ответила')) throw error
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    throw new Error(timeout ? 'Робокасса не ответила за 10 секунд' : 'Не удалось связаться с Робокассой')
  }

  const resultCode = Number(tag(block(text, 'Result') ?? '', 'Code'))
  if (!block(text, 'Result') || !Number.isInteger(resultCode)) throw new Error('Робокасса вернула ответ в неожиданном формате')
  if (resultCode === 3) return { state: 'not_found', stateCode: null }
  if (resultCode === 4) return { state: 'unknown', stateCode: null }
  if (resultCode !== 0) {
    // 1 - подпись, 2 - логин: ошибки настройки, их нельзя выдавать за статус счёта.
    throw new Error(`Робокасса отклонила запрос статуса, код результата ${resultCode}`)
  }

  const stateText = tag(block(text, 'State') ?? '', 'Code')
  const stateCode = stateText !== null && /^\d+$/.test(stateText) ? Number(stateText) : null
  const info = block(text, 'Info') ?? ''
  const outSum = tag(info, 'OutSum')
  const amountKopecks = outSum ? parseOutSum(outSum) : null
  return {
    state: stateCode === null ? 'unknown' : (STATE_BY_CODE[stateCode] ?? 'unknown'),
    stateCode,
    ...(amountKopecks !== null ? { amountKopecks } : {}),
    ...(tag(info, 'OpKey') ? { opKey: tag(info, 'OpKey') as string } : {}),
    ...(tag(info, 'IncCurrLabel') ? { incCurrLabel: tag(info, 'IncCurrLabel') as string } : {}),
  }
}

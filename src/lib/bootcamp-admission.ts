/**
 * Допуск и оплата буткемпа (решения владельца 31.10.2026): этап заявки меняют только
 * кнопки в карточке и события системы, оплата идёт через отдельный магазин Робокассы,
 * после оплаты зачисление запускается само. Модуль общий для сервера и панели в CMS.
 */

import { EnrollmentInputError, parseEnrollmentInput, type EnrollmentInput } from '@/lib/bootcamp-enrollment'

/** Цена потока (решение владельца 27.10.2026). Та же цифра на лендинге: landing/src/data/bootcamp.ts, PRICE. */
export const BOOTCAMP_PRICE_KOPECKS = 4_500_000
export const PAYMENT_DUE_DAYS = 7
/** Напоминание об оплате за 2 дня до срока. */
export const PAYMENT_REMINDER_BEFORE_DAYS = 2
/** Ответ на решение входного задания обещан за 5 дней: на четвёртый день без решения - тревога наставнику. */
export const REVIEW_ALERT_AFTER_DAYS = 4
/** Редакция оферты, которую кандидат принимает перед оплатой: та же, что OFFER_VERSION лендинга. */
export const OFFER_VERSION = '2026-10-31'
export const OFFER_URL = 'https://info.mentorcareer.ru/bootcamp/nodejs/offer/'
/** Строка чека: «Робочеки СМЗ» самозанятого, как в работающем магазине podbor-minuta (документ 28 плана). */
export const RECEIPT_ITEM_NAME = 'Буткемп Node.js: онлайн-обучение backend-разработке, 20 недель'

/** 24 случайных байта в base64url, как у ссылки на входное задание. */
const PAYMENT_TOKEN = /^[A-Za-z0-9_-]{32}$/
export const isPaymentToken = (value: string) => PAYMENT_TOKEN.test(value)
export const paymentPath = (token: string) => `/pay/${token}`

/** Этапы, на которых наставник принимает решение по заявке. */
export const DECISION_STAGES = ['new', 'contacted', 'diagnostic'] as const
/** Этапы, откуда заявку можно вернуть на рассмотрение. */
export const CLOSED_STAGES = ['preparation', 'rejected', 'withdrawn'] as const

export type AdmissionInput = {
  enrollment: EnrollmentInput
  amountKopecks: number
  dueDays: number
  comment: string | null
}

const MAX_COMMENT = 2000

function optionalText(value: unknown, label: string, max = MAX_COMMENT): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new EnrollmentInputError(`${label}: ожидается текст`)
  const clean = value.replace(/\r\n/g, '\n').trim()
  if (clean.length > max) throw new EnrollmentInputError(`${label}: не длиннее ${max} знаков`)
  return clean || null
}

/** Сумма в рублях из формы: целые рубли или с копейками через точку или запятую. */
export function parseRubles(value: unknown): number {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.replace(/\s/g, '').replace(',', '.') : ''
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(raw)
  if (!match) throw new EnrollmentInputError('Сумма: число рублей, например 45000')
  const kopecks = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  if (kopecks < 100) throw new EnrollmentInputError('Сумма должна быть не меньше 1 рубля')
  return kopecks
}

function parseDays(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback
  const days = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isInteger(days) || days < 1 || days > 60) throw new EnrollmentInputError('Срок оплаты: от 1 до 60 дней')
  return days
}

function object(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new EnrollmentInputError('Ожидается объект JSON')
  return body as Record<string, unknown>
}

/** Форма «Допустить»: данные для будущего зачисления, сумма, срок оплаты и комментарий в письмо. */
export function parseAdmissionInput(body: unknown, now = new Date()): AdmissionInput {
  const data = object(body)
  return {
    enrollment: parseEnrollmentInput(data, now),
    amountKopecks: data.amount === undefined || data.amount === '' ? BOOTCAMP_PRICE_KOPECKS : parseRubles(data.amount),
    dueDays: parseDays(data.dueDays, PAYMENT_DUE_DAYS),
    comment: optionalText(data.comment, 'Комментарий'),
  }
}

export function parseMessage(body: unknown, required: boolean): string | null {
  const message = optionalText(object(body).message, 'Текст письма', 4000)
  if (required && !message) throw new EnrollmentInputError('Напишите кандидату, что подтянуть: этот текст уйдёт в письме')
  return message
}

export function parseManualPayment(body: unknown): { amountKopecks: number, comment: string } {
  const data = object(body)
  const comment = optionalText(data.comment, 'Комментарий')
  if (!comment) throw new EnrollmentInputError('Напишите, как прошла оплата: например, перевод на карту 31.10')
  return { amountKopecks: parseRubles(data.amount), comment }
}

export function parseDueDays(body: unknown): number {
  return parseDays(object(body).dueDays, PAYMENT_DUE_DAYS)
}

/** 4500000 → «45 000 ₽», 4500050 → «45 000,50 ₽». */
export function formatRubles(kopecks: number): string {
  const rubles = Math.floor(kopecks / 100)
  const rest = kopecks % 100
  const whole = new Intl.NumberFormat('ru-RU').format(rubles).replace(/\u00a0/g, ' ')
  return `${whole}${rest ? `,${String(rest).padStart(2, '0')}` : ''} ₽`
}

const DAY_MS = 24 * 60 * 60_000
const MOSCOW_OFFSET_MS = 3 * 60 * 60_000

/** Конец N-го дня по Москве: «оплатить до 7 ноября включительно». */
export function paymentDueAt(from: Date, days: number): Date {
  const moscowDay = Math.floor((from.getTime() + MOSCOW_OFFSET_MS) / DAY_MS)
  return new Date((moscowDay + days + 1) * DAY_MS - MOSCOW_OFFSET_MS - 1)
}

export const LEAD_EVENT_TYPES = [
  { value: 'lead_created', label: 'Заявка' },
  { value: 'entry_task_sent', label: 'Входное задание отправлено' },
  { value: 'entry_task_extended', label: 'Срок задания продлён' },
  { value: 'solution_submitted', label: 'Решение отправлено' },
  { value: 'review_overdue', label: 'Решение ждёт ответа' },
  { value: 'admitted', label: 'Допущен' },
  { value: 'preparation', label: 'Нужна подготовка' },
  { value: 'rejected', label: 'Отказ' },
  { value: 'withdrawn', label: 'Кандидат отказался' },
  { value: 'reopened', label: 'Возвращена на рассмотрение' },
  { value: 'admission_cancelled', label: 'Допуск отменён' },
  { value: 'payment_link_sent', label: 'Ссылка на оплату отправлена' },
  { value: 'payment_page_opened', label: 'Страница оплаты открыта' },
  { value: 'checkout_started', label: 'Переход к оплате' },
  { value: 'payment_failed_return', label: 'Оплата не прошла' },
  { value: 'payment_reminder', label: 'Напоминание об оплате' },
  { value: 'payment_expired', label: 'Срок оплаты истёк' },
  { value: 'paid', label: 'Оплата получена' },
  { value: 'paid_manually', label: 'Оплата отмечена вручную' },
  { value: 'payment_alert', label: 'Тревога по оплате' },
  { value: 'enrollment_started', label: 'Зачисление начато' },
  { value: 'enrollment_failed', label: 'Зачисление не удалось' },
  { value: 'enrolled', label: 'Зачислен' },
  { value: 'lms_signed_in', label: 'Первый вход в LMS' },
  { value: 'gitlab_signed_in', label: 'Первый вход в GitLab' },
  { value: 'gitlab_event', label: 'GitLab' },
] as const
export type LeadEventType = (typeof LEAD_EVENT_TYPES)[number]['value']
export const leadEventLabel = (type: string) => LEAD_EVENT_TYPES.find((item) => item.value === type)?.label ?? type

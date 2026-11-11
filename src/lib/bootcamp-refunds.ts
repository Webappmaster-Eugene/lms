/**
 * Возврат денег за буткемп (решение владельца 11.11.2026): возврат через API Робокассы кнопкой
 * в заявке или отметка возврата, сделанного в кабинете Робокассы. После выполненного возврата
 * LMS закрывает доступы ученика. Модуль общий для сервера и панели в CMS.
 */

import { formatRubles, parseRubles } from '@/lib/bootcamp-admission'
import { EnrollmentInputError } from '@/lib/bootcamp-enrollment'

export const REFUND_STATUSES = [
  { value: 'processing', label: 'Выполняется' },
  { value: 'done', label: 'Выполнен' },
  { value: 'cancelled', label: 'Отменён в кабинете Робокассы' },
] as const
export type RefundStatus = (typeof REFUND_STATUSES)[number]['value']
export const refundStatusLabel = (status: string) => REFUND_STATUSES.find((item) => item.value === status)?.label ?? status

export const REFUND_METHODS = [
  { value: 'robokassa', label: 'Через API Робокассы' },
  { value: 'manual', label: 'Отмечен вручную' },
] as const

/** Этапы, на которых деньги уже получены и их можно вернуть. */
export const REFUNDABLE_STAGES = ['paid', 'enrolled', 'refunded'] as const

export type RefundFormInput = { amountKopecks: number, reason: string }

const MAX_REASON = 1000

export function parseRefundInput(body: unknown): RefundFormInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new EnrollmentInputError('Ожидается объект JSON')
  const data = body as Record<string, unknown>
  const reason = typeof data.reason === 'string' ? data.reason.replace(/\r\n/g, '\n').trim() : ''
  if (!reason) throw new EnrollmentInputError('Напишите причину возврата: она останется в журнале заявки')
  if (reason.length > MAX_REASON) throw new EnrollmentInputError(`Причина возврата: не длиннее ${MAX_REASON} знаков`)
  return { amountKopecks: parseRubles(data.amount), reason }
}

/**
 * Что сделать с чеком в «Мой налог» после выполненного возврата. Робочеки при любом возврате
 * аннулируют чек целиком (счёт 18, 10.11.2026: возврат 96,60 из 100 ₽), а оставшаяся сумма -
 * доход, и без чека он занижен. Оплату мимо Робокассы чек пробивал наставник, он же его правит.
 */
export function receiptAdvice(paymentMethod: string, keptKopecks: number): string | null {
  const kept = formatRubles(keptKopecks)
  if (paymentMethod === 'robokassa') {
    return keptKopecks > 0 ? `Чек: Робочеки аннулируют его целиком. Если в «Мой налог» нет чека на оставшиеся ${kept}, пробейте его вручную` : null
  }
  return keptKopecks > 0
    ? `Чек: аннулируйте прежний в «Мой налог» и пробейте новый на оставшиеся ${kept}`
    : 'Чек: аннулируйте его в «Мой налог», причина «Возврат средств»'
}

/** Отказ Робокассы человеческими словами: что случилось и что делать дальше. */
export function refundRejectionText(message: string): string {
  // Один код на два случая (проба 11.11.2026: 1000 ₽ по счёту на 100 ₽ дали его же).
  if (message === 'NotEnoughOperationFunds') return 'Робокасса отказала: столько по этой оплате вернуть нельзя. Причин две. Часть денег уже вернули в кабинете Робокассы, а в LMS это не отмечено: проверьте операцию в кабинете и отметьте возврат вручную. Или на балансе магазина меньше суммы возврата: комиссия за оплату уже удержана, верните сумму поменьше или дождитесь новых поступлений.'
  if (message === 'NoAccess') return 'Робокасса не приняла запрос: API возвратов не подключено магазину или пароль №3 в Dokploy не совпадает с кабинетом. Верните деньги в кабинете Робокассы и отметьте возврат вручную.'
  return `Робокасса отказала в возврате: ${message}`
}

import { describe, expect, it } from 'vitest'

import { parseRefundInput, receiptAdvice, refundRejectionText, refundStatusLabel } from '@/lib/bootcamp-refunds'

describe('возврат: форма', () => {
  it('сумма в рублях и причина обязательны', () => {
    expect(parseRefundInput({ amount: '27 000', reason: ' Отказ после 8-й недели ' })).toEqual({ amountKopecks: 2_700_000, reason: 'Отказ после 8-й недели' })
    expect(parseRefundInput({ amount: '96,60', reason: 'Проверка' }).amountKopecks).toBe(9_660)
    expect(() => parseRefundInput({ amount: '100', reason: '  ' })).toThrow('причину')
    expect(() => parseRefundInput({ amount: 'сто', reason: 'Отказ' })).toThrow('Сумма')
    expect(() => parseRefundInput({ amount: '100', reason: 'x'.repeat(1001) })).toThrow('1000')
    expect(() => parseRefundInput(null)).toThrow('JSON')
  })

  it('отказы Робокассы объясняются и подсказывают, что делать', () => {
    expect(refundRejectionText('NotEnoughOperationFunds')).toMatch(/уже вернули в кабинете.*отметьте возврат вручную.*балансе магазина.*верните сумму поменьше/s)
    expect(refundRejectionText('NoAccess')).toMatch(/пароль №3.*отметьте возврат вручную/s)
    expect(refundRejectionText('Что-то новое')).toBe('Робокасса отказала в возврате: Что-то новое')
    expect(refundStatusLabel('processing')).toBe('Выполняется')
  })
})

describe('чек в «Мой налог» после возврата', () => {
  it('Робокасса: полный возврат Робочеки закрывают сами, при частичном напоминает про остаток', () => {
    expect(receiptAdvice('robokassa', 0)).toBeNull()
    expect(receiptAdvice('robokassa', 1_800_000)).toBe('Чек: Робочеки аннулируют его целиком. Если в «Мой налог» нет чека на оставшиеся 18 000 ₽, пробейте его вручную')
  })

  it('оплата мимо Робокассы: чек правит наставник', () => {
    expect(receiptAdvice('manual', 0)).toBe('Чек: аннулируйте его в «Мой налог», причина «Возврат средств»')
    expect(receiptAdvice('manual', 340)).toBe('Чек: аннулируйте прежний в «Мой налог» и пробейте новый на оставшиеся 3,40 ₽')
  })
})

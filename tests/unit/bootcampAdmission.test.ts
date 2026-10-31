import { describe, expect, it } from 'vitest'

import { BOOTCAMP_PRICE_KOPECKS, formatRubles, parseAdmissionInput, parseManualPayment, parseMessage, parseRubles, paymentDueAt } from '@/lib/bootcamp-admission'
import { bootcampAdmittedEmail, bootcampDecisionEmail, bootcampPaymentReceivedEmail, bootcampPaymentReminderEmail } from '@/payload/emails/templates'

const enrollment = { firstName: 'Иван', lastName: 'Петров', username: 'ivan', group: 'nodejs-bootcamp', accessUntil: '' }

describe('допуск: разбор формы', () => {
  it('сумма и срок по умолчанию, комментарий обрезается', () => {
    expect(parseAdmissionInput({ ...enrollment, comment: '  ждём  ' })).toMatchObject({ amountKopecks: BOOTCAMP_PRICE_KOPECKS, dueDays: 7, comment: 'ждём', enrollment: { username: 'ivan' } })
    expect(parseAdmissionInput({ ...enrollment, amount: '40 000,50', dueDays: '3' })).toMatchObject({ amountKopecks: 4_000_050, dueDays: 3, comment: null })
  })

  it('отклоняет кривую сумму, срок и логин', () => {
    expect(() => parseRubles('45000.555')).toThrow('Сумма')
    expect(() => parseRubles('-1')).toThrow('Сумма')
    expect(() => parseRubles('0.50')).toThrow('не меньше 1 рубля')
    expect(() => parseAdmissionInput({ ...enrollment, dueDays: '0' })).toThrow('Срок оплаты')
    expect(() => parseAdmissionInput({ ...enrollment, username: 'Bad Login' })).toThrow('Логин GitLab')
  })

  it('подготовка требует текст, ручная оплата требует комментарий', () => {
    expect(() => parseMessage({ message: '  ' }, true)).toThrow('что подтянуть')
    expect(parseMessage({}, false)).toBeNull()
    expect(() => parseManualPayment({ amount: '45000', comment: '' })).toThrow('как прошла оплата')
    expect(parseManualPayment({ amount: '45000', comment: 'перевод' })).toEqual({ amountKopecks: 4_500_000, comment: 'перевод' })
  })

  it('сумма для людей и срок до конца дня по Москве', () => {
    expect(formatRubles(4_500_000)).toBe('45 000 ₽')
    expect(formatRubles(4_000_050)).toBe('40 000,50 ₽')
    // 31.10 23:30 по Москве + 7 дней = до конца 7 ноября по Москве.
    expect(paymentDueAt(new Date('2026-10-31T20:30:00Z'), 7).toISOString()).toBe('2026-11-07T20:59:59.999Z')
  })
})

describe('письма кандидату о допуске и оплате', () => {
  const letters = [
    bootcampAdmittedEmail({ name: 'Иван', program: 'Node.js', amount: '45 000 ₽', dueDate: '7 ноября 2026 г.', url: 'https://learn.test/pay/abc', offerUrl: 'https://info.test/offer/', comment: 'Ждём', resend: false, replyable: true }),
    bootcampAdmittedEmail({ name: null, program: 'Node.js', amount: '45 000 ₽', dueDate: '7 ноября 2026 г.', url: 'https://learn.test/pay/abc', offerUrl: 'https://info.test/offer/', comment: null, resend: true, replyable: false }),
    bootcampPaymentReminderEmail({ name: 'Иван', program: 'Node.js', amount: '45 000 ₽', dueDate: '7 ноября 2026 г.', url: 'https://learn.test/pay/abc', replyable: true }),
    bootcampPaymentReceivedEmail({ name: 'Иван', program: 'Node.js', amount: '45 000 ₽', invoice: 12, replyable: true }),
    bootcampPaymentReceivedEmail({ name: 'Иван', program: 'Node.js', amount: '45 000 ₽', invoice: 12, test: true, replyable: true }),
    bootcampDecisionEmail({ name: 'Иван', program: 'Node.js', decision: 'preparation', message: 'Промисы', replyable: true }),
    bootcampDecisionEmail({ name: 'Иван', program: 'Node.js', decision: 'rejected', message: null, replyable: false }),
  ]

  it('правила текста владельца: без длинного тире', () => {
    for (const letter of letters) expect(`${letter.subject}${letter.text}${letter.html}`).not.toMatch(/[—–]/)
  })

  it('в письме о допуске ссылка на оплату, оферта, сумма и срок', () => {
    const [admitted, resend] = letters
    expect(admitted.subject).toBe('Вы допущены на буткемп Node.js')
    for (const part of ['https://learn.test/pay/abc', 'https://info.test/offer/', '45 000 ₽', '7 ноября 2026 г.', 'Комментарий наставника: Ждём']) expect(admitted.text).toContain(part)
    expect(resend.subject).toBe('Ссылка на оплату буткемпа Node.js')
    expect(resend.text).not.toContain('Комментарий наставника')
  })

  it('текст кандидата в HTML экранируется', () => {
    const letter = bootcampDecisionEmail({ name: '<b>x</b>', program: 'Node.js', decision: 'preparation', message: '<script>alert(1)</script>', replyable: false })
    expect(letter.html).not.toContain('<script>')
    expect(letter.html).toContain('&lt;script&gt;')
  })
})

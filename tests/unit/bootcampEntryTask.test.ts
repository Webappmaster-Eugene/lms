import { describe, expect, it } from 'vitest'

import { entryTaskDueAt, entryTaskPath, formatEntryTaskDate, isEntryTaskToken } from '@/lib/bootcamp-entry-task'
import { bootcampEntryTaskEmail } from '@/payload/emails/templates'

describe('входное задание: ссылка и срок', () => {
  it('принимает только токен из 32 символов base64url', () => {
    expect(isEntryTaskToken('AbCdEfGhIjKlMnOpQrStUvWxYz012-_9')).toBe(true)
    expect(isEntryTaskToken('short')).toBe(false)
    expect(isEntryTaskToken('../../etc/passwd/../../etc/passw')).toBe(false)
    expect(entryTaskPath('abc')).toBe('/entry-task/abc')
  })

  it('срок - конец седьмого дня по Москве, а не час отправки письма', () => {
    // 27 октября, 15:00 по Москве: срок до конца 3 ноября по Москве.
    expect(entryTaskDueAt(new Date('2026-10-27T12:00:00Z')).toISOString()).toBe('2026-11-03T20:59:59.999Z')
    // 00:30 по Москве уже 28 октября, хотя в UTC ещё 27-е.
    expect(entryTaskDueAt(new Date('2026-10-27T21:30:00Z')).toISOString()).toBe('2026-11-04T20:59:59.999Z')
    expect(formatEntryTaskDate('2026-11-03T20:59:59.999Z')).toMatch(/^3 ноября 2026/)
  })
})

describe('письмо с входным заданием', () => {
  const content = (replyable: boolean, name: string | null = 'Анна') => bootcampEntryTaskEmail({
    name, program: 'Node.js', url: 'https://learn.test/entry-task/token', dueDate: '3 ноября 2026 г.', reviewDays: 5, replyable,
  })

  it('содержит ссылку, срок, срок ответа и обращение по имени', () => {
    const { subject, text, html } = content(true)
    expect(subject).toBe('Входное задание буткемпа Node.js')
    expect(text).toContain('Здравствуйте, Анна!')
    expect(text).toContain('https://learn.test/entry-task/token')
    expect(text).toContain('до 3 ноября 2026 г. включительно')
    expect(text).toContain('в течение 5 дней')
    expect(text).toContain('ответьте на это письмо')
    expect(html).toContain('href="https://learn.test/entry-task/token"')
  })

  it('без адреса для ответа не обещает, что ответ прочтут', () => {
    expect(content(false).text).not.toContain('ответьте на это письмо')
  })

  it('имя из формы не ломает разметку письма', () => {
    const { html } = content(true, '<script>alert(1)</script>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('пишет короткими дефисами, без длинных тире', () => {
    expect(content(true).text).not.toMatch(/[—–]/)
    expect(content(true, null).text).toContain('Здравствуйте!')
  })
})

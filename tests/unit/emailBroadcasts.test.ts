import { afterEach, describe, expect, it, vi } from 'vitest'

import { broadcastCtaUrlError, broadcastPlainText, parseBroadcastBody } from '@/lib/broadcast-markup'
import { broadcastEmail, inviteEmail } from '@/payload/emails/templates'
import { broadcastErrorLabel, broadcastSendOutcome, MAX_BROADCAST_ATTEMPTS, TRANSPORT_PAUSE_MS } from '@/server/broadcasts/delivery-outcome'
import { createUnsubscribeToken, verifyUnsubscribeToken } from '@/server/broadcasts/unsubscribe-token'

const base = { firstName: 'Алексей', subject: 'Новый курс', ctaLabel: null, ctaUrl: null, unsubscribeUrl: 'http://localhost:3000/unsubscribe?token=1.abc', replyable: true }

describe('разметка текста рассылки', () => {
  it('пустая строка разделяет абзацы, перевод строки остаётся внутри абзаца', () => {
    const paragraphs = parseBroadcastBody('Первая строка\r\nвторая строка\n\n  \n\nВторой абзац')
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]).toEqual([{ type: 'text', value: 'Первая строка' }, { type: 'break' }, { type: 'text', value: 'вторая строка' }])
  })

  it('жирный текст, ссылки в квадратных скобках и голые адреса без хвостовой пунктуации', () => {
    const [nodes] = parseBroadcastBody('Смотрите **новый курс** на [платформе](https://learn.mentorcareer.ru/courses) или https://info.mentorcareer.ru/guide.')
    expect(nodes).toEqual([
      { type: 'text', value: 'Смотрите ' },
      { type: 'bold', children: [{ type: 'text', value: 'новый курс' }] },
      { type: 'text', value: ' на ' },
      { type: 'link', label: 'платформе', url: 'https://learn.mentorcareer.ru/courses' },
      { type: 'text', value: ' или ' },
      { type: 'link', label: 'https://info.mentorcareer.ru/guide', url: 'https://info.mentorcareer.ru/guide' },
      { type: 'text', value: '.' },
    ])
    expect(broadcastPlainText(nodes ?? [])).toBe('Смотрите новый курс на платформе (https://learn.mentorcareer.ru/courses) или https://info.mentorcareer.ru/guide.')
  })

  it('опасные схемы не становятся ссылками', () => {
    const [nodes] = parseBroadcastBody('[нажми](javascript:alert(1)) и data:text/html,<b>')
    expect(nodes?.some((node) => node.type === 'link')).toBe(false)
  })

  it('ссылка кнопки: https, путь платформы или пусто', () => {
    expect(broadcastCtaUrlError('')).toBeNull()
    expect(broadcastCtaUrlError('/courses/node')).toBeNull()
    expect(broadcastCtaUrlError('https://t.me/+h3m2mocKtJI0Yzcy')).toBeNull()
    expect(broadcastCtaUrlError('//evil.example')).not.toBeNull()
    expect(broadcastCtaUrlError('javascript:alert(1)')).not.toBeNull()
    expect(broadcastCtaUrlError('https://user:pass@example.com')).not.toBeNull()
    expect(broadcastCtaUrlError('/путь с пробелом')).not.toBeNull()
  })
})

describe('письмо рассылки', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('экранирует HTML из темы и текста, приветствует по имени', () => {
    const { html, text, subject } = broadcastEmail({ ...base, subject: 'Тема <script>', body: 'Привет <img src=x onerror=alert(1)> & "кавычки"' })
    expect(subject).toBe('Тема <script>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;кавычки&quot;')
    expect(html).toContain('Привет, Алексей!')
    expect(text).toContain('Привет <img src=x onerror=alert(1)> & "кавычки"')
  })

  it('подвал объясняет, почему пришло письмо, и даёт отписаться — в html и в тексте', () => {
    const { html, text } = broadcastEmail({ ...base, body: 'Текст' })
    expect(html).toContain('Вы получили это письмо, потому что учитесь на платформе MentorCareer.')
    expect(html).toContain('href="http://localhost:3000/unsubscribe?token=1.abc"')
    expect(html).toContain('Отписаться от рассылок')
    expect(html).not.toContain('Ответы на этот адрес не обрабатываются')
    expect(text).toContain('Отписаться от рассылок: http://localhost:3000/unsubscribe?token=1.abc')
    expect(text).toContain('просто ответьте на это письмо')
  })

  it('без адреса для ответа честно говорит, что ответы не читаются', () => {
    const { html } = broadcastEmail({ ...base, body: 'Текст', replyable: false })
    expect(html).toContain('Ответы на этот адрес не обрабатываются.')
  })

  it('кнопка с относительной ссылкой ведёт на платформу', async () => {
    // Адрес платформы читается при импорте шаблонов, а не на каждый вызов.
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://learn.mentorcareer.ru')
    vi.resetModules()
    const templates = await import('@/payload/emails/templates')
    const { html, text } = templates.broadcastEmail({ ...base, body: 'Текст', ctaLabel: 'Открыть курс', ctaUrl: '/courses/node' })
    expect(html).toContain('href="https://learn.mentorcareer.ru/courses/node"')
    expect(html).toContain('>Открыть курс</a>')
    expect(text).toContain('Открыть курс: https://learn.mentorcareer.ru/courses/node')
  })

  it('кнопка без ссылки не выводится', () => {
    const { html } = broadcastEmail({ ...base, body: 'Текст', ctaLabel: 'Открыть', ctaUrl: '' })
    expect(html).not.toContain('class="email-button"')
  })

  it('служебные письма сохранили прежний подвал', () => {
    const { html, text } = inviteEmail('Алексей', 'a@m.ru', 'tok')
    expect(html).toContain('Это автоматическое письмо, связанное с вашим аккаунтом или обучением в MentorCareer. Ответы на этот адрес не обрабатываются.')
    expect(html).not.toContain('Отписаться')
    expect(text).toMatch(/Это автоматическое письмо\. Ответы на этот адрес не обрабатываются\.\nКонтакты: .+\/contacts\n$/)
  })
})

describe('ссылка отписки', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('подписана секретом и привязана к пользователю', () => {
    vi.stubEnv('PAYLOAD_SECRET', 'unit-secret-0000000000000000000000000001')
    const token = createUnsubscribeToken(42)
    expect(verifyUnsubscribeToken(token)).toBe(42)
    expect(verifyUnsubscribeToken(token.replace(/^42\./, '43.'))).toBeNull()
    const signature = token.split('.')[1] ?? ''
    expect(verifyUnsubscribeToken(`42.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`)).toBeNull()
    vi.stubEnv('PAYLOAD_SECRET', 'other-secret-000000000000000000000000002')
    expect(verifyUnsubscribeToken(token)).toBeNull()
  })

  it.each([undefined, '', '42', '0.abc', '-1.abc', 'x'.repeat(200), 42])('отклоняет мусор: %s', (value) => {
    vi.stubEnv('PAYLOAD_SECRET', 'unit-secret-0000000000000000000000000001')
    expect(verifyUnsubscribeToken(value)).toBeNull()
  })
})

describe('исход отправки письма', () => {
  it('успех', () => {
    expect(broadcastSendOutcome(null, 1)).toMatchObject({ status: 'sent', error: null, transportDown: false })
  })

  it('отказ адреса 550–554 — окончательный, без повтора и без остановки прогона', () => {
    expect(broadcastSendOutcome(Object.assign(new Error('mailbox unavailable'), { responseCode: 550 }), 1)).toEqual({ status: 'failed', error: 'smtp_550', retryDelay: 0, transportDown: false })
    expect(broadcastSendOutcome(Object.assign(new Error('no recipients'), { code: 'EENVELOPE' }), 1)).toMatchObject({ status: 'failed', error: 'rejected' })
  })

  it('временный отказ у получателя — повтор с растущей паузой, затем отказ', () => {
    const first = broadcastSendOutcome(Object.assign(new Error('mailbox busy'), { responseCode: 450 }), 1)
    expect(first).toMatchObject({ status: 'pending', error: 'smtp_450', transportDown: false })
    const second = broadcastSendOutcome(Object.assign(new Error('local error'), { responseCode: 451 }), 2)
    expect(second.retryDelay).toBeGreaterThan(first.retryDelay)
    expect(broadcastSendOutcome(Object.assign(new Error('busy'), { responseCode: 450 }), MAX_BROADCAST_ATTEMPTS)).toMatchObject({ status: 'failed', error: 'smtp_450' })
  })

  it('недоступный SMTP и неверный пароль ящика — пауза всей отправки без списания попытки', () => {
    for (const [error, label] of [
      [Object.assign(new Error('auth'), { code: 'EAUTH', responseCode: 535 }), 'auth'],
      [Object.assign(new Error('try later'), { responseCode: 421 }), 'smtp_421'],
      [Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), 'timeout'],
      [Object.assign(new Error('refused'), { code: 'ECONNECTION' }), 'network'],
    ] as const) {
      // Даже на последней попытке: недоступная почта не делает адрес получателя плохим.
      expect(broadcastSendOutcome(error, MAX_BROADCAST_ATTEMPTS)).toEqual({ status: 'pending', error: label, retryDelay: TRANSPORT_PAUSE_MS, transportDown: true })
    }
  })

  it('коды ошибок понятны администратору и не содержат адресов', () => {
    expect(broadcastErrorLabel('smtp_550')).toContain('отклонён')
    expect(broadcastErrorLabel('smtp_421')).toContain('временно')
    expect(broadcastErrorLabel('auth')).toContain('логин или пароль')
    expect(broadcastErrorLabel('unsubscribed')).toBe('получатель отписался от рассылок')
    expect(broadcastErrorLabel(null)).toBe('')
  })
})

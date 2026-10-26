import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

import { GET as connectivity } from '@/app/api/connectivity/route'
import { isPublishedOrAdmin } from '@/payload/access/isPublishedOrAdmin'
import { allowEnvelope, forwardEnvelope, resetTunnelLimits } from '@/server/error-tunnel'
import { validNotificationJobKey } from '@/server/notification-job-auth'
import { resolveSlideFileName, SlidesError } from '@/server/slides-folder'

/** Небольшие серверные проверки: лимиты туннеля ошибок, ключ планировщика, проверка связи, права черновиков. */
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  resetTunnelLimits()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('туннель ошибок браузера: память лимитов и испорченные конверты', () => {
  const T0 = Date.parse('2026-10-26T10:00:00Z')
  const MINUTE = 60_000

  it('помнит не больше 5000 источников: самый давний забывается и получает новое окно', () => {
    // Первый источник исчерпывает свой лимит последним, но в памяти он самый старый.
    expect(allowEnvelope('first', T0)).toBe(true)
    for (let index = 1; index < 5000; index += 1) {
      // Общий лимит — 300 в минуту, поэтому заполняем память по 250 источников за окно.
      expect(allowEnvelope(`client-${index}`, T0 + Math.floor(index / 250) * MINUTE)).toBe(true)
    }
    const late = T0 + 25 * MINUTE
    for (let attempt = 0; attempt < 30; attempt += 1) expect(allowEnvelope('first', late)).toBe(true)
    expect(allowEnvelope('first', late)).toBe(false)
    expect(allowEnvelope('newcomer', late)).toBe(true)
    // Пятитысячный источник вытеснил «first» — его счётчик начат заново.
    expect(allowEnvelope('first', late)).toBe(true)
  })

  function tunnelRequest(body: BodyInit) {
    return new Request('https://learn.mentorcareer.ru/api/monitoring', {
      method: 'POST', body, duplex: 'half',
      headers: { origin: 'https://learn.mentorcareer.ru', 'sec-fetch-site': 'same-origin' },
    } as RequestInit)
  }

  beforeEach(() => {
    vi.stubEnv('SENTRY_DSN', 'https://publicKey123@o42.ingest.de.sentry.io/4507')
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://learn.mentorcareer.ru')
  })

  it('заголовок элемента не JSON — 400 и в Sentry ничего не уходит', async () => {
    const envelope = [JSON.stringify({ event_id: 'a'.repeat(32) }), '{type: event}', JSON.stringify({ message: 'boom' })].join('\n')
    expect((await forwardEnvelope(tunnelRequest(envelope))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('обрыв отправки посреди тела — 400, а не ошибка сервера', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"event_id"')) },
      pull(controller) { controller.error(new Error('client closed tab')) },
    })
    expect((await forwardEnvelope(tunnelRequest(body))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('ключ фоновой задачи уведомлений', () => {
  const key = (secret: string) => createHmac('sha256', secret).update('lms-notifications-scheduler-v1').digest('hex')

  it('принимает HMAC от PAYLOAD_SECRET и отклоняет ключ от другого секрета', () => {
    vi.stubEnv('PAYLOAD_SECRET', 'scheduler-secret')
    expect(validNotificationJobKey(key('scheduler-secret'))).toBe(true)
    expect(validNotificationJobKey(key('other-secret'))).toBe(false)
  })

  it.each([
    ['пустой ключ', null],
    ['не hex', 'z'.repeat(64)],
    ['короткий', 'a'.repeat(63)],
    ['в верхнем регистре', 'A'.repeat(64)],
  ])('%s — отказ', (_, value) => {
    vi.stubEnv('PAYLOAD_SECRET', 'scheduler-secret')
    expect(validNotificationJobKey(value)).toBe(false)
  })

  it('без PAYLOAD_SECRET ключ не принимается вовсе', () => {
    vi.stubEnv('PAYLOAD_SECRET', '')
    expect(validNotificationJobKey(key(''))).toBe(false)
  })
})

describe('проверка связи PWA', () => {
  it('отвечает 204 без кеширования и без обращения к базе', () => {
    const response = connectivity()
    expect(response.status).toBe(204)
    expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0')
    expect(response.headers.get('X-LMS-Connectivity')).toBe('1')
  })
})

describe('права «опубликованное или администратор»', () => {
  const access = (user: unknown) => isPublishedOrAdmin({ req: { user } as PayloadRequest })

  it('гость не видит ничего, администратор — всё, ученик — только опубликованное', () => {
    expect(access(null)).toBe(false)
    expect(access({ id: 1, role: 'admin' })).toBe(true)
    expect(access({ id: 2, role: 'student' })).toEqual({ isPublished: { equals: true } })
  })
})

describe('имя файла презентации: сбои Диска', () => {
  const single = 'https://disk.yandex.ru/i/AbCdEf123'

  it('закрытая ссылка объясняется администратору', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }))
    await expect(resolveSlideFileName(single)).rejects.toThrow('Яндекс Диск не открыл ссылку')
  })

  it('сбой сети — просьба повторить, а не «проверьте ссылку»', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const error = await resolveSlideFileName(single).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(SlidesError)
    expect(error).toMatchObject({ message: 'Не удалось прочитать Яндекс Диск. Повторите попытку позже' })
  })

  it('не ссылка Диска — ошибка до обращения к сети', async () => {
    await expect(resolveSlideFileName('https://example.com/file.pdf')).rejects.toThrow('Нужна ссылка на файл на Яндекс Диске или в медиатеке')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

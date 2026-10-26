import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/api/bootcamp/leads/route'
import { logger } from '@/lib/telemetry'
import { captureEmails, createAdmin, createStudent, getTestPayload, login, rest, uid, type TestUser } from '../helpers/payload'

let payload: Payload
let admin: TestUser
let adminToken: string
let studentToken: string
let ipSeq = 0
const previousTrustProxy = process.env.LMS_TRUST_PROXY

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  adminToken = await login(payload, admin)
  studentToken = await login(payload, await createStudent(payload))
  // Лимит считается по адресу клиента, который подставляет Traefik.
  process.env.LMS_TRUST_PROXY = 'true'
})

afterAll(() => {
  if (previousTrustProxy === undefined) delete process.env.LMS_TRUST_PROXY
  else process.env.LMS_TRUST_PROXY = previousTrustProxy
})

/** Новый адрес клиента на каждый вызов: тесты не делят лимит частоты. */
const nextIp = () => `198.51.100.${(ipSeq += 1)}`

function send(body: unknown, { ip = nextIp(), headers = {} as Record<string, string>, raw }: { ip?: string; headers?: Record<string, string>; raw?: string } = {}) {
  return POST(new Request('http://info.test/api/bootcamp/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, 'X-Forwarded-Host': 'info.test', Origin: 'http://info.test', 'Sec-Fetch-Site': 'same-origin', ...headers },
    body: raw ?? JSON.stringify(body),
  }))
}

const lead = (email: string, extra: Record<string, unknown> = {}) => ({ program: 'nodejs', email, name: 'Иван', consent: true, consentVersion: '2026-10-26', ...extra })

async function stored(email: string) {
  return (await payload.find({ collection: 'bootcamp-leads', where: { email: { equals: email } }, depth: 0, overrideAccess: true })).docs
}

describe('POST /api/bootcamp/leads: предзапись с лендинга', () => {
  it('сохраняет заявку, отвечает только после записи и пишет команде', async () => {
    const mail = captureEmails(payload)
    try {
      const email = `${uid('lead')}@mail.test`
      const response = await send(lead(email.toUpperCase(), { utm: { utm_source: 'habr' }, referrer: 'https://habr.com/ru/articles/1' }))
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({ ok: true })
      const [row] = await stored(email)
      expect(row).toMatchObject({ email, name: 'Иван', program: 'nodejs', status: 'new', submissionCount: 1, consentVersion: '2026-10-26', source: { utmSource: 'habr', referrerHost: 'habr.com' } })
      expect(row?.consentAt).toBeTruthy()
      await vi.waitFor(async () => expect((await stored(email))[0]?.notifiedAt).toBeTruthy())
      const letter = mail.sent.find((message) => message.to === admin.email && message.subject.includes(email))
      expect(letter?.text).toContain(`/admin/collections/bootcamp-leads/${row?.id}`)
      expect(letter?.text).toContain('habr')
    } finally {
      mail.restore()
    }
  })

  it('повтор того же адреса не создаёт вторую заявку и не подменяет первую', async () => {
    const email = `${uid('repeat')}@mail.test`
    expect((await send(lead(email))).status).toBe(200)
    // Письмо о первой отправке уходит в фоне: ждём его, чтобы не принять за письмо о повторе.
    await vi.waitFor(async () => expect((await stored(email))[0]?.notifiedAt).toBeTruthy())
    const mail = captureEmails(payload)
    try {
      const again = await send(lead(email, { name: 'Другой человек' }))
      expect(again.status).toBe(200)
      expect(await again.json()).toEqual({ ok: true })
      const rows = await stored(email)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ name: 'Иван', submissionCount: 2 })
      expect(mail.sent.filter((message) => message.subject.includes(email))).toHaveLength(0)
    } finally {
      mail.restore()
    }
  })

  it('параллельные отправки одного адреса дают одну заявку', async () => {
    const email = `${uid('race')}@mail.test`
    const responses = await Promise.all(Array.from({ length: 5 }, () => send(lead(email))))
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200])
    const rows = await stored(email)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.submissionCount).toBeGreaterThanOrEqual(2)
  })

  it('ошибки ввода объясняет и ничего не пишет', async () => {
    const email = `${uid('bad')}@mail.test`
    const noConsent = await send(lead(email, { consent: false }))
    expect(noConsent.status).toBe(400)
    expect((await noConsent.json()).error).toMatch(/согласие/)
    expect((await send(lead('not-an-email'))).status).toBe(400)
    expect((await send(undefined, { raw: '{"email":' })).status).toBe(400)
    expect((await send(lead(email, { name: 'x'.repeat(5000) }))).status).toBe(413)
    expect((await send(lead(email), { headers: { 'Content-Type': 'text/plain' } })).status).toBe(415)
    expect(await stored(email)).toHaveLength(0)
  })

  it('робот со скрытым полем получает обычный ответ, но заявки нет', async () => {
    const email = `${uid('bot')}@mail.test`
    const response = await send(lead(email, { website: 'https://spam.example' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(await stored(email)).toHaveLength(0)
  })

  it('чужая страница не отправит заявку руками посетителя', async () => {
    const email = `${uid('foreign')}@mail.test`
    expect((await send(lead(email), { headers: { Origin: 'https://evil.test' } })).status).toBe(403)
    expect((await send(lead(email), { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
    expect(await stored(email)).toHaveLength(0)
  })

  it('ограничивает частоту отправок с одного адреса', async () => {
    const ip = nextIp()
    for (let attempt = 0; attempt < 5; attempt += 1) expect((await send(lead(`${uid('limit')}@mail.test`), { ip })).status).toBe(200)
    const limited = await send(lead(`${uid('limit')}@mail.test`), { ip })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('600')
    expect((await send(lead(`${uid('limit')}@mail.test`))).status).toBe(200)
  })

  it('сбой письма команде не теряет заявку', async () => {
    const failure = vi.spyOn(payload, 'sendEmail').mockRejectedValue(new Error('SMTP недоступен'))
    const logged = vi.spyOn(logger, 'error')
    try {
      const email = `${uid('smtp')}@mail.test`
      expect((await send(lead(email))).status).toBe(200)
      await vi.waitFor(() => expect(logged).toHaveBeenCalledWith('Bootcamp lead notification failed', expect.any(Error), expect.anything()))
      const [row] = await stored(email)
      expect(row).toMatchObject({ email, notifiedAt: null })
    } finally {
      failure.mockRestore()
      logged.mockRestore()
    }
  })

  it('заявки читает и меняет только администратор', async () => {
    const email = `${uid('access')}@mail.test`
    expect((await send(lead(email))).status).toBe(200)
    expect((await rest('GET', '/bootcamp-leads')).status).toBe(403)
    expect((await rest('GET', '/bootcamp-leads', { token: studentToken })).status).toBe(403)
    expect((await rest('POST', '/bootcamp-leads', { body: lead(`${uid('direct')}@mail.test`) })).status).toBe(403)
    const [row] = await stored(email)
    expect((await rest('PATCH', `/bootcamp-leads/${row?.id}`, { token: studentToken, body: { status: 'admitted' } })).status).toBe(403)
    const listed = await rest('GET', `/bootcamp-leads?where[email][equals]=${encodeURIComponent(email)}`, { token: adminToken })
    expect(listed.status).toBe(200)
    expect((listed.json.docs as { email: string }[]).map((doc) => doc.email)).toEqual([email])
  })
})

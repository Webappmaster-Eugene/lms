import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/support-message — обращение ученика раскладывается уведомлениями
 * всем админам.
 */

const auth = vi.fn()
const find = vi.fn()
const create = vi.fn()
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ auth, find, create })) }))
vi.mock('@/lib/telemetry', () => ({ logger }))

const { POST } = await import('@/app/api/support-message/route')

const USER = { id: 7, role: 'student', firstName: 'Алексей', lastName: 'Морозов', email: 'a@m.ru' }
const ADMINS = [{ id: 1 }, { id: 2 }]

function request(body: unknown, { raw = false } = {}): Request {
  return new Request('https://learn.mentorcareer.ru/api/support-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

function givenHealthyState() {
  auth.mockResolvedValue({ user: USER })
  find.mockImplementation(async ({ collection }: { collection: string }) => {
    if (collection === 'notifications') return { docs: [], totalDocs: 0 }
    if (collection === 'users') return { docs: ADMINS, totalDocs: ADMINS.length }
    return { docs: [], totalDocs: 0 }
  })
  create.mockResolvedValue({ id: 100 })
}

const VALID = { subject: 'Не открывается урок', message: 'При переходе видна пустая страница' }

describe('POST /api/support-message', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    givenHealthyState()
  })

  describe('авторизация', () => {
    it('без сессии — 401 и ни одной записи', async () => {
      auth.mockResolvedValue({ user: null })

      const response = await POST(request(VALID))

      expect(response.status).toBe(401)
      expect(create).not.toHaveBeenCalled()
    })

    it('авторизация проверяется до разбора тела', async () => {
      auth.mockResolvedValue({ user: null })

      const response = await POST(request('не json', { raw: true }))

      // Иначе посторонний по коду ответа отличал бы валидный JSON от мусора.
      expect(response.status).toBe(401)
    })
  })

  describe('проверка тела запроса', () => {
    it('невалидный JSON — 400', async () => {
      const response = await POST(request('{сломано', { raw: true }))

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: 'Невалидный JSON' })
    })

    it.each([
      ['без темы', { message: 'текст' }],
      ['без текста', { subject: 'тема' }],
      ['тема из пробелов', { subject: '   ', message: 'текст' }],
      ['текст из пробелов', { subject: 'тема', message: '  \n ' }],
      ['пустое тело', {}],
    ])('%s — 400', async (_name, body) => {
      const response = await POST(request(body))

      expect(response.status).toBe(400)
      expect(create).not.toHaveBeenCalled()
    })

    it('тема длиннее 200 символов — 400', async () => {
      const response = await POST(request({ subject: 'а'.repeat(201), message: 'текст' }))

      expect(response.status).toBe(400)
      expect(create).not.toHaveBeenCalled()
    })

    it('ровно 200 символов темы — допустимо', async () => {
      const response = await POST(request({ subject: 'а'.repeat(200), message: 'текст' }))

      expect(response.status).toBe(200)
    })

    it('сообщение длиннее 5000 символов — 400', async () => {
      const response = await POST(request({ subject: 'тема', message: 'а'.repeat(5001) }))

      expect(response.status).toBe(400)
      expect(create).not.toHaveBeenCalled()
    })
  })

  describe('ограничение частоты', () => {
    it('шестое обращение за час — 429', async () => {
      find.mockImplementation(async ({ collection }: { collection: string }) =>
        collection === 'notifications'
          ? { docs: [], totalDocs: 5 }
          : { docs: ADMINS, totalDocs: ADMINS.length },
      )

      const response = await POST(request(VALID))

      expect(response.status).toBe(429)
      expect(create).not.toHaveBeenCalled()
    })

    it('считаются только обращения этого пользователя и только за последний час', async () => {
      await POST(request(VALID))

      const [args] = find.mock.calls[0] as [{ where: Record<string, { equals?: unknown; greater_than?: string }> }]

      expect(args.where.type).toEqual({ equals: 'support_message' })
      expect(args.where.link).toEqual({ equals: `/admin/collections/users/${USER.id}` })

      const since = new Date(String(args.where.createdAt.greater_than)).getTime()
      expect(Date.now() - since).toBeGreaterThan(59 * 60 * 1000)
      expect(Date.now() - since).toBeLessThan(61 * 60 * 1000)
    })
  })

  describe('рассылка админам', () => {
    it('уведомление создаётся каждому админу', async () => {
      const response = await POST(request(VALID))

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ success: true })
      expect(create).toHaveBeenCalledTimes(ADMINS.length)
    })

    it('в уведомлении есть имя автора, тема и обратная ссылка', async () => {
      await POST(request(VALID))

      const [args] = create.mock.calls[0] as [{ data: Record<string, unknown>; context?: { skipHooks?: boolean } }]

      expect(args.data).toMatchObject({
        user: ADMINS[0].id,
        type: 'support_message',
        message: VALID.message,
        link: `/admin/collections/users/${USER.id}`,
        isRead: false,
      })
      expect(String(args.data.title)).toContain('Алексей Морозов')
      expect(String(args.data.title)).toContain(VALID.subject)
    })

    it('у пользователя без имени в заголовок идёт почта', async () => {
      auth.mockResolvedValue({ user: { ...USER, firstName: '', lastName: '' } })

      await POST(request(VALID))

      const [args] = create.mock.calls[0] as [{ data: { title: string } }]
      expect(args.data.title).toContain(USER.email)
    })

    it('тема и текст сохраняются обрезанными по краям', async () => {
      await POST(request({ subject: '  тема  ', message: '  текст  ' }))

      const [args] = create.mock.calls[0] as [{ data: { title: string; message: string } }]
      expect(args.data.title).toContain('тема')
      expect(args.data.title).not.toContain('тема  ')
      expect(args.data.message).toBe('текст')
    })

    it('запись уведомления не запускает хуки', async () => {
      await POST(request(VALID))

      const [args] = create.mock.calls[0] as [{ context?: { skipHooks?: boolean } }]
      expect(args.context?.skipHooks).toBe(true)
    })

    it('падение на одном админе не отменяет рассылку остальным', async () => {
      create.mockRejectedValueOnce(new Error('БД недоступна'))

      const response = await POST(request(VALID))

      expect(response.status).toBe(200)
      expect(create).toHaveBeenCalledTimes(ADMINS.length)
      expect(logger.error).toHaveBeenCalled()
    })

    it('если админов нет, роут всё равно отвечает успехом', async () => {
      find.mockImplementation(async ({ collection }: { collection: string }) =>
        collection === 'users' ? { docs: [], totalDocs: 0 } : { docs: [], totalDocs: 0 },
      )

      const response = await POST(request(VALID))

      expect(response.status).toBe(200)
      expect(create).not.toHaveBeenCalled()
    })
  })
})

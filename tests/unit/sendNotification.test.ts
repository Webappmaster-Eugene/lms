import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { PayloadRequest } from 'payload'

/**
 * Письма, которые платформа шлёт сама.
 *
 * Приглашение — единственный способ попасть в аккаунт: пароли заводит
 * администратор, студент их не знает.
 */

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

vi.mock('@/lib/telemetry', () => ({
  logger,
  withSpan: (_name: string, _attributes: unknown, fn: () => unknown) => fn(),
}))

const { sendInviteEmail, sendCompletionEmail, sendAchievementEmail } = await import(
  '@/payload/hooks/sendNotification'
)

const DAY_MS = 24 * 60 * 60 * 1000

type Doc = Record<string, unknown>

function makePayload() {
  const entities: Record<string, Record<string, Doc>> = {
    users: { '3': { id: 3, email: 'student@mail.ru', firstName: 'Алексей' } },
    courses: { '51': { id: 51, title: 'Глубокий React' } },
    roadmaps: { '2': { id: 2, title: 'Frontend React' } },
    achievements: {
      '9': { id: 9, title: 'Практик', description: 'Решено 10 задач', pointsReward: 30 },
    },
  }

  const findByID = vi.fn(async ({ collection, id }: { collection: string; id: string | number }) => {
    const found = entities[collection]?.[String(id)]
    if (!found) throw new Error(`${collection}/${id} не найдено`)
    return found
  })

  const forgotPassword = vi.fn(
    async (_args: {
      collection: string
      data: { email: string }
      disableEmail?: boolean
      expiration?: number
      req?: PayloadRequest
    }) => 'invite-token-1',
  )
  const sendEmail = vi.fn(async (_message: { to: string; subject: string; html: string; text: string }) => undefined)

  return { findByID, forgotPassword, sendEmail, entities }
}

function makeReq(payload: ReturnType<typeof makePayload>): PayloadRequest {
  const req = Object.create({ url: 'https://learn.mentorcareer.ru/api/users', method: 'POST' }) as PayloadRequest
  req.context = {}
  // @ts-expect-error — хукам достаточно используемой части payload
  req.payload = payload
  return req
}

describe('приглашение в платформу', () => {
  let payload: ReturnType<typeof makePayload>
  let req: PayloadRequest

  const user = { id: 3, email: 'student@mail.ru', firstName: 'Алексей' }

  const run = (doc: Doc = user, operation: 'create' | 'update' = 'create') =>
    // @ts-expect-error — хуку достаточно используемых полей
    sendInviteEmail({ doc, previousDoc: {}, operation, req, collection: { slug: 'users' } })

  beforeEach(() => {
    vi.clearAllMocks()
    payload = makePayload()
    req = makeReq(payload)
  })

  it('уходит при заведении аккаунта', async () => {
    await run()

    expect(payload.sendEmail).toHaveBeenCalledTimes(1)
    const [args] = payload.sendEmail.mock.calls[0]
    expect(args.to).toBe(user.email)
    expect(String(args.html)).toContain('invite-token-1')
    expect(String(args.text)).toContain('invite-token-1')
  })

  it('не уходит при правке профиля', async () => {
    await run(user, 'update')

    expect(payload.forgotPassword).not.toHaveBeenCalled()
    expect(payload.sendEmail).not.toHaveBeenCalled()
  })

  it('не уходит при служебной записи со skipHooks', async () => {
    req.context = { skipHooks: true }
    await run()

    expect(payload.sendEmail).not.toHaveBeenCalled()
  })

  describe('срок жизни ссылки', () => {
    it('ровно 7 дней и передаётся поштучно', async () => {
      await run()

      const [args] = payload.forgotPassword.mock.calls[0]
      expect(args.expiration).toBe(7 * DAY_MS)
    })

    it('в конфиге коллекции срок не задан — иначе он растянет и сброс пароля', () => {
      // Payload отдаёт приоритет значению из конфига коллекции: появись оно
      // там — срок жизни токенов восстановления стал бы 7 дней вместо часа.
      const source = readFileSync(
        fileURLToPath(new URL('../../src/payload/collections/Users.ts', import.meta.url)),
        'utf8',
      )

      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      const forgotPasswordBlock = code.match(/forgotPassword\s*:\s*\{([\s\S]*?)\n\s{4}\}/)

      expect(forgotPasswordBlock, 'блок forgotPassword не найден — тест устарел').not.toBeNull()
      expect(forgotPasswordBlock?.[1]).not.toMatch(/\bexpiration\s*:/)
    })
  })

  it('токен выпускается в транзакции запроса — иначе пользователь ещё не виден', async () => {
    await run()

    const [args] = payload.forgotPassword.mock.calls[0]
    expect(args.req, 'forgotPassword без req не найдёт незакоммиченного пользователя').toBe(req)
    expect(args.disableEmail, 'письмо шлём своё, не дефолтное от Payload').toBe(true)
  })

  it('пустой токен не превращается в письмо с битой ссылкой', async () => {
    payload.forgotPassword.mockResolvedValueOnce('')

    await run()

    expect(payload.sendEmail).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalled()
  })

  it('сбой отправки не отменяет создание пользователя', async () => {
    payload.sendEmail.mockRejectedValueOnce(new Error('SMTP недоступен'))

    await expect(run()).resolves.toBeDefined()
    expect(logger.error).toHaveBeenCalled()
  })
})

describe('письмо о завершении', () => {
  let payload: ReturnType<typeof makePayload>
  let req: PayloadRequest

  const transaction = (overrides: Doc = {}): Doc => ({
    id: 1,
    user: 3,
    reason: 'course_completed',
    relatedEntity: '51',
    amount: 50,
    ...overrides,
  })

  const run = (doc: Doc, operation: 'create' | 'update' = 'create') =>
    // @ts-expect-error — хуку достаточно используемых полей
    sendCompletionEmail({ doc, previousDoc: {}, operation, req, collection: { slug: 'points-transactions' } })

  beforeEach(() => {
    vi.clearAllMocks()
    payload = makePayload()
    req = makeReq(payload)
  })

  it('за курс — с названием курса', async () => {
    await run(transaction())

    const [args] = payload.sendEmail.mock.calls[0]
    expect(args.to).toBe('student@mail.ru')
    expect(String(args.subject)).toContain('Глубокий React')
  })

  it('за роадмап — с названием роадмапа', async () => {
    await run(transaction({ reason: 'roadmap_completed', relatedEntity: '2', amount: 200 }))

    const [args] = payload.sendEmail.mock.calls[0]
    expect(String(args.subject)).toContain('Frontend React')
  })

  it.each(['lesson_completed', 'trainer_task_completed', 'achievement_unlocked', 'admin_adjustment'])(
    'по причине %s письма нет — иначе ученика заваливает почтой',
    async (reason) => {
      await run(transaction({ reason }))

      expect(payload.sendEmail).not.toHaveBeenCalled()
    },
  )

  it('правка транзакции не шлёт письмо повторно', async () => {
    await run(transaction(), 'update')

    expect(payload.sendEmail).not.toHaveBeenCalled()
  })

  it('без relatedEntity письмо не собрать — молча пропускаем', async () => {
    await run(transaction({ relatedEntity: null }))

    expect(payload.sendEmail).not.toHaveBeenCalled()
  })

  it('пропавший курс не роняет начисление баллов', async () => {
    await expect(run(transaction({ relatedEntity: '999' }))).resolves.toBeDefined()

    expect(payload.sendEmail).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalled()
  })

  it('связь пользователя принимается и развёрнутой', async () => {
    await run(transaction({ user: { id: 3 } }))

    expect(payload.sendEmail).toHaveBeenCalledTimes(1)
  })
})

describe('письмо о достижении', () => {
  let payload: ReturnType<typeof makePayload>
  let req: PayloadRequest

  const unlocked = (overrides: Doc = {}): Doc => ({ id: 1, user: 3, achievement: 9, ...overrides })

  const run = (doc: Doc, operation: 'create' | 'update' = 'create') =>
    // @ts-expect-error — хуку достаточно используемых полей
    sendAchievementEmail({ doc, previousDoc: {}, operation, req, collection: { slug: 'user-achievements' } })

  beforeEach(() => {
    vi.clearAllMocks()
    payload = makePayload()
    req = makeReq(payload)
  })

  it('содержит название достижения', async () => {
    await run(unlocked())

    const [args] = payload.sendEmail.mock.calls[0]
    expect(String(args.subject)).toContain('Практик')
    expect(String(args.html)).toContain('Решено 10 задач')
  })

  it('связи принимаются развёрнутыми', async () => {
    await run(unlocked({ user: { id: 3 }, achievement: { id: 9 } }))

    expect(payload.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('правка записи письма не шлёт', async () => {
    await run(unlocked(), 'update')

    expect(payload.sendEmail).not.toHaveBeenCalled()
  })

  it('skipHooks выключает отправку', async () => {
    req.context = { skipHooks: true }
    await run(unlocked())

    expect(payload.sendEmail).not.toHaveBeenCalled()
  })

  it('пропавшее достижение не роняет выдачу', async () => {
    await expect(run(unlocked({ achievement: 404 }))).resolves.toBeDefined()

    expect(logger.error).toHaveBeenCalled()
  })
})

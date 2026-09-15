import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

/**
 * Уведомления в интерфейсе — колокольчик в шапке.
 *
 * Отказ хука намеренно проглатывается, чтобы не откатывать транзакцию
 * с баллами, поэтому ошибка здесь невидима снаружи.
 */

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

vi.mock('@/lib/telemetry', () => ({
  logger,
  withSpan: (_name: string, _attributes: unknown, fn: () => unknown) => fn(),
}))

const { createPointsNotification, createAchievementNotification } = await import(
  '@/payload/hooks/createNotification'
)

type Doc = Record<string, unknown>

interface Store {
  notifications: Doc[]
  achievements: Record<string, Doc>
  calls: { op: string; withReq: boolean }[]
  createFails: boolean
}

function makePayload(store: Store) {
  const findByID = vi.fn(async ({ id, req }: { id: string | number; req?: PayloadRequest }) => {
    store.calls.push({ op: 'findByID', withReq: req !== undefined })
    const found = store.achievements[String(id)]
    if (!found) throw new Error(`достижение ${id} не найдено`)
    return found
  })

  const create = vi.fn(async ({ data, req }: { data: Doc; req?: PayloadRequest; context?: { skipHooks?: boolean } }) => {
    store.calls.push({ op: 'create', withReq: req !== undefined })
    if (store.createFails) throw new Error('БД недоступна')
    const doc = { id: store.notifications.length + 1, ...data }
    store.notifications.push(doc)
    return doc
  })

  return { findByID, create }
}

function makeReq(payload: ReturnType<typeof makePayload>): PayloadRequest {
  const req = Object.create({
    url: 'https://learn.mentorcareer.ru/api/points-transactions',
    method: 'POST',
  }) as PayloadRequest
  req.context = {}
  // @ts-expect-error — хукам достаточно используемой части payload
  req.payload = payload
  return req
}

describe('уведомление о завершении', () => {
  let store: Store
  let payload: ReturnType<typeof makePayload>
  let req: PayloadRequest

  const transaction = (overrides: Doc = {}): Doc => ({
    id: 1,
    user: 3,
    reason: 'course_completed',
    amount: 50,
    ...overrides,
  })

  const run = (doc: Doc, operation: 'create' | 'update' = 'create') =>
    // @ts-expect-error — хуку достаточно используемых полей
    createPointsNotification({ doc, previousDoc: {}, operation, req, collection: { slug: 'points-transactions' } })

  beforeEach(() => {
    vi.clearAllMocks()
    store = { notifications: [], achievements: {}, calls: [], createFails: false }
    payload = makePayload(store)
    req = makeReq(payload)
  })

  it('за курс — уведомление со ссылкой в профиль', async () => {
    await run(transaction())

    expect(store.notifications[0]).toMatchObject({
      user: '3',
      title: 'Курс завершён!',
      type: 'course_completed',
      link: '/profile',
      isRead: false,
    })
  })

  it('за роадмап — своё уведомление', async () => {
    await run(transaction({ reason: 'roadmap_completed', amount: 200 }))

    expect(store.notifications[0]).toMatchObject({
      title: 'Роадмап завершён!',
      type: 'roadmap_completed',
    })
  })

  it('описание транзакции попадает в текст', async () => {
    await run(transaction({ description: 'Курс «Глубокий React» завершён' }))

    expect(store.notifications[0].message).toBe('Курс «Глубокий React» завершён')
  })

  it('без описания в тексте видно начисление', async () => {
    await run(transaction({ description: undefined, amount: 50 }))

    expect(store.notifications[0].message).toBe('+50 баллов')
  })

  it.each(['lesson_completed', 'trainer_task_completed', 'achievement_unlocked', 'admin_adjustment'])(
    'по причине %s уведомления нет — колокольчик не засоряется',
    async (reason) => {
      await run(transaction({ reason }))

      expect(payload.create).not.toHaveBeenCalled()
    },
  )

  it('правка транзакции не плодит уведомления', async () => {
    await run(transaction(), 'update')

    expect(payload.create).not.toHaveBeenCalled()
  })

  it('skipHooks выключает хук', async () => {
    req.context = { skipHooks: true }
    await run(transaction())

    expect(payload.create).not.toHaveBeenCalled()
  })

  it('запись идёт через req — иначе уведомление пропадёт молча', async () => {
    await run(transaction())

    expect(store.calls.every((call) => call.withReq)).toBe(true)
  })

  it('уведомление не запускает хуки повторно', async () => {
    await run(transaction())

    const [args] = payload.create.mock.calls[0]
    expect(args.context?.skipHooks).toBe(true)
  })

  it('отказ записи не роняет начисление баллов', async () => {
    store.createFails = true

    await expect(run(transaction())).resolves.toBeDefined()
    expect(logger.error).toHaveBeenCalled()
  })
})

describe('уведомление о достижении', () => {
  let store: Store
  let payload: ReturnType<typeof makePayload>
  let req: PayloadRequest

  const unlocked = (overrides: Doc = {}): Doc => ({ id: 1, user: 3, achievement: 9, ...overrides })

  const run = (doc: Doc, operation: 'create' | 'update' = 'create') =>
    // @ts-expect-error — хуку достаточно используемых полей
    createAchievementNotification({ doc, previousDoc: {}, operation, req, collection: { slug: 'user-achievements' } })

  beforeEach(() => {
    vi.clearAllMocks()
    store = {
      notifications: [],
      achievements: { '9': { id: 9, title: 'Практик', description: 'Решено 10 задач' } },
      calls: [],
      createFails: false,
    }
    payload = makePayload(store)
    req = makeReq(payload)
  })

  it('содержит название и описание достижения', async () => {
    await run(unlocked())

    expect(store.notifications[0]).toMatchObject({
      title: 'Достижение: Практик',
      message: 'Решено 10 задач',
      type: 'achievement',
      link: '/profile',
    })
  })

  it('достижение без описания даёт пустой текст, а не undefined', async () => {
    store.achievements['9'] = { id: 9, title: 'Практик' }

    await run(unlocked())

    expect(store.notifications[0].message).toBe('')
  })

  it('связи принимаются развёрнутыми', async () => {
    await run(unlocked({ user: { id: 3 }, achievement: { id: 9 } }))

    expect(store.notifications).toHaveLength(1)
  })

  it('чтение и запись идут через req', async () => {
    await run(unlocked())

    expect(store.calls).toHaveLength(2)
    expect(store.calls.every((call) => call.withReq)).toBe(true)
  })

  it('правка записи уведомления не плодит', async () => {
    await run(unlocked(), 'update')

    expect(payload.create).not.toHaveBeenCalled()
  })

  it('skipHooks выключает хук', async () => {
    req.context = { skipHooks: true }
    await run(unlocked())

    expect(payload.create).not.toHaveBeenCalled()
  })

  it('пропавшее достижение не роняет выдачу', async () => {
    await expect(run(unlocked({ achievement: 404 }))).resolves.toBeDefined()

    expect(payload.create).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

import { DEFAULT_POINTS } from '@/lib/points-config'

/**
 * Начисление XP за решённую задачу тренажёра.
 *
 * Цена задачи берётся по приоритету: своя награда задачи → настройка
 * SiteSettings → дефолт.
 */

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

vi.mock('@/lib/telemetry', () => ({
  logger,
  withSpan: (_name: string, _attributes: unknown, fn: () => unknown) => fn(),
}))

const { awardTrainerPoints } = await import('@/payload/hooks/awardTrainerPoints')

type Doc = Record<string, unknown>

interface Store {
  transactions: Doc[]
  tasks: Record<string, Doc>
  settings: Doc | Error
  users: Record<string, Doc>
  createFails: boolean
}

function makePayload(store: Store) {
  const find = vi.fn(async ({ collection, where }: { collection: string; where?: Doc; req?: PayloadRequest }) => {
    if (collection !== 'points-transactions') return { docs: [], totalDocs: 0 }

    const filter = where as
      | { user?: { equals?: unknown }; reason?: { equals?: string }; relatedEntity?: { equals?: string } }
      | undefined

    const docs = store.transactions.filter((tx) => {
      if (filter?.reason?.equals && tx.reason !== filter.reason.equals) return false
      if (filter?.relatedEntity?.equals && tx.relatedEntity !== filter.relatedEntity.equals) return false
      if (filter?.user?.equals !== undefined && tx.user !== filter.user.equals) return false
      return true
    })

    return { docs, totalDocs: docs.length }
  })

  const findGlobal = vi.fn(async () => {
    if (store.settings instanceof Error) throw store.settings
    return store.settings
  })

  const findByID = vi.fn(async ({ collection, id }: { collection: string; id: number | string }) => {
    if (collection !== 'trainer-tasks') return { id }
    const task = store.tasks[String(id)]
    if (!task) throw new Error(`задача ${id} не найдена`)
    return task
  })

  const create = vi.fn(async ({ collection, data }: { collection: string; data: Doc; req?: PayloadRequest }) => {
    if (store.createFails) throw new Error('duplicate key')
    const doc = { id: store.transactions.length + 1, ...data }
    if (collection === 'points-transactions') store.transactions.push(doc)
    return doc
  })

  const update = vi.fn(async ({ collection, id, data }: { collection: string; id: number | string; data: Doc; req?: PayloadRequest }) => {
    if (collection === 'users') store.users[String(id)] = { ...store.users[String(id)], ...data }
    return { id, ...data }
  })

  return { find, findGlobal, findByID, create, update }
}

function makeReq(payload: ReturnType<typeof makePayload>): PayloadRequest {
  const req = Object.create({
    url: 'https://learn.mentorcareer.ru/api/user-trainer-progress',
    method: 'POST',
  }) as PayloadRequest
  req.context = {}
  // @ts-expect-error — хуку достаточно используемой части payload
  req.payload = payload
  return req
}

const TASK_ID = 42
const USER_ID = 3

describe('начисление баллов за задачу тренажёра', () => {
  let store: Store
  let payload: ReturnType<typeof makePayload>
  let req: PayloadRequest

  const progress = (overrides: Doc = {}): Doc => ({
    id: 1,
    user: USER_ID,
    task: TASK_ID,
    isCompleted: true,
    ...overrides,
  })

  const run = (doc: Doc, options: { previousDoc?: Doc; operation?: 'create' | 'update' } = {}) =>
    awardTrainerPoints({
      doc,
      previousDoc: options.previousDoc ?? {},
      operation: options.operation ?? 'create',
      req,
      collection: { slug: 'user-trainer-progress' },
    } as unknown as Parameters<typeof awardTrainerPoints>[0])

  const awarded = () => store.transactions.filter((tx) => tx.reason === 'trainer_task_completed')

  beforeEach(() => {
    vi.clearAllMocks()
    store = {
      transactions: [],
      tasks: { [TASK_ID]: { id: TASK_ID, title: 'Счётчик на замыкании' } },
      settings: {},
      users: { [USER_ID]: { id: USER_ID, totalPoints: 0 } },
      createFails: false,
    }
    payload = makePayload(store)
    req = makeReq(payload)
  })

  describe('когда начисляем', () => {
    it('за впервые решённую задачу', async () => {
      await run(progress())

      expect(awarded()).toHaveLength(1)
      expect(awarded()[0]).toMatchObject({
        user: USER_ID,
        reason: 'trainer_task_completed',
        relatedEntity: String(TASK_ID),
        amount: DEFAULT_POINTS.TRAINER_TASK_COMPLETED,
      })
    })

    it('при переходе из нерешённой в решённую', async () => {
      await run(progress(), { previousDoc: { isCompleted: false }, operation: 'update' })

      expect(awarded()).toHaveLength(1)
    })
  })

  describe('когда не начисляем', () => {
    it('задача ещё не решена', async () => {
      await run(progress({ isCompleted: false }))

      expect(payload.create).not.toHaveBeenCalled()
    })

    it('задача уже была решена — правка записи баллов не добавляет', async () => {
      await run(progress(), { previousDoc: { isCompleted: true }, operation: 'update' })

      expect(payload.create).not.toHaveBeenCalled()
    })

    it('skipHooks на запросе выключает хук целиком', async () => {
      req.context = { skipHooks: true }
      await run(progress())

      expect(payload.find).not.toHaveBeenCalled()
      expect(payload.create).not.toHaveBeenCalled()
    })

    it('повторное решение той же задачи баллов не приносит', async () => {
      await run(progress())
      await run(progress())

      expect(awarded()).toHaveLength(1)
    })

    it('другая задача того же пользователя начисляется отдельно', async () => {
      store.tasks['43'] = { id: 43, title: 'Другая' }

      await run(progress())
      await run(progress({ task: 43 }))

      expect(awarded()).toHaveLength(2)
    })
  })

  describe('сколько начисляем', () => {
    it('по умолчанию — из констант', async () => {
      await run(progress())

      expect(awarded()[0].amount).toBe(DEFAULT_POINTS.TRAINER_TASK_COMPLETED)
    })

    it('настройка из SiteSettings перебивает дефолт', async () => {
      store.settings = { points: { trainerTaskCompleted: 25 } }

      await run(progress())

      expect(awarded()[0].amount).toBe(25)
    })

    it('собственная награда задачи перебивает настройку', async () => {
      store.settings = { points: { trainerTaskCompleted: 25 } }
      store.tasks[TASK_ID] = { id: TASK_ID, pointsReward: 40 }

      await run(progress())

      expect(awarded()[0].amount).toBe(40)
    })

    it('нулевая награда задачи не считается заданной — берётся настройка', async () => {
      store.settings = { points: { trainerTaskCompleted: 25 } }
      store.tasks[TASK_ID] = { id: TASK_ID, pointsReward: 0 }

      await run(progress())

      expect(awarded()[0].amount).toBe(25)
    })

    it('недоступные настройки не ломают начисление — работает дефолт', async () => {
      store.settings = new Error('БД недоступна')

      await run(progress())

      expect(awarded()[0].amount).toBe(DEFAULT_POINTS.TRAINER_TASK_COMPLETED)
    })

    it('пропавшая задача не ломает начисление', async () => {
      store.tasks = {}

      await run(progress())

      expect(awarded()).toHaveLength(1)
    })

    it('развёрнутая связь задачи не требует похода в БД', async () => {
      await run(progress({ task: { id: TASK_ID, pointsReward: 33 } }))

      expect(awarded()[0].amount).toBe(33)
      expect(payload.findByID).not.toHaveBeenCalled()
    })
  })

  describe('пересчёт итоговой суммы', () => {
    it('totalPoints равен сумме всех транзакций пользователя, не только тренажёрных', async () => {
      store.transactions.push({ user: USER_ID, amount: 240, reason: 'lesson_completed' })

      await run(progress())

      expect(payload.update).toHaveBeenCalled()
      expect(store.users[USER_ID].totalPoints).toBe(240 + DEFAULT_POINTS.TRAINER_TASK_COMPLETED)
    })

    it('повторная отправка решённой задачи уходит по раннему return, не пересчитывая', async () => {
      // Ранний return при найденной транзакции стоит до пересчёта.
      store.transactions.push({
        user: USER_ID,
        amount: 10,
        reason: 'trainer_task_completed',
        relatedEntity: String(TASK_ID),
      })
      store.users[USER_ID].totalPoints = 999

      await run(progress())

      expect(payload.create).not.toHaveBeenCalled()
      expect(payload.update).not.toHaveBeenCalled()
      expect(store.users[USER_ID].totalPoints).toBe(999)
    })

    it('расхождение выправляется на следующей новой задаче', async () => {
      store.tasks['43'] = { id: 43, title: 'Другая' }
      store.transactions.push({
        user: USER_ID,
        amount: 10,
        reason: 'trainer_task_completed',
        relatedEntity: String(TASK_ID),
      })
      store.users[USER_ID].totalPoints = 999

      await run(progress({ task: 43 }))

      expect(store.users[USER_ID].totalPoints).toBe(10 + DEFAULT_POINTS.TRAINER_TASK_COMPLETED)
    })

    it('сорвавшаяся запись транзакции не оставляет сумму несчитанной', async () => {
      store.createFails = true

      await expect(run(progress())).resolves.toBeDefined()
      expect(payload.update).toHaveBeenCalled()
      expect(logger.info).not.toHaveBeenCalled()
    })
  })

  describe('вложенные записи не перезапускают хуки', () => {
    it('транзакция создаётся с skipHooks', async () => {
      await run(progress())

      const [args] = payload.create.mock.calls[0]
      expect((args.req as PayloadRequest).context.skipHooks).toBe(true)
    })

    it('обновление пользователя тоже с skipHooks', async () => {
      await run(progress())

      const [args] = payload.update.mock.calls[0]
      expect((args.req as PayloadRequest).context.skipHooks).toBe(true)
    })

    it('исходный запрос остаётся чистым — соседние хуки не глохнут', async () => {
      await run(progress())

      expect(req.context.skipHooks).toBeUndefined()
    })

    it('чтения идут через req — вложенная запись остаётся в транзакции запроса', async () => {
      await run(progress())

      for (const [args] of payload.find.mock.calls) {
        expect(args.req, 'чтение транзакций ушло мимо транзакции запроса').toBeDefined()
      }
    })
  })
})

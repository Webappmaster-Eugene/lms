import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

/**
 * Выдача сертификата при завершении курса или роадмапа.
 *
 * Собственный catch хука гасит любую ошибку, чтобы не уронить начисление
 * баллов, поэтому отказ здесь не виден снаружи — отсюда проверка на `req`
 * в каждом обращении к БД.
 */

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

vi.mock('@/lib/telemetry', () => ({
  logger,
  withSpan: (_name: string, _attributes: unknown, fn: () => unknown) => fn(),
}))

const { createCertificate } = await import('@/payload/hooks/createCertificate')

type Doc = Record<string, unknown>

interface Store {
  certificates: Doc[]
  courses: Record<string, Doc>
  roadmaps: Record<string, Doc>
  calls: { op: string; collection: string; withReq: boolean }[]
}

function makePayload(store: Store) {
  const findByID = vi.fn(
    async ({ collection, id, req }: { collection: string; id: string; req?: PayloadRequest }) => {
      store.calls.push({ op: 'findByID', collection, withReq: req !== undefined })
      const source = collection === 'courses' ? store.courses : store.roadmaps
      const found = source[String(id)]
      if (!found) throw new Error(`${collection}/${id} не найдено`)
      return found
    },
  )

  const find = vi.fn(async ({ collection, req }: { collection: string; req?: PayloadRequest }) => {
    store.calls.push({ op: 'find', collection, withReq: req !== undefined })
    return { docs: store.certificates, totalDocs: store.certificates.length }
  })

  const create = vi.fn(
    async ({
      collection,
      data,
      req,
    }: {
      collection: string
      data: Doc
      req?: PayloadRequest
    }) => {
      store.calls.push({ op: 'create', collection, withReq: req !== undefined })
      const doc = { id: store.certificates.length + 1, ...data }
      store.certificates.push(doc)
      return doc
    },
  )

  return { findByID, find, create }
}

function makeReq(payload: ReturnType<typeof makePayload>): PayloadRequest {
  const req = Object.create({
    url: 'https://learn.mentorcareer.ru/api/points-transactions',
    method: 'POST',
  }) as PayloadRequest
  req.context = {}
  // @ts-expect-error — хуку достаточно используемой части payload
  req.payload = payload
  return req
}

function transaction(overrides: Doc = {}): Doc {
  return { id: 1, user: 3, reason: 'course_completed', relatedEntity: '51', ...overrides }
}

describe('выдача сертификата', () => {
  let store: Store
  let payload: ReturnType<typeof makePayload>
  let req: PayloadRequest

  const run = async (doc: Doc, operation: 'create' | 'update' = 'create') =>
    // @ts-expect-error — хуку достаточно используемых полей
    createCertificate({ doc, previousDoc: {}, operation, req, collection: { slug: 'points-transactions' } })

  beforeEach(() => {
    vi.clearAllMocks()
    store = {
      certificates: [],
      courses: { '51': { id: 51, title: 'Глубокий React' } },
      roadmaps: { '2': { id: 2, title: 'Frontend React' } },
      calls: [],
    }
    payload = makePayload(store)
    req = makeReq(payload)
  })

  describe('обращения к базе идут через req', () => {
    it('курс: и чтение, и запись получают req', async () => {
      await run(transaction())

      expect(store.calls.length).toBeGreaterThan(0)
      for (const call of store.calls) {
        expect(
          call.withReq,
          `${call.op} по коллекции ${call.collection} ушёл мимо транзакции запроса`,
        ).toBe(true)
      }
    })

    it('роадмап: то же самое', async () => {
      await run(transaction({ reason: 'roadmap_completed', relatedEntity: '2' }))

      expect(store.calls.length).toBeGreaterThan(0)
      expect(store.calls.every((call) => call.withReq)).toBe(true)
    })
  })

  describe('успешная выдача', () => {
    it('за курс — с названием курса и типом course', async () => {
      await run(transaction())

      expect(store.certificates).toHaveLength(1)
      expect(store.certificates[0]).toMatchObject({
        user: '3',
        type: 'course',
        title: 'Глубокий React',
        relatedEntity: '51',
      })
    })

    it('за роадмап — с названием роадмапа и типом roadmap', async () => {
      await run(transaction({ reason: 'roadmap_completed', relatedEntity: '2' }))

      expect(store.certificates[0]).toMatchObject({
        type: 'roadmap',
        title: 'Frontend React',
        relatedEntity: '2',
      })
    })

    it('номер сертификата уникален и помечен типом', async () => {
      await run(transaction())
      store.certificates = []
      await run(transaction({ reason: 'roadmap_completed', relatedEntity: '2' }))

      const numberOfCall = (index: number) =>
        String(payload.create.mock.calls[index][0].data.certificateNumber)

      expect(numberOfCall(0)).toMatch(/^MC-C-/)
      expect(numberOfCall(1)).toMatch(/^MC-R-/)
      expect(numberOfCall(0)).not.toBe(numberOfCall(1))
    })

    it('запись сертификата не запускает хуки заново', async () => {
      await run(transaction())

      const [args] = payload.create.mock.calls[0] as [{ context?: { skipHooks?: boolean } }]
      expect(args.context?.skipHooks).toBe(true)
    })
  })

  describe('повторная выдача', () => {
    it('второй раз за тот же курс сертификат не выдаётся', async () => {
      await run(transaction())
      await run(transaction())

      expect(store.certificates).toHaveLength(1)
      expect(payload.create).toHaveBeenCalledTimes(1)
    })
  })

  describe('когда хук не должен срабатывать', () => {
    it.each([
      ['lesson_completed'],
      ['achievement_unlocked'],
      ['trainer_task_completed'],
      ['admin_adjustment'],
    ])('reason %s игнорируется', async (reason) => {
      await run(transaction({ reason }))

      expect(payload.create).not.toHaveBeenCalled()
    })

    it('правка существующей транзакции не выдаёт сертификат повторно', async () => {
      await run(transaction(), 'update')

      expect(payload.create).not.toHaveBeenCalled()
    })

    it('skipHooks на запросе выключает хук', async () => {
      req.context = { skipHooks: true }
      await run(transaction())

      expect(payload.create).not.toHaveBeenCalled()
    })

    it('транзакция без relatedEntity пропускается — выдавать нечего', async () => {
      await run(transaction({ relatedEntity: null }))

      expect(payload.create).not.toHaveBeenCalled()
      expect(store.calls).toHaveLength(0)
    })
  })

  describe('сбой не рушит начисление баллов', () => {
    it('пропавший курс не роняет хук, но попадает в лог', async () => {
      await expect(run(transaction({ relatedEntity: '999' }))).resolves.toBeDefined()

      expect(store.certificates).toHaveLength(0)
      expect(logger.error).toHaveBeenCalled()
    })

    it('отказ записи проглатывается — транзакция баллов уже сохранена', async () => {
      payload.create.mockRejectedValueOnce(new Error('БД недоступна'))

      await expect(run(transaction())).resolves.toBeDefined()
      expect(logger.error).toHaveBeenCalled()
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { bootstrapDefaultAchievements, DEFAULT_ACHIEVEMENTS } from '@/lib/default-achievements'

/**
 * Каталог достижений по умолчанию создаётся на старте прода. Payload и БД —
 * границы: транзакции и запросы подменяются, проверяется, что каталог
 * записывается целиком или не записывается вовсе.
 */

type Req = { transactionID?: string }
type Achievement = { id: number; slug?: string; title: string; criteriaType: string; criteriaValue: number; criteriaEntityId?: string; pointsReward?: number; isActive?: boolean }
type Condition = Record<string, { equals?: unknown; exists?: boolean }>

const transactions = vi.hoisted(() => ({
  createLocalReq: vi.fn(async (): Promise<Req> => ({})),
  initTransaction: vi.fn(async (req: Req) => { req.transactionID = 'tx-1'; return true }),
  commitTransaction: vi.fn(async () => undefined),
  killTransaction: vi.fn(async () => undefined),
}))

vi.mock('payload', () => transactions)
vi.mock('@payloadcms/db-postgres', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values }),
}))

function matches(doc: Achievement, condition: Condition): boolean {
  return Object.entries(condition).every(([field, rule]) => {
    const value = doc[field as keyof Achievement]
    if (rule.exists !== undefined) return (value !== undefined && value !== null) === rule.exists
    return value === rule.equals
  })
}

/** Коллекция achievements в памяти: ровно те условия, что использует bootstrap. */
function fakePayload(stored: Achievement[], options: { session?: boolean } = {}) {
  const execute = vi.fn(async (_query: { text: string }) => undefined)
  const find = vi.fn(async ({ where }: { where: Condition | { and: Condition[] } }) => {
    const conditions = 'and' in where ? where.and as Condition[] : [where as Condition]
    const docs = stored.filter((doc) => conditions.every((condition) => matches(doc, condition)))
    return { docs: docs.slice(0, 1), totalDocs: docs.length }
  })
  const update = vi.fn(async ({ id, data }: { id: number; data: Partial<Achievement> }) => {
    const doc = stored.find((item) => item.id === id)
    Object.assign(doc ?? {}, data)
    return doc
  })
  const create = vi.fn(async ({ data }: { data: Omit<Achievement, 'id'> }) => {
    const doc = { ...data, id: stored.length + 100 }
    stored.push(doc)
    return doc
  })
  const sessions = options.session === false ? {} : { 'tx-1': { db: { execute } } }
  const payload = { db: { sessions }, find, update, create } as unknown as Payload
  return { payload, execute, find, update, create }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('каталог достижений по умолчанию', () => {
  it('на пустой базе создаёт все достижения активными в одной транзакции под блокировкой', async () => {
    const stored: Achievement[] = []
    const { payload, execute, create } = fakePayload(stored)

    await bootstrapDefaultAchievements(payload)

    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0][0].text).toContain('pg_advisory_xact_lock(7207, 1)')
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0])
    expect(stored.map((doc) => doc.slug)).toEqual(DEFAULT_ACHIEVEMENTS.map((definition) => definition.slug))
    expect(stored.every((doc) => doc.isActive === true)).toBe(true)
    expect(transactions.commitTransaction).toHaveBeenCalledTimes(1)
    expect(transactions.killTransaction).not.toHaveBeenCalled()
  })

  it('старое достижение без slug с тем же названием и условием получает slug, награда администратора не меняется', async () => {
    const legacy: Achievement = { id: 5, title: 'Первый шаг', criteriaType: 'lesson_count', criteriaValue: 1, pointsReward: 99 }
    const stored: Achievement[] = [legacy]
    const { payload, update, create } = fakePayload(stored)

    await bootstrapDefaultAchievements(payload)

    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ collection: 'achievements', id: 5, data: { slug: 'first-lesson' } }))
    expect(legacy).toMatchObject({ slug: 'first-lesson', pointsReward: 99 })
    expect(create).toHaveBeenCalledTimes(DEFAULT_ACHIEVEMENTS.length - 1)
    expect(stored.filter((doc) => doc.slug === 'first-lesson')).toHaveLength(1)
  })

  it('повторный запуск по уже заполненному каталогу ничего не пишет', async () => {
    const stored: Achievement[] = []
    await bootstrapDefaultAchievements(fakePayload(stored).payload)
    const second = fakePayload(stored)

    await bootstrapDefaultAchievements(second.payload)

    expect(second.create).not.toHaveBeenCalled()
    expect(second.update).not.toHaveBeenCalled()
    expect(stored).toHaveLength(DEFAULT_ACHIEVEMENTS.length)
  })

  it('сбой посередине откатывает транзакцию целиком и пробрасывается', async () => {
    const { payload, create } = fakePayload([])
    create.mockImplementationOnce(async ({ data }) => ({ ...data, id: 1 }))
    create.mockRejectedValueOnce(new Error('unique violation'))

    await expect(bootstrapDefaultAchievements(payload)).rejects.toThrow('unique violation')

    expect(create).toHaveBeenCalledTimes(2)
    expect(transactions.killTransaction).toHaveBeenCalledTimes(1)
    expect(transactions.commitTransaction).not.toHaveBeenCalled()
  })

  it.each([
    ['транзакция не началась', () => { transactions.initTransaction.mockResolvedValueOnce(false) }, {}, 'Achievement catalogue transaction could not start'],
    ['у адаптера нет сессии транзакции', () => undefined, { session: false }, 'Achievement catalogue requires a transaction'],
  ])('%s — отказ без единой записи', async (_label, arrange, options, message) => {
    arrange()
    const { payload, find, create, update } = fakePayload([], options)

    await expect(bootstrapDefaultAchievements(payload)).rejects.toThrow(message)

    expect(find).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(transactions.killTransaction).toHaveBeenCalledTimes(1)
    expect(transactions.commitTransaction).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PayloadRequest } from 'payload'
import { awardPoints } from '@/payload/hooks/awardPoints'
import { checkAchievements } from '@/payload/hooks/checkAchievements'
import { updateStreak } from '@/payload/hooks/updateStreak'

/**
 * Регрессия на «залипание» контекста: Payload мержит переданный в операцию `context`
 * прямо в объект `req`, поэтому вложенная запись с `context: { skipHooks: true }`
 * раньше выключала все следующие хуки цепочки afterChange — на проде у студента
 * начислялись баллы, но не выдавались достижения и не росла серия.
 */

type Doc = Record<string, unknown>

const TODAY = new Date().toISOString().split('T')[0]

function makePayload(store: { streaks: Doc[]; achievements: Doc[]; calls: string[] }) {
  const find = vi.fn(async ({ collection }: { collection: string }) => {
    switch (collection) {
      case 'streaks':
        return { docs: store.streaks, totalDocs: store.streaks.length }
      case 'achievements':
        return { docs: store.achievements, totalDocs: store.achievements.length }
      default:
        return { docs: [], totalDocs: 0 }
    }
  })

  // Ключевая деталь: Payload присваивает контекст переданному запросу.
  const applyContext = (args: { req?: PayloadRequest; context?: Record<string, unknown> }) => {
    if (args.req && args.context) {
      args.req.context = { ...args.req.context, ...args.context }
    }
  }

  const create = vi.fn(async (args: { collection: string; req?: PayloadRequest; context?: Record<string, unknown>; data: Doc }) => {
    applyContext(args)
    store.calls.push(`create:${args.collection}`)
    if (args.collection === 'streaks') store.streaks.push({ id: 1, ...args.data })
    return { id: 1, ...args.data }
  })

  const update = vi.fn(async (args: { collection: string; req?: PayloadRequest; context?: Record<string, unknown>; data: Doc; id: number | string }) => {
    applyContext(args)
    store.calls.push(`update:${args.collection}`)
    if (args.collection === 'streaks') {
      store.streaks = store.streaks.map((s) => (s.id === args.id ? { ...s, ...args.data } : s))
    }
    return { id: args.id, ...args.data }
  })

  const findByID = vi.fn(async ({ collection, id }: { collection: string; id: number | string }) => {
    if (collection === 'lessons') return { id, course: 7 }
    return { id }
  })

  return { find, create, update, findByID }
}

function makeReq(payload: ReturnType<typeof makePayload>): PayloadRequest {
  const req = Object.create({ url: 'https://lms.local/api/user-progress', method: 'POST' }) as PayloadRequest
  req.context = {}
  // @ts-expect-error — в тесте подменяем только используемую хуками часть payload
  req.payload = payload
  return req
}

describe('цепочка хуков user-progress', () => {
  let store: { streaks: Doc[]; achievements: Doc[]; calls: string[] }
  let payload: ReturnType<typeof makePayload>
  let req: PayloadRequest

  const doc = { id: 10, user: 3, lesson: { id: 42, course: 7 }, isCompleted: true }
  const args = { doc, previousDoc: {}, operation: 'create' as const, collection: { slug: 'user-progress' } }

  beforeEach(() => {
    store = { streaks: [], achievements: [], calls: [] }
    payload = makePayload(store)
    req = makeReq(payload)
  })

  it('после awardPoints контекст запроса остаётся чистым', async () => {
    // @ts-expect-error — хуку достаточно используемых полей
    await awardPoints({ ...args, req })

    expect(store.calls).toContain('create:points-transactions')
    expect(req.context.skipHooks).toBeUndefined()
  })

  it('серия обновляется, даже если предыдущие хуки уже делали вложенные записи', async () => {
    // @ts-expect-error — хуку достаточно используемых полей
    await awardPoints({ ...args, req })
    // @ts-expect-error — хуку достаточно используемых полей
    await checkAchievements({ ...args, req })
    // @ts-expect-error — хуку достаточно используемых полей
    await updateStreak({ ...args, req })

    expect(store.streaks).toHaveLength(1)
    expect(store.streaks[0]).toMatchObject({ currentStreak: 1, lastActivityDate: TODAY })
  })

  it('серия продолжается со вчерашней активности', async () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    store.streaks = [
      {
        id: 1,
        user: 3,
        currentStreak: 4,
        longestStreak: 4,
        // Payload отдаёт дату полным ISO — хук обязан сравнивать календарные дни
        lastActivityDate: `${yesterday.toISOString().split('T')[0]}T00:00:00.000Z`,
        totalActiveDays: 4,
      },
    ]

    // @ts-expect-error — хуку достаточно используемых полей
    await awardPoints({ ...args, req })
    // @ts-expect-error — хуку достаточно используемых полей
    await updateStreak({ ...args, req })

    expect(store.streaks[0]).toMatchObject({
      currentStreak: 5,
      longestStreak: 5,
      lastActivityDate: TODAY,
      totalActiveDays: 5,
    })
  })

  it('явный skipHooks на самом запросе по-прежнему выключает хук', async () => {
    req.context = { skipHooks: true }

    // @ts-expect-error — хуку достаточно используемых полей
    await updateStreak({ ...args, req })

    expect(store.calls).toHaveLength(0)
  })
})

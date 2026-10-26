import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'

import { normalizeRoadmapSequences } from '@/lib/normalize-roadmap-sequences'

/**
 * Нормализация последовательности роадмапа без БД: Payload и транзакции —
 * границы. Главное требование — запись идёт целиком или откатывается.
 */

type Req = { transactionID?: string; user?: unknown }
type Edge = { id: number; edgeId: string; roadmap: number; source: number; target: number }

const transactions = vi.hoisted(() => ({
  createLocalReq: vi.fn(async ({ user }: { user: unknown }): Promise<Req> => ({ user })),
  initTransaction: vi.fn(async (req: Req) => { req.transactionID = 'tx-1'; return true }),
  commitTransaction: vi.fn(async () => undefined),
  killTransaction: vi.fn(async () => undefined),
}))

vi.mock('payload', () => transactions)
vi.mock('@payloadcms/db-postgres', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values }),
}))

const ROADMAP = { id: 7, slug: 'frontend' }
const NODES = [
  { id: 1, nodeId: 'html', label: 'HTML', nodeType: 'topic', order: 0, stage: 'base', positionX: 0, positionY: 0 },
  { id: 2, nodeId: 'css', label: 'CSS', nodeType: 'topic', order: 1, stage: 'base', positionX: 344, positionY: 0 },
]
const admin = { id: 1, role: 'admin' } as User

/** Роадмап из двух тем без связи между ними: план требует создать одну связь. */
function fakePayload(options: { persistEdges?: boolean } = {}) {
  const edges: Edge[] = []
  const execute = vi.fn(async (_query: { text: string }) => undefined)
  const find = vi.fn(async ({ collection, where }: { collection: string; where?: { slug?: { equals: string } } }) => {
    if (collection === 'roadmaps') {
      const slug = where?.slug?.equals
      return { docs: slug && slug !== ROADMAP.slug ? [] : [ROADMAP], hasNextPage: false }
    }
    return { docs: collection === 'roadmap-nodes' ? NODES : [...edges], hasNextPage: false }
  })
  const create = vi.fn(async ({ data }: { data: Omit<Edge, 'id'> }) => {
    const edge = { ...data, id: 100 + edges.length }
    if (options.persistEdges !== false) edges.push(edge)
    return edge
  })
  const update = vi.fn()
  const remove = vi.fn()
  const payload = { db: { sessions: { 'tx-1': { db: { execute } } } }, find, create, update, delete: remove } as unknown as Payload
  return { payload, edges, execute, find, create }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('нормализация последовательности роадмапа', () => {
  it('без apply только показывает план: ни транзакции, ни записи', async () => {
    const { payload, create } = fakePayload()

    const [result] = await normalizeRoadmapSequences(payload, admin)

    expect(result).toMatchObject({ slug: 'frontend', applied: false, plan: { changed: true, edgeCreates: [{ roadmap: 7, source: 1, target: 2 }] } })
    expect(transactions.initTransaction).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('apply блокирует строки до чтения плана, создаёт связь и фиксирует транзакцию', async () => {
    const { payload, edges, execute, find } = fakePayload()

    const [result] = await normalizeRoadmapSequences(payload, admin, { apply: true })

    expect(result.applied).toBe(true)
    expect(edges).toEqual([expect.objectContaining({ roadmap: 7, source: 1, target: 2, edgeType: 'smoothstep', animated: false })])
    expect(execute.mock.calls.map(([query]) => query.text)).toEqual([
      expect.stringContaining('from roadmaps where id = ? for update'),
      expect.stringContaining('from roadmap_nodes where roadmap_id = ? order by id for update'),
      expect.stringContaining('from roadmap_edges where roadmap_id = ? order by id for update'),
    ])
    const firstNodeRead = find.mock.invocationCallOrder[find.mock.calls.findIndex(([args]) => args.collection === 'roadmap-nodes')]
    expect(execute.mock.invocationCallOrder[2]).toBeLessThan(firstNodeRead)
    expect(transactions.commitTransaction).toHaveBeenCalledTimes(1)
    expect(transactions.killTransaction).not.toHaveBeenCalled()
  })

  it('сбой записи откатывает транзакцию и пробрасывается', async () => {
    const { payload, create } = fakePayload()
    create.mockRejectedValueOnce(new Error('deadlock detected'))

    await expect(normalizeRoadmapSequences(payload, admin, { apply: true })).rejects.toThrow('deadlock detected')

    expect(transactions.killTransaction).toHaveBeenCalledTimes(1)
    expect(transactions.commitTransaction).not.toHaveBeenCalled()
  })

  it('если после записи план всё ещё расходится, изменения откатываются', async () => {
    const { payload } = fakePayload({ persistEdges: false })

    await expect(normalizeRoadmapSequences(payload, admin, { apply: true })).rejects.toThrow('Проверка последовательности «frontend» не прошла')

    expect(transactions.killTransaction).toHaveBeenCalledTimes(1)
    expect(transactions.commitTransaction).not.toHaveBeenCalled()
  })

  it('транзакция не открылась — отказ без чтения и записи', async () => {
    transactions.initTransaction.mockResolvedValueOnce(false)
    const { payload, create, execute } = fakePayload()

    await expect(normalizeRoadmapSequences(payload, admin, { apply: true })).rejects.toThrow('Не удалось начать транзакцию нормализации')

    expect(execute).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(transactions.killTransaction).toHaveBeenCalledTimes(1)
  })

  it('неизвестный slug — понятная ошибка, а не пустой результат', async () => {
    const { payload } = fakePayload()

    await expect(normalizeRoadmapSequences(payload, admin, { slug: 'backend' })).rejects.toThrow('Роадмап «backend» не найден')
  })

  it('не администратору отказывает до любых обращений к базе', async () => {
    const { payload, find } = fakePayload()

    await expect(normalizeRoadmapSequences(payload, { id: 2, role: 'student' } as User, { apply: true })).rejects.toThrow('только администратору')

    expect(transactions.createLocalReq).not.toHaveBeenCalled()
    expect(find).not.toHaveBeenCalled()
  })
})

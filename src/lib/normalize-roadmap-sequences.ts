import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload, type PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import type { User } from '@/payload-types'
import { collectAllPages } from '@/lib/paginate'
import { planRoadmapSequence } from '@/lib/roadmap-sequence-plan'

type TransactionAdapter = { sessions: Record<string | number, { db: { execute(query: ReturnType<typeof sql>): Promise<unknown> } } | undefined> }

async function readPlan(payload: Payload, req: PayloadRequest, roadmap: { id: number; slug: string }) {
  // A Payload transaction uses one PostgreSQL client: issue its reads sequentially.
  const nodes = await collectAllPages(({ page, limit }) => payload.find({
    collection: 'roadmap-nodes', where: { roadmap: { equals: roadmap.id } },
    depth: 0, sort: 'id', page, limit, req, overrideAccess: false,
  }))
  const edges = await collectAllPages(({ page, limit }) => payload.find({
    collection: 'roadmap-edges', where: { roadmap: { equals: roadmap.id } },
    depth: 0, sort: 'id', page, limit, req, overrideAccess: false,
  }))
  return planRoadmapSequence(nodes, edges, roadmap.id, roadmap.slug)
}

/** Explicit apply; read-only by default. Nodes, courses, slugs and progress keep their IDs. */
export async function normalizeRoadmapSequences(payload: Payload, admin: User, options: { apply?: boolean; slug?: string } = {}) {
  if (admin.role !== 'admin') throw new Error('Нормализация роадмапов доступна только администратору')
  const req = await createLocalReq({ user: admin }, payload)
  const roadmaps = await collectAllPages(({ page, limit }) => payload.find({
    collection: 'roadmaps', ...(options.slug ? { where: { slug: { equals: options.slug } } } : {}),
    depth: 0, sort: 'id', page, limit, req, overrideAccess: false,
  }))
  if (options.slug && !roadmaps.length) throw new Error(`Роадмап «${options.slug}» не найден`)
  const results: { slug: string; applied: boolean; plan: Awaited<ReturnType<typeof readPlan>> }[] = []
  for (const roadmap of roadmaps) {
    try {
      if (options.apply) {
        if (!await initTransaction(req)) throw new Error('Не удалось начать транзакцию нормализации')
        const transactionId = await req.transactionID
        const adapter = payload.db as unknown as TransactionAdapter
        const db = transactionId === undefined ? undefined : adapter.sessions[transactionId]?.db
        if (!db) throw new Error('Нормализация требует транзакцию')
        // Lock all affected rows before planning so another writer cannot alter a read snapshot.
        await db.execute(sql`select id from roadmaps where id = ${roadmap.id} for update`)
        await db.execute(sql`select id from roadmap_nodes where roadmap_id = ${roadmap.id} order by id for update`)
        await db.execute(sql`select id from roadmap_edges where roadmap_id = ${roadmap.id} order by id for update`)
      }
      const plan = await readPlan(payload, req, roadmap)
      if (options.apply && plan.changed) {
        for (const { id, ...data } of plan.nodeUpdates) await payload.update({ collection: 'roadmap-nodes', id, data, req, overrideAccess: false })
        for (const { id, ...data } of plan.edgeUpdates) await payload.update({ collection: 'roadmap-edges', id, data, req, overrideAccess: false })
        for (const data of plan.edgeCreates) await payload.create({ collection: 'roadmap-edges', data: { ...data, edgeType: 'smoothstep', animated: false }, req, overrideAccess: false })
        for (const id of plan.edgeDeletes) await payload.delete({ collection: 'roadmap-edges', id, req, overrideAccess: false })
        const verified = await readPlan(payload, req, roadmap)
        if (verified.changed) throw new Error(`Проверка последовательности «${roadmap.slug}» не прошла`)
      }
      if (options.apply) await commitTransaction(req)
      results.push({ slug: roadmap.slug, applied: options.apply === true && plan.changed, plan })
    } catch (error) {
      if (options.apply) await killTransaction(req)
      throw error
    }
  }
  return results
}

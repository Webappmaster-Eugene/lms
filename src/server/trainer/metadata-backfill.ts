import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import { APIError, commitTransaction, initTransaction, killTransaction, type PayloadRequest } from 'payload'
import { TRAINER_CATALOG } from '@/data/trainer'
import { enrichTrainerMetadata } from '@/data/trainer/enrich-metadata'
import type { TrainerTaskSeed, TrainerTopicSeed } from '@/data/trainer/types'
import { TRAINER_TAGS, type TrainerCompany, type TrainerTag } from '@/lib/trainer/constants'
import { companyEvidence, safeSourceUrl } from '@/lib/trainer/metadata'
import { collectAllPages } from '@/lib/paginate'
import { relationId } from '@/lib/relation-id'
import type { TrainerTask, TrainerTopic } from '@/payload-types'

const seeds = new Map(TRAINER_CATALOG.flatMap((topic) => topic.tasks.map((task) => [task.slug, { topic, task }] as const)))
const selection = {
  slug: true, title: true, topic: true, difficulty: true, checkMode: true, languages: true,
  tags: true, companies: true, companyEvidence: true, interviewFormat: true, recommendedMinutes: true, sourceUrl: true,
} as const

type MetadataTask = Pick<TrainerTask, 'id' | 'slug' | 'title' | 'topic' | 'difficulty' | 'checkMode' | 'languages' | 'tags' | 'companies' | 'companyEvidence' | 'interviewFormat' | 'recommendedMinutes' | 'sourceUrl'>

function metadataSeed(task: MetadataTask, topic: TrainerTopic | undefined): TrainerTaskSeed {
  const known = seeds.get(task.slug)?.task
  const base: TrainerTaskSeed = {
    slug: task.slug, title: task.title, difficulty: task.difficulty,
    checkMode: task.checkMode ?? 'stdout', languages: task.languages,
    starterCode: '', solutionCode: '', descriptionMd: '',
    tags: (task.tags ?? []) as TrainerTag[], companies: (task.companies ?? []) as TrainerCompany[],
    companyEvidence: companyEvidence(task.companyEvidence),
    ...(task.interviewFormat ? { interviewFormat: task.interviewFormat } : {}),
    ...(task.recommendedMinutes != null ? { recommendedMinutes: task.recommendedMinutes } : {}),
  }
  if (known) {
    base.tags = [...new Set([...(base.tags ?? []), ...(known.tags ?? [])])]
    base.companies = [...new Set([...(base.companies ?? []), ...(known.companyEvidence ?? []).filter((row) => row.kind !== 'unverified').map((row) => row.company)])]
    base.companyEvidence = (base.companies ?? []).map((company) => {
      const current = base.companyEvidence?.find((row) => row.company === company)
      const verified = known.companyEvidence?.find((row) => row.company === company)
      return current?.kind === 'unverified' ? verified ?? current : current ?? verified
    }).filter((row) => row !== undefined)
  }
  const topicSeed: TrainerTopicSeed = {
    slug: topic?.slug ?? '', title: topic?.title ?? '', description: '',
    category: topic?.category ?? 'javascript', order: 0, tasks: [base],
  }
  return enrichTrainerMetadata(topicSeed).tasks[0]
}

/** Only metadata is patched. Conditions, checks, publication and student progress are never replaced. */
export function metadataPatch(task: MetadataTask, topic: TrainerTopic | undefined) {
  const metadata = metadataSeed(task, topic)
  const desired = {
    tags: (metadata.tags ?? []).filter((tag) => TRAINER_TAGS.includes(tag)),
    companies: metadata.companies ?? [],
    companyEvidence: metadata.companyEvidence ?? [],
    interviewFormat: task.interviewFormat ?? metadata.interviewFormat,
    recommendedMinutes: task.recommendedMinutes ?? metadata.recommendedMinutes,
    ...(!task.sourceUrl && safeSourceUrl(seeds.get(task.slug)?.task.sourceUrl) ? { sourceUrl: seeds.get(task.slug)?.task.sourceUrl } : {}),
  }
  return Object.fromEntries(Object.entries(desired).filter(([key, value]) => JSON.stringify(task[key as keyof MetadataTask]) !== JSON.stringify(value))) as Partial<TrainerTask>
}

type Adapter = { sessions: Record<string | number, { db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } } | undefined> }

export async function backfillTrainerMetadata(req: PayloadRequest, dryRun: boolean) {
  if (req.user?.role !== 'admin') throw new APIError('Требуются права администратора', 403)
  const payload = req.payload
  const topics = await collectAllPages(({ page, limit }) => payload.find({ collection: 'trainer-topics', page, limit, depth: 0, overrideAccess: false, req }), { label: 'темы для аудита метаданных' })
  const byTopic = new Map(topics.map((topic) => [topic.id, topic]))
  const tasks = await collectAllPages(({ page, limit }) => payload.find({ collection: 'trainer-tasks', page, limit, depth: 0, sort: 'id', select: selection, overrideAccess: false, req }), { label: 'все задачи для аудита метаданных' })
  const changes: Array<{ id: number; slug: string; fields: string[] }> = []
  if (!dryRun && !(await initTransaction(req))) throw new APIError('Изменение метаданных требует транзакции', 500)
  try {
    const transactionID = await req.transactionID
    const db = transactionID === undefined ? undefined : (payload.db as unknown as Adapter).sessions[transactionID]?.db
    for (const initial of tasks) {
      if (!dryRun) {
        if (!db) throw new APIError('Транзакция недоступна', 500)
        await db.execute(sql`select id from trainer_tasks where id = ${initial.id} for update`)
      }
      const current = dryRun ? initial : await payload.findByID({ collection: 'trainer-tasks', id: initial.id, depth: 0, overrideAccess: false, req })
      const patch = metadataPatch(current, byTopic.get(relationId(current.topic)))
      const fields = Object.keys(patch)
      if (!fields.length) continue
      if (!dryRun) await payload.update({ collection: 'trainer-tasks', id: current.id, data: patch, overrideAccess: false, req })
      changes.push({ id: current.id, slug: current.slug, fields })
    }
    if (!dryRun) await commitTransaction(req)
    return { dryRun, inspected: tasks.length, changed: changes.length, changes }
  } catch (error) {
    if (!dryRun) await killTransaction(req)
    throw error
  }
}

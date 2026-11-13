import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { parseVerdict, weekFromBranch, type ParsedVerdict } from '@/lib/bootcamp-progress'
import { logger } from '@/lib/telemetry'
import type { BootcampEnrollment } from '@/payload-types'

/**
 * Сдачи недель из событий GitLab: одна строка на MR ученика. Каждое событие меняет только свои
 * поля и только если оно не старее записанного - GitLab не обещает порядок доставки вебхуков.
 */

type Json = Record<string, unknown>
type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
const db = (payload: Payload) => (payload.db as unknown as { drizzle: Db }).drizzle
const obj = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const str = (value: unknown): string => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
const rowsOf = <T>(result: unknown) => (result as { rows?: T[] }).rows ?? []

/** GitLab пишет время как «2026-11-13 10:00:00 UTC»; без времени в событии берём момент получения. */
export function gitlabTime(value: unknown): string {
  const text = str(value).trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/, '$1T$2Z')
  const at = Date.parse(text)
  return Number.isFinite(at) ? new Date(at).toISOString() : new Date().toISOString()
}

type MergeRequest = { iid: number; title: string | null; url: string | null; branch: string }

function mergeRequestOf(value: Json, branch?: unknown): MergeRequest | null {
  const iid = Number(value.iid)
  if (!Number.isSafeInteger(iid) || iid <= 0) return null
  return { iid, title: str(value.title).slice(0, 300) || null, url: str(value.url).slice(0, 500) || null, branch: str(branch ?? value.source_branch).slice(0, 100) }
}

async function ensureRow(payload: Payload, enrollment: number, week: number, mr: MergeRequest, openedAt: string | null): Promise<number> {
  const [row] = rowsOf<{ id: number }>(await db(payload).execute(sql`
    insert into bootcamp_week_submissions (enrollment_id, week, mr_iid, title, mr_url, branch, opened_at)
    values (${enrollment}, ${week}, ${mr.iid}, ${mr.title}, ${mr.url}, ${mr.branch || null}, ${openedAt})
    on conflict (enrollment_id, mr_iid) do update set
      week = excluded.week,
      title = coalesce(excluded.title, bootcamp_week_submissions.title),
      mr_url = coalesce(excluded.mr_url, bootcamp_week_submissions.mr_url),
      branch = coalesce(excluded.branch, bootcamp_week_submissions.branch),
      opened_at = coalesce(bootcamp_week_submissions.opened_at, excluded.opened_at),
      updated_at = now()
    returning id`))
  return Number(row.id)
}

async function onMergeRequest(payload: Payload, enrollment: number, body: Json) {
  const attributes = obj(body.object_attributes)
  const mr = mergeRequestOf(attributes)
  const week = weekFromBranch(str(attributes.source_branch))
  if (!mr || week === null) return
  const action = str(attributes.action)
  const at = gitlabTime(attributes.updated_at)
  const id = await ensureRow(payload, enrollment, week, mr, action === 'open' || action === 'reopen' ? gitlabTime(attributes.created_at) : null)
  // opened_at - последнее открытие: закрытие старее него (повтор или доставка не по порядку) MR не закрывает.
  if (action === 'reopen') await db(payload).execute(sql`
    update bootcamp_week_submissions set opened_at = greatest(coalesce(opened_at, ${at}), ${at}),
      closed_at = case when closed_at <= ${at} then null else closed_at end, updated_at = now()
    where id = ${id}`)
  // update без oldrev - правка описания или меток, сдачу она не меняет.
  if (action === 'update' && attributes.oldrev) await db(payload).execute(sql`update bootcamp_week_submissions set last_commit_at = greatest(coalesce(last_commit_at, ${at}), ${at}), updated_at = now() where id = ${id}`)
  if (action === 'merge') await db(payload).execute(sql`update bootcamp_week_submissions set merged_at = coalesce(merged_at, ${at}), updated_at = now() where id = ${id}`)
  if (action === 'close') await db(payload).execute(sql`
    update bootcamp_week_submissions set closed_at = ${at}, updated_at = now()
    where id = ${id} and merged_at is null and (opened_at is null or opened_at <= ${at}) and (closed_at is null or closed_at < ${at})`)
}

async function onPipeline(payload: Payload, enrollment: number, body: Json) {
  const pipeline = obj(body.object_attributes)
  const status = str(pipeline.status)
  if (status !== 'success' && status !== 'failed') return
  const source = obj(body.merge_request)
  const mr = mergeRequestOf(source, source.source_branch ?? pipeline.ref)
  const week = weekFromBranch(mr?.branch)
  if (!mr || week === null) return
  const at = gitlabTime(pipeline.finished_at ?? pipeline.updated_at)
  const id = await ensureRow(payload, enrollment, week, mr, null)
  await db(payload).execute(sql`
    update bootcamp_week_submissions set pipeline_status = ${status}::enum_bootcamp_week_submissions_pipeline_status, pipeline_at = ${at}, updated_at = now()
    where id = ${id} and (pipeline_at is null or pipeline_at <= ${at})`)
}

async function onVerdict(payload: Payload, enrollment: number, body: Json, verdict: ParsedVerdict) {
  const note = obj(body.object_attributes)
  const source = obj(body.merge_request)
  const mr = mergeRequestOf(source)
  if (!mr) return
  // Метка бота точнее ветки: она пишется проверкой той недели, которую она проверяла.
  const week = verdict.week
  const at = gitlabTime(note.updated_at ?? note.created_at)
  const id = await ensureRow(payload, enrollment, week, mr, null)
  // Повторная доставка того же вердикта срок ответа не перезапускает: иначе ушло бы второе напоминание.
  await db(payload).execute(sql`
    update bootcamp_week_submissions set verdict = ${verdict.verdict}::enum_bootcamp_week_submissions_verdict, checks_passed = ${verdict.checksPassed},
      checks_total = ${verdict.checksTotal}, attempt = ${verdict.attempt}, verdict_at = ${at},
      review_alert_at = case when verdict_at is null or verdict_at < ${at} or verdict is distinct from ${verdict.verdict}::enum_bootcamp_week_submissions_verdict then null else review_alert_at end,
      updated_at = now()
    where id = ${id} and (verdict_at is null or verdict_at <= ${at})`)
}

/** Сбой учёта не мешает уведомлению наставника: событие уже пришло, а строку поправит следующее. */
export async function recordSubmission(payload: Payload, enrollment: BootcampEnrollment, event: string | null, body: Json, botNote: boolean): Promise<void> {
  try {
    if (event === 'Merge Request Hook') await onMergeRequest(payload, enrollment.id, body)
    else if (event === 'Pipeline Hook') await onPipeline(payload, enrollment.id, body)
    else if (event === 'Note Hook' && botNote) {
      const verdict = parseVerdict(str(obj(body.object_attributes).note))
      if (verdict) await onVerdict(payload, enrollment.id, body, verdict)
    }
  } catch (error) {
    logger.error('Bootcamp week submission was not recorded', error, { 'enrollment.id': enrollment.id, 'gitlab.event': event ?? '' })
  }
}

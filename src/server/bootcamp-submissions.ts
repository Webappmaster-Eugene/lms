import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { parseVerdict, weekFromBranch } from '@/lib/bootcamp-progress'
import { BOOTCAMP_GITLAB_ORIGIN } from '@/lib/site-links'
import { tutoringHttpsUrl } from '@/lib/tutoring'
import type { BootcampEnrollment, BootcampWeekSubmission } from '@/payload-types'
import { inTransaction, rowsOf, txDb } from '@/server/bootcamp-lead-events'

type Json = Record<string, unknown>
type EventKind = 'mr' | 'pipeline' | 'verdict' | 'comment'
type Patch = Partial<BootcampWeekSubmission>
const obj = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const str = (value: unknown) => typeof value === 'string' ? value : ''
const positiveId = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
const shaOf = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : null

export function enrollmentProjectUrl(enrollment: Pick<BootcampEnrollment, 'streamGroup' | 'gitlabUsername' | 'gitlabProjectUrl'>): string | null {
  const path = '/' + enrollment.streamGroup + '/' + enrollment.gitlabUsername
  const url = enrollment.gitlabProjectUrl || BOOTCAMP_GITLAB_ORIGIN + path
  if (!tutoringHttpsUrl(url)) return null
  const parsed = new URL(url)
  return parsed.pathname === path && !parsed.search && !parsed.hash ? url : null
}

export function gitlabTime(value: unknown) {
  const date = Date.parse(str(value).trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/, '$1T$2Z'))
  return Number.isFinite(date) ? new Date(date).toISOString() : null
}

const clearResults = { verdict: null, verdictAt: null, verdictSha: null, checksPassed: null, checksTotal: null,
  attempt: null, reviewAlertAt: null, pipelineAt: null, pipelineStatus: null }

/** Запись держит порядок событий одного MR. При одинаковом времени коммит GitLab указывает своего предшественника в oldrev. */
function snapshotPatch(mr: Json, old: BootcampWeekSubmission | null, head: string, at: string, merge: boolean): Patch | null {
  if (old?.mergedHeadSha || (old?.headAt && old.headAt > at)) return null
  const changed = old?.headSha !== head
  const closed = mr.state === 'closed' || mr.target_branch !== 'main'
  if (old?.headAt === at && changed && shaOf(mr.oldrev) !== old.headSha) return null
  if (old?.headAt === at && !changed && !merge && (old.closedAt || !closed)) return null
  const opened = mr.state === 'opened'
  return {
    ...((changed || closed) ? clearResults : {}),
    title: str(mr.title).slice(0, 300), headSha: head, headAt: at,
    openedAt: opened && (mr.action === 'reopen' || old?.closedAt) ? at : old?.openedAt ?? gitlabTime(mr.created_at) ?? at,
    lastCommitAt: changed && old?.headSha ? at : old?.lastCommitAt ?? null,
    closedAt: closed ? at : null,
    mergedHeadSha: merge ? head : null, mergedAt: merge ? at : null,
  }
}

export async function recordSubmission(payload: Payload, enrollment: BootcampEnrollment, event: string | null, body: Json): Promise<EventKind | null> {
  if (!['Merge Request Hook', 'Note Hook', 'Pipeline Hook'].includes(event ?? '')) return null
  const attr = obj(body.object_attributes)
  const isMr = event === 'Merge Request Hook'
  const isPipeline = event === 'Pipeline Hook'
  const mr = isMr ? attr : obj(body.merge_request)
  const iid = positiveId(mr.iid)
  const base = enrollmentProjectUrl(enrollment)
  if (!iid || !base || !enrollment.gitlabProjectId || !enrollment.gitlabUserId) return null
  const url = base + '/-/merge_requests/' + iid
  if ((mr.url !== undefined && mr.url !== url) || (mr.web_url !== undefined && mr.web_url !== url)) return null
  const user = positiveId(obj(body.user).id)
  const contributor = enrollment.gitlabUserId
  const ownProject = enrollment.gitlabProjectId
  if ((mr.author_id !== undefined && mr.author_id !== contributor) ||
      (mr.source_project_id !== undefined && mr.source_project_id !== ownProject) ||
      (mr.target_project_id !== undefined && mr.target_project_id !== ownProject)) return null
  const fullSnapshot = mr.author_id === contributor && mr.source_project_id === ownProject && mr.target_project_id === ownProject
  const head = shaOf(obj(mr.last_commit).id)
  const mrAt = gitlabTime(mr.updated_at ?? mr.created_at)
  const at = gitlabTime(isPipeline ? attr.finished_at ?? attr.updated_at : attr.updated_at ?? attr.created_at)
  const branch = str(mr.source_branch)
  if (branch && !/^week-(0[1-9]|1\d|20)$/.test(branch)) return null

  return inTransaction(payload, null, async req => {
    const db = await txDb(req)
    const locked = await db.execute(sql`select id from bootcamp_enrollments where id = ${enrollment.id}
      and status = 'done' and revoked_at is null and revoke_requested_at is null
      and gitlab_project_id = ${ownProject} and gitlab_user_id = ${contributor}
      and gitlab_project_url is not distinct from ${enrollment.gitlabProjectUrl ?? null}
      and stream_group = ${enrollment.streamGroup} and gitlab_username = ${enrollment.gitlabUsername}
      and program is not distinct from ${enrollment.program ?? null}
      for update`)
    if (!rowsOf(locked).length) return null
    const { docs: [old] } = await payload.find({ collection: 'bootcamp-week-submissions', req, depth: 0, limit: 1, overrideAccess: true,
      where: { enrollment: { equals: enrollment.id }, mrIid: { equals: iid } } })
    const week = weekFromBranch(branch || (old?.headSha ? old.branch : ''))
    if (!week || (old?.headSha && branch && old.branch !== branch)) return null
    const canonicalBranch = 'week-' + String(week).padStart(2, '0')
    const persist = async (data: Patch) => {
      const base = { enrollment: enrollment.id, week, mrIid: iid, branch: canonicalBranch, mrUrl: url }
      const options = { collection: 'bootcamp-week-submissions' as const, depth: 0, req, overrideAccess: true, context: { syncBootcampSubmissions: true } }
      if (old) await payload.update({ ...options, id: old.id, data: { ...data, ...base } })
      else await payload.create({ ...options, data: { ...data, ...base } })
    }
    if (isMr) {
      if (!fullSnapshot || !head || !mrAt || !user || !branch || typeof mr.target_branch !== 'string') return null
      if (mr.target_branch !== 'main' && !old?.headSha) return null
      const merge = mr.action === 'merge' && mr.state === 'merged' && mr.target_branch === 'main' && user !== contributor
      if ((mr.state === 'merged' && !merge && mr.target_branch === 'main') ||
          (mr.action === 'merge' && mr.state !== 'merged') || (mr.action === 'open' && user !== contributor) ||
          !['opened', 'closed', 'merged'].includes(str(mr.state))) return null
      const patch = snapshotPatch(mr, old ?? null, head, mrAt, merge)
      if (!patch) return null
      await persist(patch)
      return mr.target_branch === 'main' ? 'mr' : null
    }
    if (mr.target_branch !== undefined && mr.target_branch !== 'main') return null
    if (event === 'Note Hook' && attr.noteable_type !== 'MergeRequest') return null
    if (event === 'Note Hook' && user === contributor) return old?.headSha || (fullSnapshot && mr.target_branch === 'main') ? 'comment' : null
    if (!at) return null

    // Полный снимок MR может прийти с комментарием до вебхука открытия. Сокращенный снимок самостоятельно доступ не подтверждает.
    const canObserve = fullSnapshot && head && mrAt && branch && mr.target_branch === 'main' && mr.state === 'opened'
    const fresh = canObserve && (!old?.headSha || (old.headSha !== head && (!old.headAt || mrAt > old.headAt)))
      ? snapshotPatch(mr, old ?? null, head, mrAt, false) : null
    const current = fresh?.headSha ?? old?.headSha
    if (!current || (head && head !== current) || (!fresh && old?.closedAt)) return null
    if (isPipeline) {
      if (!['success', 'failed'].includes(str(attr.status)) || shaOf(attr.sha) !== current ||
          (!fresh && old?.pipelineAt && at <= old.pipelineAt)) return null
      await persist({ ...fresh, pipelineStatus: attr.status === 'success' ? 'success' : 'failed', pipelineAt: at })
      return 'pipeline'
    }
    const verdict = parseVerdict(str(attr.note))
    const marker = /<!--\s*grader:\d{2}:([0-9a-f]{40})\s*-->/i.exec(str(attr.note))?.[1].toLowerCase()
    if (!user || !verdict || verdict.week !== week || marker !== current) return null
    const { docs: [program] } = await payload.find({ collection: 'bootcamp-programs', req, depth: 0, limit: 1, overrideAccess: true,
      where: { key: { equals: enrollment.program ?? 'nodejs' } }, select: { bootcampGraderUserId: true } })
    if (user !== program?.bootcampGraderUserId || (attr.author_id !== undefined && attr.author_id !== user) ||
        (!fresh && old?.verdictAt && at <= old.verdictAt)) return null
    await persist({ ...fresh, verdict: verdict.verdict, checksPassed: verdict.checksPassed, checksTotal: verdict.checksTotal,
      attempt: verdict.attempt, verdictSha: marker, verdictAt: at, reviewAlertAt: null })
    return 'verdict'
  })
}

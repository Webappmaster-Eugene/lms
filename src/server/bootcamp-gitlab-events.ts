import 'server-only'

import type { Payload } from 'payload'

import { relationId } from '@/lib/relation-id'
import { adminLink, excerpt, notifyAdmins, type AdminEvent } from '@/server/admin-telegram'
import { journal } from '@/server/bootcamp-lead-events'
import { enrollmentProjectUrl, recordSubmission } from '@/server/bootcamp-submissions'
import type { BootcampEnrollment } from '@/payload-types'

/**
 * События проекта ученика из GitLab (вебхук ставит исполнитель при зачислении) - в Telegram
 * наставнику: MR открыт, обновлён, слит или закрыт, CI MR прошёл или упал, вердикт
 * проверки недели и комментарии ученика. Свои комментарии наставника не пересылаются.
 * Те же события ведут учёт сдач недель для экрана «Учёба буткемпа» (bootcamp-submissions).
 */

type Json = Record<string, unknown>
const obj = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const str = (value: unknown): string => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''

async function enrollmentOfProject(payload: Payload, project: Json): Promise<BootcampEnrollment | null> {
  const id = project.id
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null
  const { docs } = await payload.find({ collection: 'bootcamp-enrollments', where: {
    gitlabProjectId: { equals: id }, status: { equals: 'done' }, revokedAt: { exists: false }, revokeRequestedAt: { exists: false },
  }, limit: 2, depth: 0, overrideAccess: true })
  if (docs.length !== 1) return null
  const enrollment = docs[0]
  const expectedPath = enrollment.streamGroup + '/' + enrollment.gitlabUsername
  const url = enrollmentProjectUrl(enrollment)
  if (!enrollment.gitlabUserId || !url || (project.path_with_namespace !== undefined && project.path_with_namespace !== expectedPath) ||
      (project.web_url !== undefined && project.web_url !== url)) return null
  return enrollment
}

function mergeRequestEvent(student: string, body: Json): AdminEvent | null {
  const mr = obj(body.object_attributes)
  const author = obj(body.user)
  const ref = `!${str(mr.iid)} «${str(mr.title)}»`
  const branches = `из ветки ${str(mr.source_branch)} в ${str(mr.target_branch)}`
  const who = str(author.username) || 'кто-то'
  const link = str(obj(body.project).web_url) + '/-/merge_requests/' + str(mr.iid)
  switch (str(mr.action)) {
    case 'open': return { title: `${student} открыл MR`, lines: [ref, branches], link }
    case 'reopen': return { title: `${student}: MR снова открыт`, lines: [ref, `Открыл: ${who}`], link }
    // update без oldrev - смена описания или меток; новые коммиты приходят с oldrev.
    case 'update': return mr.oldrev ? { title: `${student}: в MR новые коммиты`, lines: [ref], link } : null
    case 'merge': return { title: `${student}: MR слит`, lines: [ref, `Слил: ${who}`], link }
    case 'close': return { title: `${student}: MR закрыт без слияния`, lines: [ref, `Закрыл: ${who}`], link }
    default: return null
  }
}

function pipelineEvent(student: string, body: Json): AdminEvent | null {
  const pipeline = obj(body.object_attributes)
  const mr = obj(body.merge_request)
  const status = str(pipeline.status)
  if (!['success', 'failed'].includes(status) || !mr.iid) return null
  const project = obj(body.project)
  const link = str(project.web_url) + '/-/merge_requests/' + str(mr.iid)
  return { title: `${student}: CI MR ${status === 'success' ? 'прошёл' : 'упал'}`, lines: [`!${str(mr.iid)} «${str(mr.title)}», ветка ${str(pipeline.ref)}`], link }
}

/** Комментарий бота - Markdown со служебной меткой и таблицей. В журнал и Telegram идёт только итог. */
export function verdictSummary(note: string): string {
  const text = note.replace(/<!--[\s\S]*?-->/g, '').trim()
  const headline = /^\*\*Доверенная проверка: (.+)\*\*$/m.exec(text)?.[1]
  if (!headline) return excerpt(text, 900)
  const passed = /Прошло проверок: (\d+ из \d+)/.exec(text)?.[1]
  return `${headline.replace(/[—–]/g, '-')}${passed ? `, прошло ${passed}` : ''}`
}

function noteEvent(student: string, body: Json, verdict: boolean): AdminEvent | null {
  const note = obj(body.object_attributes)
  if (str(note.noteable_type) !== 'MergeRequest') return null
  const mr = obj(body.merge_request)
  const ref = `MR !${str(mr.iid)} «${str(mr.title)}»`
  const link = str(obj(body.project).web_url) + '/-/merge_requests/' + str(mr.iid)
  if (verdict) return { title: `${student}: вердикт проверки`, lines: [verdictSummary(str(note.note)), ref], link }
  return { title: `${student}: комментарий в MR`, lines: [ref, excerpt(str(note.note), 900)], link }
}

export async function handleGitlabEvent(payload: Payload, event: string | null, body: unknown): Promise<'notified' | 'ignored'> {
  const raw = obj(body)
  const enrollment = await enrollmentOfProject(payload, obj(raw.project))
  if (!enrollment) return 'ignored'
  const data = { ...raw, project: { ...obj(raw.project), web_url: enrollmentProjectUrl(enrollment) } }
  const student = enrollment.gitlabUsername
  const kind = await recordSubmission(payload, enrollment, event, data)
  if (!kind) return 'ignored'
  const message = event === 'Merge Request Hook' ? mergeRequestEvent(student, data)
    : event === 'Pipeline Hook' ? pipelineEvent(student, data)
      : event === 'Note Hook' ? noteEvent(student, data, kind === 'verdict')
        : null
  if (!message) return 'ignored'
  await journal(payload, { lead: relationId(enrollment.lead), type: 'gitlab_event', message: [message.title, message.lines?.find((line) => typeof line === 'string' && line)].filter(Boolean).join(': '), data: { event } })
  void notifyAdmins({ ...message, link: message.link ?? adminLink(`/admin/collections/bootcamp-leads/${relationId(enrollment.lead)}`) })
  return 'notified'
}

import 'server-only'

import type { Payload } from 'payload'

import { relationId } from '@/lib/relation-id'
import { adminLink, excerpt, notifyAdmins, type AdminEvent } from '@/server/admin-telegram'
import { journal } from '@/server/bootcamp-lead-events'
import type { BootcampEnrollment } from '@/payload-types'

/**
 * События проекта ученика из GitLab (вебхук ставит исполнитель при зачислении) - в Telegram
 * наставнику: MR открыт, обновлён, слит или закрыт, CI MR прошёл или упал, вердикт
 * проверки недели и комментарии ученика. Свои комментарии наставника не пересылаются.
 */

type Json = Record<string, unknown>
const obj = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const str = (value: unknown): string => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''

// Бот группы GitLab (через него грейдер пишет вердикт) получает логин вида group_5_bot_<хеш>.
const isBot = (user: Json) => /^group_\d+_bot_/.test(str(user.username)) || /bot$/i.test(str(user.name))

async function enrollmentOfProject(payload: Payload, project: Json): Promise<BootcampEnrollment | null> {
  const id = Number(project.id)
  if (Number.isSafeInteger(id) && id > 0) {
    const byId = await payload.find({ collection: 'bootcamp-enrollments', where: { gitlabProjectId: { equals: id } }, limit: 1, depth: 0, overrideAccess: true })
    if (byId.docs[0]) return byId.docs[0]
  }
  // Отчёт исполнителя с id проекта мог ещё не дойти: тогда узнаём проект по пути «группа/логин».
  const [group, username, ...rest] = str(project.path_with_namespace).split('/')
  if (!group || !username || rest.length > 0) return null
  const byPath = await payload.find({ collection: 'bootcamp-enrollments', where: { and: [{ streamGroup: { equals: group } }, { gitlabUsername: { equals: username } }] }, limit: 1, depth: 0, overrideAccess: true })
  return byPath.docs[0] ?? null
}

function mergeRequestEvent(student: string, body: Json): AdminEvent | null {
  const mr = obj(body.object_attributes)
  const author = obj(body.user)
  const ref = `!${str(mr.iid)} «${str(mr.title)}»`
  const branches = `из ветки ${str(mr.source_branch)} в ${str(mr.target_branch)}`
  const who = str(author.username) || 'кто-то'
  const link = str(mr.url) || null
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
  const link = str(project.web_url) && str(pipeline.id) ? `${str(project.web_url)}/-/pipelines/${str(pipeline.id)}` : str(mr.url) || null
  return { title: `${student}: CI MR ${status === 'success' ? 'прошёл' : 'упал'}`, lines: [`!${str(mr.iid)} «${str(mr.title)}», ветка ${str(pipeline.ref)}`], link }
}

function noteEvent(student: string, enrollment: BootcampEnrollment, body: Json): AdminEvent | null {
  const note = obj(body.object_attributes)
  if (str(note.noteable_type) !== 'MergeRequest') return null
  const author = obj(body.user)
  const mr = obj(body.merge_request)
  const ref = `MR !${str(mr.iid)} «${str(mr.title)}»`
  const link = str(note.url) || null
  if (isBot(author)) return { title: `${student}: вердикт проверки`, lines: [ref, excerpt(str(note.note), 900)], link }
  if (str(author.username) === enrollment.gitlabUsername) return { title: `${student}: комментарий в MR`, lines: [ref, excerpt(str(note.note), 900)], link }
  return null
}

export async function handleGitlabEvent(payload: Payload, event: string | null, body: unknown): Promise<'notified' | 'ignored'> {
  const data = obj(body)
  const enrollment = await enrollmentOfProject(payload, obj(data.project))
  if (!enrollment) return 'ignored'
  const student = enrollment.gitlabUsername
  const message = event === 'Merge Request Hook' ? mergeRequestEvent(student, data)
    : event === 'Pipeline Hook' ? pipelineEvent(student, data)
      : event === 'Note Hook' ? noteEvent(student, enrollment, data)
        : null
  if (!message) return 'ignored'
  await journal(payload, { lead: relationId(enrollment.lead), type: 'gitlab_event', message: [message.title, message.lines?.find((line) => typeof line === 'string' && line)].filter(Boolean).join(': '), data: { event } })
  void notifyAdmins({ ...message, link: message.link ?? adminLink(`/admin/collections/bootcamp-leads/${relationId(enrollment.lead)}`) })
  return 'notified'
}

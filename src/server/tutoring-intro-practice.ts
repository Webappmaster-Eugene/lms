import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { User } from '@/payload-types'
import { inTransaction, txDb } from '@/server/bootcamp-lead-events'
import { tutoringMergeRequest, tutoringProject } from '@/server/tutoring-projects'
import { TutoringProblem } from '@/server/tutoring'

export async function saveIntroductionSubmission(payload: Payload, user: User, streamId: number, url: string, previous: string) {
  if (!user.isActive) throw new TutoringProblem('Нужен активный аккаунт')
  return inTransaction(payload, user, async req => {
    const tx = await txDb(req)
    await tx.execute(sql`select id from tutoring_streams where id = ${streamId} for share`)
    await tx.execute(sql`select id from tutoring_participants where student_id = ${user.id} and stream_id = ${streamId} for update`)
    const { docs: [member] } = await payload.find({ collection: 'tutoring-participants', req, overrideAccess: true, depth: 1, limit: 1,
      where: { and: [{ student: { equals: user.id } }, { stream: { equals: streamId } }, { active: { equals: true } }] } })
    if (!member || typeof member.stream !== 'object' || member.stream.status !== 'active') {
      throw new TutoringProblem('Сдача доступна участнику открытого потока')
    }
    const project = await tutoringProject(payload, req, user.id, member.stream.program)
    const iid = project?.state === 'ready' && project.projectUrl && tutoringMergeRequest(project.projectUrl, url)
    if (!iid || !project?.projectUrl) throw new TutoringProblem('Нужна ссылка на запрос на слияние в вашем учебном проекте')
    const canonical = project.projectUrl.replace(/\/$/, '') + '/-/merge_requests/' + iid
    if (member.introSubmissionUrl === canonical) return
    if ((member.introSubmissionUrl ?? '') !== previous) throw new TutoringProblem('Ссылка уже изменилась. Обновите страницу.')
    await payload.update({ collection: 'tutoring-participants', id: member.id, req, overrideAccess: true,
      data: { introSubmissionUrl: canonical } })
  })
}

import { createLocalReq } from 'payload'
import { expect, it } from 'vitest'

import { POST as webhook } from '@/app/api/tutoring/gitlab-events/route'
import { tutoringWebhookToken } from '@/server/bootcamp-worker-auth'
import { tutoringWorkChoices } from '@/server/tutoring-merge-requests'
import { tutoringVerdict } from '@/server/tutoring-projects'
import { createStudent, getTestPayload, uid } from '../helpers/payload'

it('подбирает работу по личному проекту и этапу; новый коммит ждет своей проверки', async () => {
  const payload = await getTestPayload()
  const student = await createStudent(payload)
  const other = await createStudent(payload)
  const userId = 5801
  const gitProject = 7601
  const username = uid('tutoring')
  const url = 'https://git.mentorcareer.ru/mentoring-nodejs/' + username
  const first = 'a'.repeat(40)
  const second = 'b'.repeat(40)
  const third = 'c'.repeat(40)
  const project = await payload.create({ collection: 'tutoring-projects', data: {
    student: student.id, program: 'nodejs', username, gitlabUserId: userId, projectId: gitProject, projectUrl: url,
    courseProject: 'bootcamp/course', group: 'mentoring-nodejs', gradingProject: 'bootcamp-staff/grading', state: 'ready', attempts: 1,
  } })
  const { docs: [program] } = await payload.find({ collection: 'bootcamp-programs', where: { key: { equals: 'nodejs' } }, limit: 1 })
  try {
    const token = tutoringWebhookToken(project.id)
    if (!token) throw new Error('Ключ для тестового уведомления GitLab не получен')
    await payload.update({ collection: 'bootcamp-programs', id: program.id, data: { mentoringGraderUserId: 4788 } })
    const req = await createLocalReq({ user: student }, payload)
    const stranger = await createLocalReq({ user: other }, payload)
    const before = await payload.count({ collection: 'tutoring-reviews' })
    const mr = { author_id: userId, source_project_id: gitProject, target_project_id: gitProject,
      iid: 7, url: url + '/-/merge_requests/7', source_branch: 'week-03', target_branch: 'main',
      title: 'Бронь последнего экземпляра', state: 'opened', action: 'open', last_commit: { id: first },
      updated_at: '2027-02-17T10:01:00Z' }
    const send = async (event: string, data: object) => {
      const response = await webhook(new Request('http://localhost/api/tutoring/gitlab-events?project=' + project.id, {
        method: 'POST',
        headers: { 'x-gitlab-token': token, 'x-gitlab-event': event, 'content-type': 'application/json' },
        body: JSON.stringify({ project: { id: gitProject }, ...data }),
      }))
      expect(response.status).toBe(200)
      return (await response.json()).recorded
    }
    const hook = (patch: Record<string, unknown> = {}) => send('Merge Request Hook', { object_attributes: { ...mr, ...patch } })
    const grade = (sha: string, time: string) => send('Note Hook', {
      user: { id: 4788 }, merge_request: { ...mr, last_commit: { id: sha } }, object_attributes: {
        noteable_type: 'MergeRequest', updated_at: time,
        note: '<!-- grader:03:' + sha + ' -->\n**Доверенная проверка: неделя 3 - пройдена**\nПрошло проверок: 4 из 4.',
      },
    })

    expect(await hook({ author_id: 999 })).toBe(false)
    expect(await hook({ source_project_id: 999 })).toBe(false)
    expect(await hook({ url: 'https://git.mentorcareer.ru/other/-/merge_requests/7' })).toBe(false)
    expect(await hook({ source_branch: 'main' })).toBe(false)
    expect(await hook()).toBe(true)
    expect(await hook()).toBe(false)
    expect(await tutoringWorkChoices(payload, req, project, 3)).toEqual([{ iid: mr.iid, title: mr.title, url: mr.url }])
    expect(await tutoringWorkChoices(payload, stranger, project, 3)).toEqual([])
    expect(await tutoringWorkChoices(payload, req, project, 2)).toEqual([])
    expect((await payload.count({ collection: 'tutoring-reviews' })).totalDocs).toBe(before.totalDocs)
    expect(await tutoringVerdict(payload, req, project.id, mr.iid)).toBeNull()

    expect(await grade(first, '2027-02-17T10:04:00Z')).toBe(true)
    expect(await hook({ action: 'update', oldrev: first, last_commit: { id: second }, updated_at: '2027-02-17T10:03:00Z' })).toBe(true)
    expect(await grade(first, '2027-02-17T10:05:00Z')).toBe(false)
    expect((await tutoringVerdict(payload, req, project.id, mr.iid))?.verdict).toBe('pending')
    expect(await grade(second, '2027-02-17T10:06:00Z')).toBe(true)
    expect((await tutoringVerdict(payload, req, project.id, mr.iid))?.commitSha).toBe(second)
    expect(await hook({ action: 'update', oldrev: second, last_commit: { id: third }, updated_at: '2027-02-17T10:03:00Z' })).toBe(true)
    expect(await hook({ action: 'update', oldrev: first, last_commit: { id: second }, updated_at: '2027-02-17T10:03:00Z' })).toBe(false)
    expect((await tutoringVerdict(payload, req, project.id, mr.iid))?.verdict).toBe('pending')
    expect(await grade(second, '2027-02-17T10:06:01Z')).toBe(false)
    expect(await grade(third, '2027-02-17T10:06:02Z')).toBe(true)

    expect(await hook({ state: 'closed', action: 'close', updated_at: '2027-02-17T10:07:00Z' })).toBe(true)
    expect(await hook()).toBe(false)
    expect(await tutoringWorkChoices(payload, req, project, 3)).toEqual([])
  } finally {
    await payload.update({ collection: 'bootcamp-programs', id: program.id, data: { mentoringGraderUserId: program.mentoringGraderUserId ?? null } })
    await payload.delete({ collection: 'tutoring-projects', id: project.id })
  }
})

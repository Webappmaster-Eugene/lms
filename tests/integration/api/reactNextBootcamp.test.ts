import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, type Payload } from 'payload'

import { REACT_NEXT_BOOTCAMP, setupReactNextBootcamp, type BootcampSetupApi } from '@/lib/react-next-bootcamp-setup'
import { entryTaskSetForLead } from '@/server/bootcamp-entry-task'
import { getLearningAccess } from '@/server/learning-access'
import { paymentPageState } from '@/server/bootcamp-payment'
import { confirmEnrollmentIdentity } from '@/server/enrollment-identity'
import { POST as pathAction } from '@/app/api/bootcamp/leads/[id]/path/route'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, rest, uid, type CourseTree, type TestUser } from '../helpers/payload'

let payload: Payload
let admin: TestUser
let student: TestUser
let frontend: CourseTree
let node: CourseTree
let token: string
let api: BootcampSetupApi

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  student = await createStudent(payload, { learningAccessMode: 'all', learningCatalogVisibility: 'catalog' })
  token = await login(payload, admin)
  frontend = await createCourseTree(payload, { lessons: 1 })
  node = await createCourseTree(payload, { lessons: 1 })
  for (const tree of [frontend, node]) {
    await payload.update({
      collection: 'courses', id: tree.course.id,
      data: { isBootcamp: true, ...(tree === frontend ? { slug: REACT_NEXT_BOOTCAMP.courseSlug } : {}) },
    })
  }
  const req = await createLocalReq({ user: admin }, payload)
  api = {
    findCourse: async (slug) => (await payload.find({ collection: 'courses', where: { slug: { equals: slug } }, limit: 2, depth: 0, overrideAccess: false, req })).docs.map((doc) => ({ ...doc })),
    findProgram: async (key) => (await payload.find({ collection: 'bootcamp-programs', where: { key: { equals: key } }, limit: 2, depth: 0, overrideAccess: false, req })).docs.map((doc) => ({ ...doc })),
    createProgram: async (data) => ({ ...await payload.create({ collection: 'bootcamp-programs', data, overrideAccess: false, req }) }),
    readProgram: async (id) => ({ ...await payload.findByID({ collection: 'bootcamp-programs', id, depth: 0, overrideAccess: false, req }) }),
  }
})

describe('React + Next.js как отдельная платная программа LMS', () => {
  it('настоящий Payload сохраняет условия, привязки и закрытый набор; повтор не создаёт дубль', async () => {
    expect((await setupReactNextBootcamp(api)).action).toBe('planned')
    const first = await setupReactNextBootcamp(api, true)
    expect(first).toMatchObject({ action: 'created', isActive: false })
    expect(await setupReactNextBootcamp(api, true)).toEqual({ ...first, action: 'unchanged' })
    const programs = await api.findProgram(REACT_NEXT_BOOTCAMP.key)
    expect(programs).toHaveLength(1)
    expect(programs[0]).toMatchObject({
      manualsCourse: frontend.course.id, isActive: false, priceKopecks: 2_000_000,
      gitlabCourseProject: 'react-next/course', gradingProject: 'react-next-staff/grading',
      entryTaskSet: 'rental-frontend-js',
    })
    const set = await entryTaskSetForLead(payload, { program: REACT_NEXT_BOOTCAMP.key })
    expect(set.key).toBe('rental-frontend-js')
    expect(set.tasks).toHaveLength(3)
  })

  it('аноним и ученик не меняют программу', async () => {
    const programs = await api.findProgram(REACT_NEXT_BOOTCAMP.key)
    const id = programs[0]?.id
    if (!id) throw new Error('Программа не создана')
    const studentToken = await login(payload, student)
    for (const accessToken of [undefined, studentToken]) {
      const response = await rest('PATCH', `/bootcamp-programs/${id}`, { token: accessToken, body: { isActive: true } })
      expect([401, 403, 404]).toContain(response.status)
    }
    expect((await api.readProgram(id)).isActive).toBe(false)
  })

  it('режим «все курсы» не открывает ни один буткемп, назначение frontend не открывает Node.js', async () => {
    const before = await getLearningAccess(payload, student, await createLocalReq({ user: student }, payload))
    expect(before.canAccessCourse(frontend.course.id)).toBe(false)
    expect(before.canAccessCourse(node.course.id)).toBe(false)
    const req = await createLocalReq({ user: admin }, payload)
    await payload.create({
      collection: 'learning-access-grants', req, overrideAccess: false,
      data: { user: student.id, target: { relationTo: 'courses', value: frontend.course.id }, effect: 'allow', ruleKey: 'server-generated' },
    })
    const after = await getLearningAccess(payload, student, await createLocalReq({ user: student }, payload))
    expect(after.canAccessCourse(frontend.course.id)).toBe(true)
    expect(after.canAccessCourse(node.course.id)).toBe(false)
  })

  it('курс сохраняет оба флага после обычного REST-сохранения', async () => {
    expect((await rest('PATCH', `/courses/${frontend.course.id}`, { token, body: { assignedOnly: false } })).status).toBe(200)
    expect(await payload.findByID({ collection: 'courses', id: frontend.course.id })).toMatchObject({ isBootcamp: true, assignedOnly: true })
  })

  it('допуск берёт условия React + Next.js, а только подтверждённая оплата открывает его курс', async () => {
    const candidate = await createStudent(payload)
    await confirmEnrollmentIdentity(payload, admin, candidate.id, candidate.email)
    const lead = await payload.create({
      collection: 'bootcamp-leads',
      data: {
        email: candidate.email, name: 'Иван Петров', program: 'react-next', status: 'diagnostic',
        consentVersion: '2026-11-05', consentAt: new Date().toISOString(),
        entrySubmittedAt: new Date().toISOString(), submissionCount: 1,
      },
    })
    const act = (body: Record<string, unknown>) => pathAction(new Request('http://lms.test/api/x', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: String(lead.id) }) })
    expect((await act({
      action: 'admit', firstName: 'Иван', lastName: 'Петров', username: uid('frontend'),
      group: REACT_NEXT_BOOTCAMP.gitlabStreamGroup, accessUntil: '', amount: '', dueDays: '', comment: '',
    })).status).toBe(200)
    const admitted = await payload.findByID({ collection: 'bootcamp-leads', id: lead.id, depth: 0 })
    expect(admitted.paymentAmountKopecks).toBe(2_000_000)
    expect(await paymentPageState(payload, admitted)).toMatchObject({
      program: 'React + Next.js', offerUrl: REACT_NEXT_BOOTCAMP.offerUrl,
      landingUrl: REACT_NEXT_BOOTCAMP.landingUrl,
    })
    const before = await getLearningAccess(payload, candidate, await createLocalReq({ user: candidate }, payload))
    expect(before.canAccessCourse(frontend.course.id)).toBe(false)
    expect((await act({ action: 'mark-paid', amount: '20000', comment: 'Локальная проверка подтверждённой оплаты' })).status).toBe(200)
    const after = await getLearningAccess(payload, candidate, await createLocalReq({ user: candidate }, payload))
    expect(after.canAccessCourse(frontend.course.id)).toBe(true)
    expect(after.canAccessCourse(node.course.id)).toBe(false)
    const enrollments = await payload.find({ collection: 'bootcamp-enrollments', where: { lead: { equals: lead.id } }, depth: 0 })
    expect(enrollments.docs).toHaveLength(1)
    expect(enrollments.docs[0]).toMatchObject({
      program: 'react-next', courseProject: 'react-next/course', gradingProject: 'react-next-staff/grading',
    })
  })
})

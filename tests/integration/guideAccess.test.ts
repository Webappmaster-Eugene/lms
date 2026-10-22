import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, type Payload } from 'payload'

import { getGuideAccess } from '@/server/guide-access'
import { lexical } from './helpers/fixtures'
import { createAdmin, createStudent, getTestPayload, login, rest, uid, type TestUser } from './helpers/payload'

let payload: Payload
let admin: TestUser
beforeAll(async () => { payload = await getTestPayload(); admin = await createAdmin(payload) })

async function guide(isPublished = true) {
  return payload.create({ collection: 'guides', data: { title: uid('Гайд'), slug: uid('guide'), summary: 'Кратко', content: lexical('Текст'), isPublished } })
}
async function grant(userId: number, guideId: number, effect: 'allow' | 'deny' = 'allow', extra: { expiresAt?: string } = {}) {
  return payload.create({ collection: 'learning-access-grants', req: await createLocalReq({ user: admin }, payload), data: { user: userId, target: { relationTo: 'guides', value: guideId }, effect, ruleKey: 'server-generated', ...extra } })
}
async function setGuidesMode(user: TestUser, guidesAccessMode: 'all' | 'assigned') {
  await payload.update({ collection: 'users', id: user.id, data: { guidesAccessMode }, req: await createLocalReq({ user: admin }, payload) })
}
async function visibleIds(token: string, ids: number[]) {
  const response = await rest('GET', `/guides?depth=0&limit=100&where[id][in]=${ids.join(',')}`, { token })
  expect(response.status).toBe(200)
  return (response.json.docs as { id: number }[]).map((doc) => doc.id).sort((a, b) => a - b)
}

describe('выборочный доступ к гайдам', () => {
  it('доступ ко всем курсам не открывает гайды: без назначения ученик не видит ни одного', async () => {
    const student = await createStudent(payload, { learningAccessMode: 'all', trainerAccessMode: 'all', learningCatalogVisibility: 'catalog' })
    const token = await login(payload, student)
    const published = await guide()
    expect(await visibleIds(token, [published.id])).toEqual([])
    expect((await rest('GET', `/guides/${published.id}`, { token })).status).toBe(404)
    expect((await getGuideAccess(payload, student)).hasAccess).toBe(false)
    expect((await rest('GET', `/users/${student.id}`, { token })).json.guidesAccessMode).toBe('assigned')
  })

  it('назначение открывает один гайд; черновик закрыт даже с назначением; истёкшее не действует', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    const [open, other, draft, expired] = [await guide(), await guide(), await guide(false), await guide()]
    await grant(student.id, open.id)
    await grant(student.id, draft.id)
    await grant(student.id, expired.id, 'allow', { expiresAt: '2026-01-01T00:00:00.000Z' })
    expect(await visibleIds(token, [open.id, other.id, draft.id, expired.id])).toEqual([open.id])
    expect((await rest('GET', `/guides/${draft.id}`, { token })).status).toBe(404)
  })

  it('режим «все гайды» открывает опубликованные, запрет закрывает отдельный; смену видно в аудите', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    const [first, second] = [await guide(), await guide()]
    await setGuidesMode(student, 'all')
    expect(await visibleIds(token, [first.id, second.id])).toEqual([first.id, second.id].sort((a, b) => a - b))
    await grant(student.id, second.id, 'deny')
    expect(await visibleIds(token, [first.id, second.id])).toEqual([first.id])
    const policy = await payload.find({ collection: 'learning-access-policies', where: { user: { equals: student.id } }, limit: 1, depth: 0 })
    expect(policy.docs[0]?.guidesMode).toBe('all')
    const audit = await payload.find({ collection: 'learning-access-audit', where: { and: [{ userId: { equals: student.id } }, { targetType: { equals: 'users.guidesAccessMode' } }] }, limit: 1, depth: 0 })
    expect(audit.docs[0]).toMatchObject({ actorId: admin.id, effect: 'allow', current: { guidesAccessMode: 'all' } })
  })

  it('ученик не открывает себе гайды правкой своего профиля', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    const published = await guide()
    const response = await rest('PATCH', `/users/${student.id}`, { token, body: { guidesAccessMode: 'all', bio: 'обновлено' } })
    expect(response.status).toBe(200)
    expect(await visibleIds(token, [published.id])).toEqual([])
    const policy = await payload.find({ collection: 'learning-access-policies', where: { user: { equals: student.id } }, limit: 1, depth: 0 })
    expect(policy.docs[0]?.guidesMode ?? 'assigned').toBe('assigned')
  })

  it('удаление гайда удаляет назначения на него', async () => {
    const student = await createStudent(payload)
    const removed = await guide()
    await grant(student.id, removed.id)
    await payload.delete({ collection: 'guides', id: removed.id, req: await createLocalReq({ user: admin }, payload) })
    const left = await payload.find({ collection: 'learning-access-grants', where: { user: { equals: student.id } }, depth: 0 })
    expect(left.totalDocs).toBe(0)
  })

  it('администратор видит все гайды, включая черновики', async () => {
    const token = await login(payload, admin)
    const [published, draft] = [await guide(), await guide(false)]
    expect(await visibleIds(token, [published.id, draft.id])).toEqual([published.id, draft.id].sort((a, b) => a - b))
  })
})

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, type CollectionBeforeChangeHook, type CollectionSlug, type Payload } from 'payload'

import { logger } from '@/lib/telemetry'
import type { User } from '@/payload-types'
import { captureEmails, createAdmin, createCourseTree, createStudent, getTestPayload, login, rest, uid, type TestUser } from '../helpers/payload'

/**
 * Ветки хуков, которых нет в общей матрице `hooks.test.ts` и `access.test.ts`:
 * откат составных операций при сбое посреди транзакции, восстановление
 * служебных флагов контекста, аудит назначений с удалённой целью, выход со всех устройств.
 */
let payload: Payload
let admin: TestUser
let adminUser: User

const count = async (collection: CollectionSlug, where: Record<string, unknown>) =>
  (await payload.count({ collection, where: where as never, overrideAccess: true })).totalDocs
const adminReq = () => createLocalReq({ user: adminUser }, payload)

/** Временный хук, который роняет запись в коллекцию посреди транзакции. */
function failWrites(collection: CollectionSlug, when: (data: Record<string, unknown>) => boolean, message: string) {
  const hooks = payload.collections[collection].config.hooks.beforeChange ??= []
  const fail: CollectionBeforeChangeHook = ({ data }) => {
    if (when(data)) throw new Error(message)
    return data
  }
  hooks.push(fail)
  return () => { hooks.splice(hooks.indexOf(fail), 1) }
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  adminUser = await payload.findByID({ collection: 'users', id: admin.id, depth: 0 })
})
afterEach(() => { vi.restoreAllMocks() })

describe('уведомления о гайдах: сбой рассылки откатывает изменение', () => {
  async function draft() {
    return payload.create({ collection: 'guides', data: { title: uid('Гайд'), slug: uid('rollback-guide'), summary: 'Кратко', markdown: 'Текст', isPublished: false } })
  }
  async function setGuidesMode(user: TestUser, guidesAccessMode: 'all' | 'assigned') {
    return payload.update({ collection: 'users', id: user.id, data: { guidesAccessMode }, req: await adminReq() })
  }

  it('первая публикация: сбой на втором получателе — гайд остаётся черновиком, первое уведомление тоже откатывается', async () => {
    const [first, second] = [await createStudent(payload), await createStudent(payload)]
    const item = await draft()
    for (const user of [first, second]) {
      await payload.create({ collection: 'learning-access-grants', req: await adminReq(), data: { user: user.id, target: { relationTo: 'guides', value: item.id }, effect: 'allow', ruleKey: 'server-generated' } })
    }
    const errors = vi.spyOn(logger, 'error')
    const restore = failWrites('notifications', (data) => data.user === second.id, 'notification-write-failure')
    try {
      await expect(payload.update({ collection: 'guides', id: item.id, data: { isPublished: true }, req: await adminReq() })).rejects.toThrow('notification-write-failure')
    } finally { restore() }
    expect(errors).toHaveBeenCalledWith('Не удалось разослать уведомление о новом гайде', expect.any(Error), { 'guide.id': item.id })
    const stored = await payload.findByID({ collection: 'guides', id: item.id, depth: 0 })
    expect(stored.isPublished).toBe(false)
    expect(stored.announcedAt ?? null).toBeNull()
    expect(await count('notifications', { user: { in: [first.id, second.id] } })).toBe(0)

    // Повторная публикация после сбоя рассылает обоим ровно по одному уведомлению.
    await payload.update({ collection: 'guides', id: item.id, data: { isPublished: true }, req: await adminReq() })
    expect(await count('notifications', { user: { equals: first.id } })).toBe(1)
    expect(await count('notifications', { user: { equals: second.id } })).toBe(1)
  })

  it('назначение опубликованного гайда: сбой уведомления — назначения и записи аудита нет', async () => {
    const student = await createStudent(payload)
    const item = await draft()
    await payload.update({ collection: 'guides', id: item.id, data: { isPublished: true }, req: await adminReq() })
    const errors = vi.spyOn(logger, 'error')
    const restore = failWrites('notifications', (data) => data.user === student.id, 'grant-notification-failure')
    try {
      await expect(payload.create({ collection: 'learning-access-grants', req: await adminReq(), data: { user: student.id, target: { relationTo: 'guides', value: item.id }, effect: 'allow', ruleKey: 'server-generated' } })).rejects.toThrow('grant-notification-failure')
    } finally { restore() }
    expect(errors).toHaveBeenCalledWith('Не удалось отправить уведомление о назначенном гайде', expect.any(Error), { 'guide.id': item.id, 'user.id': student.id })
    expect(await count('learning-access-grants', { user: { equals: student.id } })).toBe(0)
    expect(await count('learning-access-audit', { userId: { equals: student.id } })).toBe(0)
  })

  it('режим «все гайды»: сбой уведомления — режим ученика не меняется', async () => {
    const student = await createStudent(payload)
    await payload.create({ collection: 'guides', context: { skipHooks: true }, data: { title: uid('Гайд'), slug: uid('mode-guide'), summary: 'Кратко', markdown: 'Текст', isPublished: true } })
    const errors = vi.spyOn(logger, 'error')
    const restore = failWrites('notifications', (data) => data.user === student.id, 'mode-notification-failure')
    try {
      await expect(setGuidesMode(student, 'all')).rejects.toThrow('mode-notification-failure')
    } finally { restore() }
    expect(errors).toHaveBeenCalledWith('Не удалось отправить уведомление об открытых гайдах', expect.any(Error), { 'user.id': student.id })
    const policy = (await payload.find({ collection: 'learning-access-policies', where: { user: { equals: student.id } }, depth: 0 })).docs[0]
    expect(policy?.guidesMode).toBe('assigned')
    expect((await payload.findByID({ collection: 'users', id: student.id, depth: 0 })).guidesAccessMode).toBe('assigned')
  })
})

describe('удаление пользователя: зависимые записи', () => {
  it('сбой очистки посреди удаления откатывает и удаление, и уже очищенные записи', async () => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 1 })
    await payload.create({ collection: 'user-progress', data: { user: student.id, lesson: tree.lessons[0].id, isCompleted: false } as never, overrideAccess: true })
    await payload.create({ collection: 'notes', data: { user: student.id, lesson: tree.lessons[0].id, content: 'Заметка' }, overrideAccess: true })
    const errors = vi.spyOn(logger, 'error')
    const deleteMany = payload.delete.bind(payload)
    vi.spyOn(payload, 'delete').mockImplementation(((args: Parameters<Payload['delete']>[0]) => args.collection === 'notes'
      ? Promise.reject(new Error('notes-cleanup-failure'))
      : deleteMany(args as never)) as Payload['delete'])
    await expect(payload.delete({ collection: 'users', id: student.id, req: await adminReq() })).rejects.toThrow('notes-cleanup-failure')
    vi.restoreAllMocks()
    expect(errors).toHaveBeenCalledWith('Не удалось очистить связи: пользователь', expect.any(Error), { 'doc.id': String(student.id), collection: 'notes' })
    expect(await count('users', { id: { equals: student.id } })).toBe(1)
    // Прогресс чистится раньше заметок — и всё равно на месте: одна транзакция.
    expect(await count('user-progress', { user: { equals: student.id } })).toBe(1)
    expect(await count('learning-access-policies', { user: { equals: student.id } })).toBe(1)
    expect(await count('notes', { user: { equals: student.id } })).toBe(1)

    await payload.delete({ collection: 'users', id: student.id, req: await adminReq() })
    expect(await count('users', { id: { equals: student.id } })).toBe(0)
    expect(await count('user-progress', { user: { equals: student.id } })).toBe(0)
  })

  it('служебные права очистки не остаются в контексте запроса после удаления', async () => {
    const [first, second] = [await createStudent(payload), await createStudent(payload)]
    const req = await createLocalReq({ user: adminUser, context: { syncStudentAnalytics: 'внешнее значение' } }, payload)
    await payload.delete({ collection: 'users', id: first.id, req })
    expect(req.context.syncStudentAnalytics).toBe('внешнее значение')
    expect(req.context.syncLearningAccessPolicy).toBeUndefined()
    expect(req.context.syncAuthSessionRevocations).toBeUndefined()
    // С тем же запросом нельзя напрямую удалить чужую политику доступа: флаг снят.
    await expect(payload.delete({ collection: 'learning-access-policies', where: { user: { equals: second.id } }, req, overrideAccess: true })).resolves.toMatchObject({ errors: [expect.anything()] })
    expect(await count('learning-access-policies', { user: { equals: second.id } })).toBe(1)
  })
})

describe('назначения доступа: даты и аудит', () => {
  it.each([
    ['окончание раньше начала', { startsAt: '2026-11-02T00:00:00.000Z', expiresAt: '2026-11-01T00:00:00.000Z' }],
    ['окончание равно началу', { startsAt: '2026-11-02T00:00:00.000Z', expiresAt: '2026-11-02T00:00:00.000Z' }],
  ])('%s — ошибка у поля «Доступ до», назначение не создаётся', async (_, dates) => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 1 })
    const error = await payload.create({ collection: 'learning-access-grants', req: await adminReq(), data: { user: student.id, target: { relationTo: 'courses', value: tree.course.id }, effect: 'allow', ruleKey: 'server-generated', ...dates } }).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ data: { errors: [{ path: 'expiresAt', message: 'Окончание доступа должно быть позже начала; даты должны быть корректны' }] } })
    expect(await count('learning-access-grants', { user: { equals: student.id } })).toBe(0)
  })

  it('удаление назначения, цель которого уже стёрта мимо хуков, всё равно попадает в аудит с исходной целью', async () => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 1 })
    const key = uid('orphan-lesson')
    const lesson = await payload.create({ collection: 'lessons', data: { title: key, slug: key, course: tree.course.id, isPublished: true } })
    const grant = await payload.create({ collection: 'learning-access-grants', req: await adminReq(), data: { user: student.id, target: { relationTo: 'lessons', value: lesson.id }, effect: 'deny', ruleKey: 'server-generated' } })
    expect(grant.ruleKey).toBe(`${student.id}:lessons:${lesson.id}`)
    await payload.db.deleteOne({ collection: 'lessons', where: { id: { equals: lesson.id } } })
    const orphan = await payload.findByID({ collection: 'learning-access-grants', id: grant.id, depth: 0, overrideAccess: true })
    expect(orphan.target?.value ?? null).toBeNull()

    await payload.delete({ collection: 'learning-access-grants', id: grant.id, req: await adminReq() })
    const audit = await payload.find({ collection: 'learning-access-audit', where: { and: [{ grantId: { equals: grant.id } }, { operation: { equals: 'delete' } }] }, depth: 0, overrideAccess: true })
    expect(audit.docs).toHaveLength(1)
    expect(audit.docs[0]).toMatchObject({ actorId: admin.id, userId: student.id, targetType: 'lessons', targetId: lesson.id, effect: 'deny', current: null })
  })
})

describe('выход со всех устройств', () => {
  it('allSessions=true отзывает все сессии ученика, а не только текущую', async () => {
    const student = await createStudent(payload)
    const [current, other] = [await login(payload, student), await login(payload, student)]
    expect((await rest('GET', '/users/me', { token: other })).json.user).toMatchObject({ id: student.id })
    const response = await rest('POST', '/users/logout?allSessions=true', { token: current })
    expect(response.status).toBe(200)
    expect(await count('auth-session-revocations', { user: { equals: student.id } })).toBe(2)
    expect((await rest('GET', '/users/me', { token: other })).json.user).toBeNull()
    expect((await rest('GET', '/users/me', { token: current })).json.user).toBeNull()
  })

  it('обычный выход отзывает только текущую сессию', async () => {
    const student = await createStudent(payload)
    const [current, other] = [await login(payload, student), await login(payload, student)]
    expect((await rest('POST', '/users/logout', { token: current })).status).toBe(200)
    expect(await count('auth-session-revocations', { user: { equals: student.id } })).toBe(1)
    expect((await rest('GET', '/users/me', { token: other })).json.user).toMatchObject({ id: student.id })
    expect((await rest('GET', '/users/me', { token: current })).json.user).toBeNull()
  })
})

describe('достижения: роадмап, сумма баллов и откат бонуса', () => {
  const finish = (user: TestUser, lesson: number) => payload.create({ collection: 'user-progress', data: { user: user.id, lesson, isCompleted: true } as never, user, overrideAccess: false })

  async function activate(definitions: Record<string, unknown>[]) {
    const ids: number[] = []
    for (const definition of definitions) {
      ids.push((await payload.create({ collection: 'achievements', data: { title: uid('edge-achievement'), description: 'Проверка', isActive: true, ...definition } as never })).id)
    }
    // Чужим файлам активные достижения не оставляем: они бы начисляли лишние баллы.
    return { ids, release: async () => { for (const id of ids) await payload.update({ collection: 'achievements', id, data: { isActive: false } }) } }
  }

  it('за конкретный роадмап и за сумму баллов выдаются в том же прохождении; чужой роадмап и недостижимая сумма — нет', async () => {
    const mail = captureEmails(payload)
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 1 })
    const other = await createCourseTree(payload, { lessons: 1 })
    const { ids: [roadmap, otherRoadmap, anyRoadmap, points, unreachable], release } = await activate([
      { criteriaType: 'roadmap_completion', criteriaValue: 1, criteriaEntityId: String(tree.roadmap.id), pointsReward: 4 },
      { criteriaType: 'roadmap_completion', criteriaValue: 1, criteriaEntityId: String(other.roadmap.id), pointsReward: 4 },
      { criteriaType: 'roadmap_completion', criteriaValue: 2, pointsReward: 0 },
      { criteriaType: 'total_points', criteriaValue: 1, pointsReward: 0 },
      { criteriaType: 'total_points', criteriaValue: 1_000_000_000, pointsReward: 0 },
    ])
    try {
      await finish(student, tree.lessons[0].id)
      const unlocked = (await payload.find({ collection: 'user-achievements', where: { user: { equals: student.id } }, depth: 0, overrideAccess: true })).docs.map((row) => row.achievement)
      expect(unlocked).toEqual(expect.arrayContaining([roadmap, points]))
      expect(unlocked).not.toContain(otherRoadmap)
      expect(unlocked).not.toContain(anyRoadmap)
      expect(unlocked).not.toContain(unreachable)
      const bonus = await payload.find({ collection: 'points-transactions', where: { and: [{ user: { equals: student.id } }, { reason: { equals: 'achievement_unlocked' } }] }, depth: 0, overrideAccess: true })
      expect(bonus.docs.map((row) => row.relatedEntity)).toEqual([String(roadmap)])
      const ledger = await payload.find({ collection: 'points-transactions', where: { user: { equals: student.id } }, depth: 0, overrideAccess: true, limit: 100 })
      expect((await payload.findByID({ collection: 'users', id: student.id, depth: 0 })).totalPoints).toBe(ledger.docs.reduce((sum, row) => sum + row.amount, 0))
    } finally {
      await release()
      mail.restore()
    }
  })

  /** Прохождение единственного урока курса, в котором падает запись бонуса за достижение. */
  async function failedCompletion() {
    const mail = captureEmails(payload)
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 1 })
    const { release } = await activate([{ criteriaType: 'course_completion', criteriaValue: 1, criteriaEntityId: String(tree.course.id), pointsReward: 25 }])
    const restore = failWrites('points-transactions', (data) => data.user === student.id && data.reason === 'achievement_unlocked', 'achievement-bonus-failure')
    try {
      await expect(finish(student, tree.lessons[0].id)).rejects.toThrow('achievement-bonus-failure')
    } finally {
      restore()
      await release()
      mail.restore()
    }
    return { student, sent: mail.sent.filter((message) => message.to === student.email) }
  }

  it('сбой записи бонуса за достижение откатывает прохождение урока, баллы, достижение, сертификаты и уведомления', async () => {
    const { student } = await failedCompletion()
    for (const collection of ['user-progress', 'user-achievements', 'points-transactions', 'certificates', 'notifications'] as const) {
      expect(await count(collection, { user: { equals: student.id } })).toBe(0)
    }
    expect((await payload.findByID({ collection: 'users', id: student.id, depth: 0 })).totalPoints).toBe(0)
  })

  // БАГ: sendCompletionEmail и sendAchievementEmail (src/payload/hooks/sendNotification.ts:98, :113, :154)
  // отправляют письмо внутри транзакции начисления, до её фиксации. Если транзакция потом
  // откатывается, ученик получает письма «Курс завершён», «Роадмап завершён» и «Новое достижение: +25 баллов»,
  // хотя ни прохождения, ни достижения, ни баллов в базе нет.
  it.fails('БАГ: откатившееся прохождение не рассылает письма о завершении и достижении — дефект: письма уходят до фиксации транзакции', async () => {
    const { sent } = await failedCompletion()
    expect(sent.map((message) => message.subject)).toEqual([])
  })
})

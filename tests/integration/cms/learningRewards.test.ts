import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CollectionBeforeChangeHook, Payload } from 'payload'
import { bootstrapDefaultAchievements, DEFAULT_ACHIEVEMENTS } from '@/lib/default-achievements'
import { saveTrainerProgress } from '@/lib/trainer/save-progress'
import { utcDay } from '@/lib/streak'
import { captureEmails, createAdmin, createCourseTree, createStudent, createSumTask, getTestPayload, uid } from '../helpers/payload'

let payload: Payload
let mail: ReturnType<typeof captureEmails>
const definitions: number[] = []

beforeAll(async () => {
  payload = await getTestPayload()
  mail = captureEmails(payload)
  for (const definition of [
    { criteriaType: 'trainer_task_count' as const, criteriaValue: 1, pointsReward: 7 },
    { criteriaType: 'streak_days' as const, criteriaValue: 3, pointsReward: 9 },
    { criteriaType: 'lesson_count' as const, criteriaValue: 5, pointsReward: 11 },
  ]) {
    const achievement = await payload.create({ collection: 'achievements', data: {
      ...definition, title: uid('rewards'), description: 'Проверка автоматической награды', isActive: true,
    } })
    definitions.push(achievement.id)
  }
})
afterAll(async () => {
  for (const id of definitions) await payload.update({ collection: 'achievements', id, data: { isActive: false } })
  mail.restore()
})

const count = async (collection: 'certificates' | 'user-achievements' | 'user-progress' | 'points-transactions', user: number) =>
  (await payload.count({ collection, where: { user: { equals: user } } })).totalDocs

const finish = (user: Awaited<ReturnType<typeof createStudent>>, lesson: number) => payload.create({
  collection: 'user-progress', data: { user: user.id, lesson, isCompleted: true }, user, overrideAccess: false,
})

describe('реальные автоматические награды и сертификаты', () => {
  it('серверное решение сразу даёт достижение и серию; старый client результат — нет', async () => {
    const user = await createStudent(payload)
    const task = await createSumTask(payload)
    const progress = await payload.create({ collection: 'user-trainer-progress', data: {
      user: user.id, task: task.id, isCompleted: true, verifiedBy: 'server',
    } })
    expect(await count('user-achievements', user.id)).toBe(1)
    expect((await payload.find({ collection: 'streaks', where: { user: { equals: user.id } } })).docs[0].currentStreak).toBe(1)
    await payload.update({ collection: 'user-trainer-progress', id: progress.id, data: { isCompleted: false } })
    await payload.update({ collection: 'user-trainer-progress', id: progress.id, data: { isCompleted: true } })
    expect(await count('user-achievements', user.id)).toBe(1)
    expect(await count('points-transactions', user.id)).toBe(2)
    const legacy = await createStudent(payload)
    const legacyProgress = await payload.create({ collection: 'user-trainer-progress', data: { user: legacy.id, task: task.id, isCompleted: true, verifiedBy: 'client' } })
    expect(await count('points-transactions', legacy.id)).toBe(0)
    expect(await count('user-achievements', legacy.id)).toBe(0)
    const verified = await saveTrainerProgress({
      payload, user: legacy, task, language: 'js', code: 'function sum(a,b){ return a+b }',
      result: { status: 'passed', tests: [], passedCount: 1, totalCount: 1, consoleOutput: [], totalMs: 1 },
    })
    expect(verified).toMatchObject({ completed: true, awardedPoints: 15, attempts: 1 })
    expect((await payload.findByID({ collection: 'user-trainer-progress', id: legacyProgress.id })).verifiedBy).toBe('server')
    expect(await count('user-achievements', legacy.id)).toBe(1)
    expect(await count('points-transactions', legacy.id)).toBe(2)
  })

  it('достижение за третий день приходит при том же прохождении урока', async () => {
    const user = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 2 })
    await payload.create({ collection: 'streaks', data: {
      user: user.id, currentStreak: 2, longestStreak: 2, totalActiveDays: 2,
      lastActivityDate: utcDay(new Date(Date.now() - 86400000)),
    } })
    await finish(user, tree.lessons[0].id)
    expect(await count('user-achievements', user.id)).toBe(1)
    expect((await payload.find({ collection: 'streaks', where: { user: { equals: user.id } } })).docs[0].currentStreak).toBe(3)
    await finish(user, tree.lessons[1].id)
    expect(await count('user-achievements', user.id)).toBe(1)
  })

  it('частичное назначение не даёт сертификат; после полного прохождения ровно один', async () => {
    const admin = await createAdmin(payload)
    const user = await createStudent(payload, { learningAccessMode: 'assigned' })
    const tree = await createCourseTree(payload, { lessons: 2 })
    await payload.create({ collection: 'learning-access-grants', user: admin, overrideAccess: false, data: {
      ruleKey: uid('grant'), user: user.id, target: { relationTo: 'lessons', value: tree.lessons[0].id }, effect: 'allow',
    } })
    await finish(user, tree.lessons[0].id)
    expect(await count('certificates', user.id)).toBe(0)
    await expect(finish(user, tree.lessons[1].id)).rejects.toThrow()
    // A manually added bonus cannot bypass the actual programme either.
    await payload.create({ collection: 'points-transactions', data: { user: user.id, amount: 0, reason: 'course_completed', relatedEntity: String(tree.course.id) } })
    expect(await count('certificates', user.id)).toBe(0)
    await payload.create({ collection: 'learning-access-grants', user: admin, overrideAccess: false, data: {
      ruleKey: uid('grant'), user: user.id, target: { relationTo: 'courses', value: tree.course.id }, effect: 'allow',
    } })
    await finish(user, tree.lessons[1].id)
    const certs = await payload.find({ collection: 'certificates', where: { user: { equals: user.id }, type: { equals: 'course' } } })
    expect(certs.totalDocs).toBe(1)
  })

  it('неопубликованная секция не блокирует награды, а опубликованный урок без секции входит в программу', async () => {
    const user = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 1 })
    const hiddenSection = await payload.create({ collection: 'sections', data: {
      title: 'Черновая секция', slug: uid('hidden-section'), course: tree.course.id, isPublished: false,
    } })
    const hiddenLesson = await payload.create({ collection: 'lessons', data: {
      title: 'Урок черновой секции', slug: uid('hidden-lesson'), course: tree.course.id, section: hiddenSection.id, isPublished: true,
    } })
    const unsectioned = await payload.create({ collection: 'lessons', data: {
      title: 'Урок без секции', slug: uid('unsectioned'), course: tree.course.id, isPublished: true,
    } })
    await expect(finish(user, hiddenLesson.id)).rejects.toThrow()

    await finish(user, tree.lessons[0].id)
    expect(await count('certificates', user.id)).toBe(0)
    await finish(user, unsectioned.id)

    const certs = await payload.find({ collection: 'certificates', where: { user: { equals: user.id } }, sort: 'type' })
    expect(certs.docs.map(certificate => [certificate.type, certificate.relatedEntity])).toEqual([
      ['course', String(tree.course.id)], ['roadmap', String(tree.roadmap.id)],
    ])
    const bonuses = await payload.find({ collection: 'points-transactions', where: {
      user: { equals: user.id }, reason: { in: ['course_completed', 'roadmap_completed'] },
    } })
    expect(bonuses.totalDocs).toBe(2)
  })

  it('курс только с черновыми секциями остаётся пустым и не завершает роадмап', async () => {
    const user = await createStudent(payload)
    const empty = await createCourseTree(payload, { lessons: 1 })
    await payload.update({ collection: 'sections', id: empty.section.id, data: { isPublished: false } })
    const visible = await createCourseTree(payload, { lessons: 1 })
    await payload.update({ collection: 'courses', id: visible.course.id, data: { roadmap: empty.roadmap.id } })

    await finish(user, visible.lessons[0].id)
    const certs = await payload.find({ collection: 'certificates', where: { user: { equals: user.id } } })
    expect(certs.docs.map(certificate => [certificate.type, certificate.relatedEntity])).toEqual([
      ['course', String(visible.course.id)],
    ])
    expect((await payload.count({ collection: 'points-transactions', where: {
      user: { equals: user.id }, reason: { equals: 'roadmap_completed' },
    } })).totalDocs).toBe(0)
  })

  it('параллельные разные уроки сериализуют награды и завершают курс один раз', async () => {
    const user = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 2 })
    await Promise.all(tree.lessons.map(lesson => finish(user, lesson.id)))
    const certs = await payload.find({ collection: 'certificates', where: { user: { equals: user.id }, type: { equals: 'course' } } })
    expect(certs.totalDocs).toBe(1)
    expect(await count('user-progress', user.id)).toBe(2)
    const transactions = await payload.find({ collection: 'points-transactions', where: { user: { equals: user.id }, reason: { equals: 'course_completed' } } })
    expect(transactions.totalDocs).toBe(1)
  })

  it('повторные конкурентные отметки одного урока не становятся пятью уроками', async () => {
    const user = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 2 })
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => finish(user, tree.lessons[0].id)))
    expect(results.some(result => result.status === 'fulfilled')).toBe(true)
    expect(await count('user-achievements', user.id)).toBe(0)
    const transactions = await payload.find({ collection: 'points-transactions', where: { user: { equals: user.id }, reason: { equals: 'lesson_completed' } } })
    expect(transactions.totalDocs).toBe(1)
  })

  it('ошибка сертификата откатывает прогресс и XP; повторный запрос выдаёт награду', async () => {
    const user = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 1 })
    const hooks = payload.collections.certificates.config.hooks.beforeChange ??= []
    const fail: CollectionBeforeChangeHook = ({ data }) => {
      if (data.user === user.id) throw new Error('certificate-write-failure')
      return data
    }
    hooks.push(fail)
    try {
      await expect(finish(user, tree.lessons[0].id)).rejects.toThrow('certificate-write-failure')
      expect(await count('user-progress', user.id)).toBe(0)
      expect(await count('points-transactions', user.id)).toBe(0)
      expect(await count('certificates', user.id)).toBe(0)
      expect((await payload.findByID({ collection: 'users', id: user.id })).totalPoints).toBe(0)
    } finally {
      hooks.splice(hooks.indexOf(fail), 1)
    }
    await finish(user, tree.lessons[0].id)
    const certs = await payload.find({ collection: 'certificates', where: { user: { equals: user.id }, type: { equals: 'course' } } })
    expect(certs.totalDocs).toBe(1)
  })

  it('bootstrap повторяется, сохраняет ручные изменения и ничего не выдаёт ученикам', async () => {
    const user = await createStudent(payload)
    await bootstrapDefaultAchievements(payload)
    const first = (await payload.find({ collection: 'achievements', where: { slug: { equals: 'first-lesson' } }, limit: 1 })).docs[0]
    await payload.update({ collection: 'achievements', id: first.id, data: { title: 'Название учителя', pointsReward: 19, isActive: false } })
    await Promise.all([bootstrapDefaultAchievements(payload), bootstrapDefaultAchievements(payload)])
    const after = await payload.findByID({ collection: 'achievements', id: first.id })
    expect(after).toMatchObject({ title: 'Название учителя', pointsReward: 19, isActive: false })
    expect((await payload.count({ collection: 'achievements', where: { slug: { in: DEFAULT_ACHIEVEMENTS.map(item => item.slug) } } })).totalDocs).toBe(DEFAULT_ACHIEVEMENTS.length)
    expect(await count('user-achievements', user.id)).toBe(0)
    // Restore test isolation; production bootstrap leaves administrator settings alone.
    await payload.update({ collection: 'achievements', id: first.id, data: { title: DEFAULT_ACHIEVEMENTS[0].title, pointsReward: 5 } })
    await payload.update({ collection: 'achievements', where: { slug: { exists: true } }, data: { isActive: false } })
  })
})

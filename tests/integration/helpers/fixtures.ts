import type { Payload } from 'payload'
import { createHash } from 'node:crypto'

import { createAdmin, createCourseTree, createStudent, createSumTask, createTopic, uid } from './payload'

/**
 * Минимально валидные документы для каждой коллекции и общий контекст связей.
 * Используются тестами схемы и контроля доступа.
 */
export type FixtureContext = {
  userId: number
  studentId: number
  lessonId: number
  courseId: number
  roadmapId: number
  nodeId: number
  topicId: number
  taskId: number
  achievementId: number
}

export const lexical = (text: string) => ({
  root: {
    type: 'root', direction: 'ltr' as const, format: '' as const, indent: 0, version: 1,
    children: [{ type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text }] }],
  },
})

export type Data = Record<string, unknown>

export const INTERNAL_COLLECTIONS = new Set(['payload-preferences', 'payload-migrations', 'payload-locked-documents', 'payload-kv'])

export const VALID: Record<string, (ctx: FixtureContext) => Data> = {
  users: () => ({ email: `${uid('fx')}@lms.test`, password: 'Fixture-Pass-1', firstName: 'Имя', lastName: 'Фамилия', learningAccessMode: 'all' }),
  roadmaps: () => ({ title: `Роадмап ${uid()}` }),
  'roadmap-nodes': (ctx) => ({ nodeId: uid('node'), label: 'Узел', roadmap: ctx.roadmapId }),
  'roadmap-edges': (ctx) => ({ edgeId: uid('edge'), roadmap: ctx.roadmapId, source: ctx.nodeId, target: ctx.nodeId }),
  courses: (ctx) => ({ title: `Курс ${uid()}`, roadmap: ctx.roadmapId }),
  sections: (ctx) => ({ title: `Секция ${uid()}`, course: ctx.courseId }),
  lessons: (ctx) => ({ title: `Урок ${uid()}`, course: ctx.courseId }),
  'learning-access-grants': (ctx) => ({ user: ctx.studentId, target: { relationTo: 'lessons', value: ctx.lessonId }, effect: 'allow', ruleKey: 'server-generated' }),
  'learning-access-audit': (ctx) => ({ actorId: ctx.userId, userId: ctx.studentId, targetType: 'lessons', targetId: ctx.lessonId, effect: 'allow', operation: 'create' }),
  'learning-access-policies': (ctx) => ({ user: ctx.studentId, mode: 'assigned', role: 'student' }),
  'auth-session-revocations': (ctx) => ({ user: ctx.studentId, sessionHash: createHash('sha256').update(uid('session-fixture')).digest('hex'), expiresAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString() }),
  'lesson-learning-states': (ctx) => ({ user: ctx.studentId, lesson: ctx.lessonId, lastViewedAt: new Date().toISOString() }),
  'user-progress': (ctx) => ({ user: ctx.studentId, lesson: ctx.lessonId }),
  achievements: () => ({ title: 'Ачивка', description: 'Описание', criteriaType: 'lesson_count', criteriaValue: 1000000, isActive: false }),
  'user-achievements': (ctx) => ({ user: ctx.studentId, achievement: ctx.achievementId, unlockedAt: new Date().toISOString() }),
  'points-transactions': (ctx) => ({ user: ctx.studentId, amount: 1, reason: 'admin_adjustment' }),
  notes: (ctx) => ({ user: ctx.studentId, lesson: ctx.lessonId, content: 'Заметка' }),
  bookmarks: (ctx) => ({ user: ctx.studentId, lesson: ctx.lessonId }),
  comments: (ctx) => ({ user: ctx.studentId, lesson: ctx.lessonId, content: 'Комментарий' }),
  notifications: (ctx) => ({ user: ctx.studentId, title: 'Заголовок', message: 'Текст' }),
  certificates: (ctx) => ({
    user: ctx.studentId, type: 'course', title: 'Курс', relatedEntity: String(ctx.courseId),
    issuedAt: new Date().toISOString(), certificateNumber: uid('MC'),
  }),
  streaks: (ctx) => ({ user: ctx.studentId }),
  'interview-rooms': (ctx) => ({ token: uid('room'), owner: ctx.studentId, members: [ctx.studentId], title: 'Собеседование фикстуры' }),
  'trainer-topics': () => ({ title: `Тема ${uid()}` }),
  'trainer-tasks': (ctx) => ({ title: `Задача ${uid()}`, topic: ctx.topicId, starterCode: '// код' }),
  'user-trainer-progress': (ctx) => ({ user: ctx.studentId, task: ctx.taskId }),
  'faq-items': () => ({ question: 'Вопрос?', answer: lexical('Ответ') }),
  'yandex-disk-imports': (ctx) => ({ publicUrl: 'https://disk.yandex.ru/d/test', course: ctx.courseId, importedBy: ctx.userId }),
}

/** Коллекции, где пользователь может владеть документом (поле user). */
export const UNIQUE_PER_USER = new Set(['streaks', 'user-trainer-progress', 'learning-access-policies'])

export async function buildFixtureContext(payload: Payload): Promise<FixtureContext> {
  const admin = await createAdmin(payload)
  const student = await createStudent(payload)
  const tree = await createCourseTree(payload, { lessons: 1 })
  const node = await payload.create({
    collection: 'roadmap-nodes',
    data: { nodeId: uid('ctx-node'), label: 'Узел', nodeType: 'topic', roadmap: tree.roadmap.id, positionX: 0, positionY: 0 },
  })
  const topic = await createTopic(payload)
  const task = await createSumTask(payload, { topic: topic.id })
  const achievement = await payload.create({
    collection: 'achievements',
    data: { title: 'Ачивка фикстур', description: 'Не выдаётся', criteriaType: 'lesson_count', criteriaValue: 100000, isActive: false },
  })
  return {
    userId: admin.id, studentId: student.id, lessonId: tree.lessons[0].id, courseId: tree.course.id,
    roadmapId: tree.roadmap.id, nodeId: node.id, topicId: topic.id, taskId: task.id, achievementId: achievement.id,
  }
}

/**
 * Валидные данные; для коллекций с уникальным user (серия, прогресс задачи)
 * владелец — переданный или свежий студент, чтобы копии не конфликтовали.
 */
export async function makeValid(payload: Payload, slug: string, ctx: FixtureContext, owner?: number): Promise<Data> {
  const data = VALID[slug](ctx)
  // Закладка уникальна по паре «пользователь + урок» — каждой копии свой урок.
  if (slug === 'bookmarks' || slug === 'lesson-learning-states') {
    data.lesson = (await payload.create({ collection: 'lessons', data: { title: `Урок ${uid()}`, course: ctx.courseId, isPublished: true } as never })).id
  }
  if (slug === 'learning-access-grants') {
    const key = uid('grant-fixture-lesson')
    const lesson = await payload.create({ collection: 'lessons', data: { title: `Урок ${key}`, slug: key, course: ctx.courseId, isPublished: true } })
    data.target = { relationTo: 'lessons', value: lesson.id }
  }
  if (slug === 'interview-rooms' && owner !== undefined) { data.owner = owner; data.members = [owner] }
  if ('user' in data) {
    if (owner !== undefined) data.user = owner
    else if (UNIQUE_PER_USER.has(slug)) data.user = (await createStudent(payload)).id
  }
  if (slug === 'learning-access-policies' && owner === undefined) {
    // Users create their policy automatically; isolate raw schema checks on a fresh fixture owner.
    await payload.delete({ collection: 'learning-access-policies', where: { user: { equals: data.user } }, context: { syncLearningAccessPolicy: true } })
  }
  return data
}

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
  interviewDirectionId: number
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
  users: () => ({ email: `${uid('fx')}@lms.test`, password: 'Fixture-Pass-1', firstName: 'Имя', lastName: 'Фамилия', telegram: '@fixture_account', learningCatalogVisibility: 'catalog', trainerAccessMode: 'all', learningAccessMode: 'all' }),
  roadmaps: () => ({ title: `Роадмап ${uid()}` }),
  'roadmap-nodes': (ctx) => ({ nodeId: uid('node'), label: 'Узел', roadmap: ctx.roadmapId }),
  'roadmap-edges': (ctx) => ({ edgeId: uid('edge'), roadmap: ctx.roadmapId, source: ctx.nodeId, target: ctx.nodeId }),
  courses: (ctx) => ({ title: `Курс ${uid()}`, roadmap: ctx.roadmapId }),
  sections: (ctx) => ({ title: `Секция ${uid()}`, course: ctx.courseId }),
  lessons: (ctx) => ({ title: `Урок ${uid()}`, course: ctx.courseId }),
  guides: () => ({ title: `Гайд ${uid()}`, summary: 'Кратко о гайде', markdown: 'Текст гайда' }),
  'guide-categories': () => ({ title: `Категория ${uid()}` }),
  'learning-access-grants': (ctx) => ({ user: ctx.studentId, target: { relationTo: 'lessons', value: ctx.lessonId }, effect: 'allow', ruleKey: 'server-generated' }),
  'learning-access-audit': (ctx) => ({ actorId: ctx.userId, userId: ctx.studentId, targetType: 'lessons', targetId: ctx.lessonId, effect: 'allow', operation: 'create' }),
  'learning-access-policies': (ctx) => ({ user: ctx.studentId, mode: 'assigned', role: 'student' }),
  'auth-session-revocations': (ctx) => ({ user: ctx.studentId, sessionHash: createHash('sha256').update(uid('session-fixture')).digest('hex'), expiresAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString() }),
  'student-session-telemetry': (ctx) => ({ user: ctx.studentId, sessionHash: createHash('sha256').update(uid('telemetry')).digest('hex'), firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), device: 'desktop', browser: 'Chromium', os: 'Linux' }),
  'student-learning-events': (ctx) => ({ user: ctx.studentId, eventKey: uid('learning-event'), type: 'lesson_completed', source: 'server', at: new Date().toISOString() }),
  'web-vitals-reports': (ctx) => ({ user: ctx.studentId, sessionHash: createHash('sha256').update(uid('vitals-session')).digest('hex'), reportKey: createHash('sha256').update(uid('vitals-report')).digest('hex'), name: 'LCP', value: 1000, routeTemplate: '/courses', reportedAt: new Date().toISOString() }),
  'lesson-learning-states': (ctx) => ({ user: ctx.studentId, lesson: ctx.lessonId, lastViewedAt: new Date().toISOString() }),
  'user-progress': (ctx) => ({ user: ctx.studentId, lesson: ctx.lessonId }),
  achievements: () => ({ slug: uid('achievement-definition'), title: 'Ачивка', description: 'Описание', criteriaType: 'lesson_count', criteriaValue: 1000000, isActive: false }),
  'user-achievements': (ctx) => ({ user: ctx.studentId, achievement: ctx.achievementId, unlockedAt: new Date().toISOString() }),
  'points-transactions': (ctx) => ({ user: ctx.studentId, amount: 1, reason: 'admin_adjustment' }),
  notes: (ctx) => ({ user: ctx.studentId, lesson: ctx.lessonId, content: 'Заметка' }),
  bookmarks: (ctx) => ({ user: ctx.studentId, lesson: ctx.lessonId }),
  // Гайд у каждой копии свой — его создаёт makeValid вместе с назначением владельцу.
  'guide-reads': (ctx) => ({ user: ctx.studentId }),
  comments: (ctx) => ({ user: ctx.studentId, lesson: ctx.lessonId, content: 'Комментарий' }),
  notifications: (ctx) => ({ user: ctx.studentId, title: 'Заголовок', message: 'Текст' }),
  'notification-preferences': (ctx) => ({ user: ctx.studentId, timezone: 'Europe/Moscow', reminderHour: 18 }),
  'push-subscriptions': (ctx) => ({ user: ctx.studentId, endpointHash: createHash('sha256').update(uid('push')).digest('hex'), endpoint: 'https://fcm.googleapis.com/fcm/send/fixture', p256dh: 'fixture-public-key', auth: 'fixture-auth-key', sessionHash: createHash('sha256').update(uid('sid')).digest('hex') }),
  'notification-deliveries': (ctx) => ({ user: ctx.studentId, notification: 0, subscription: 0, status: 'pending', attempts: 0, nextAttemptAt: new Date().toISOString() }),
  'notification-job-state': () => ({ key: uid('job'), leaseUntil: new Date().toISOString(), claimToken: uid('claim') }),
  'email-broadcasts': (ctx) => ({ subject: `Рассылка ${uid()}`, body: 'Текст фикстуры', audience: 'all', status: 'draft', createdBy: ctx.userId }),
  // Отменённая доставка: фоновая задача рассылок в других тестах её не возьмёт.
  'email-broadcast-deliveries': (ctx) => ({ broadcast: 0, user: ctx.studentId, status: 'cancelled', attempts: 0, nextAttemptAt: new Date().toISOString() }),
  certificates: (ctx) => ({
    user: ctx.studentId, type: 'course', title: 'Курс', relatedEntity: String(ctx.courseId),
    issuedAt: new Date().toISOString(), certificateNumber: uid('MC'),
  }),
  streaks: (ctx) => ({ user: ctx.studentId }),
  'interview-rooms': (ctx) => ({ token: uid('room'), sourceTaskKnown: true, owner: ctx.studentId, members: [ctx.studentId], title: 'Собеседование фикстуры' }),
  'interview-directions': () => ({ title: `Направление ${uid()}`, slug: uid('direction') }),
  'interview-recordings': (ctx) => ({ title: 'Запись фикстуры', direction: ctx.interviewDirectionId, category: 'mentor', status: 'ready', size: 100, sourceKey: uid('recording-source') }),
  'interview-analysis-usage': (ctx) => ({ owner: ctx.studentId, day: '2026-10-11', requests: 0 }),
  'trainer-topics': () => ({ title: `Тема ${uid()}` }),
  'trainer-tasks': (ctx) => ({ title: `Задача ${uid()}`, topic: ctx.topicId, starterCode: '// код' }),
  'user-trainer-progress': (ctx) => ({ user: ctx.studentId, task: ctx.taskId }),
  'faq-items': () => ({ question: 'Вопрос?', answer: lexical('Ответ') }),
  'yandex-disk-imports': (ctx) => ({ publicUrl: 'https://disk.yandex.ru/d/test', course: ctx.courseId, importedBy: ctx.userId }),
  // Адрес уникален в программе: фабрика каждый раз даёт новый.
  'bootcamp-leads': () => ({ email: `${uid('lead')}@mail.test`.toLowerCase(), program: 'nodejs', consentVersion: '2026-10-26', consentAt: new Date().toISOString(), entryTaskToken: uid('entry-token') }),
  // Заявку (уникальная связь) создаёт makeValid.
  'bootcamp-enrollments': () => ({ lead: 0, email: `${uid('enr')}@mail.test`.toLowerCase(), firstName: 'Имя', lastName: 'Фамилия', gitlabUsername: uid('enr').toLowerCase().replace(/[^a-z0-9-]/g, '-'), streamGroup: 'nodejs-test', status: 'queued' }),
}

/** Коллекции, где пользователь может владеть документом (поле user). */
export const UNIQUE_PER_USER = new Set(['streaks', 'user-trainer-progress', 'learning-access-policies', 'notification-preferences'])

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
  const direction = await payload.create({ collection: 'interview-directions', data: { title: 'Направление фикстур', slug: uid('direction') } })
  return {
    userId: admin.id, studentId: student.id, lessonId: tree.lessons[0].id, courseId: tree.course.id,
    roadmapId: tree.roadmap.id, nodeId: node.id, topicId: topic.id, taskId: task.id, achievementId: achievement.id, interviewDirectionId: direction.id,
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
  if (slug === 'guide-reads') {
    // Пара (ученик, гайд) уникальна, а прочтение видно владельцу, только пока гайд ему открыт.
    const guide = await payload.create({ collection: 'guides', context: { skipHooks: true }, data: { title: `Гайд ${uid()}`, slug: uid('read-guide'), summary: 'Кратко', markdown: 'Текст', isPublished: true } })
    data.guide = guide.id
    const reader = await payload.findByID({ collection: 'users', id: Number(owner ?? data.user), depth: 0 })
    if (reader.role !== 'admin') {
      const admin = await payload.findByID({ collection: 'users', id: ctx.userId, depth: 0 })
      await payload.create({ collection: 'learning-access-grants', user: admin, context: { skipHooks: true }, data: { user: reader.id, target: { relationTo: 'guides', value: guide.id }, effect: 'allow', ruleKey: 'server-generated' } })
    }
  }
  if (slug === 'learning-access-grants') {
    const key = uid('grant-fixture-lesson')
    const lesson = await payload.create({ collection: 'lessons', data: { title: `Урок ${key}`, slug: key, course: ctx.courseId, isPublished: true } })
    data.target = { relationTo: 'lessons', value: lesson.id }
  }
  if (slug === 'interview-rooms' && owner !== undefined) { data.owner = owner; data.members = [owner] }
  if (slug === 'interview-analysis-usage') data.owner = owner ?? (await createStudent(payload)).id
  if ('user' in data) {
    if (owner !== undefined) data.user = owner
    else if (UNIQUE_PER_USER.has(slug)) data.user = (await createStudent(payload)).id
  }
  if (slug === 'learning-access-policies' && owner === undefined) {
    // Users create their policy automatically; isolate raw schema checks on a fresh fixture owner.
    await payload.delete({ collection: 'learning-access-policies', where: { user: { equals: data.user } }, context: { syncLearningAccessPolicy: true } })
  }
  if (slug === 'user-achievements') {
    data.achievement = (await payload.create({ collection: 'achievements', data: { title: uid('achievement'), description: 'Тестовое достижение', criteriaType: 'lesson_count', criteriaValue: 1000000, isActive: false } })).id
  }
  if (slug === 'certificates') data.relatedEntity = uid('certificate-entity')
  if (slug === 'bootcamp-enrollments') {
    data.lead = (await payload.create({ collection: 'bootcamp-leads', data: VALID['bootcamp-leads'](ctx) as never, overrideAccess: true })).id
  }
  if (slug === 'email-broadcast-deliveries') {
    data.broadcast = (await payload.create({ collection: 'email-broadcasts', data: VALID['email-broadcasts'](ctx) as never })).id
  }
  if (slug === 'notification-deliveries') {
    data.notification = (await payload.create({ collection: 'notifications', data: { user: Number(data.user), title: 'Фикстура', message: 'Не отправлять', type: 'info' }, context: { skipHooks: true } })).id
    const subscription = VALID['push-subscriptions'](ctx)
    subscription.user = data.user
    data.subscription = (await payload.create({ collection: 'push-subscriptions', data: subscription as never })).id
  }
  return data
}

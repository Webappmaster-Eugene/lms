import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { APIError, createLocalReq, type Payload } from 'payload'

import { learningVideos } from '@/lib/learning-state'
import { loadCourseLessons } from '@/lib/course-lessons'
import { accessibleLearningLesson, LearningStateError, saveLearningState } from '@/server/learning-state'
import { canAccessCourse, canAccessLesson } from '@/server/learning-access'
import { getAuthoritativeLearningMode } from '@/server/learning-access-policy'
import { notificationLinkIsVisible } from '@/server/notification-visibility'
import { getProfileDTO } from '@/server/profile/read'
import { getProfile } from '@/server/profile/account'
import type { Lesson, User } from '@/payload-types'
import { createAdmin, createCourseTree, createStudent, createSumTask, createTopic, getTestPayload, login, uid, type CourseTree, type TestUser } from '../helpers/payload'

/**
 * Серверные модули обучения на настоящем Payload: состояние просмотра,
 * проверка доступа к уроку, видимость ссылок в уведомлениях, профиль и
 * порядок уроков на дашборде.
 */
let payload: Payload
let admin: TestUser
let tree: CourseTree
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

const asUser = async (user: TestUser): Promise<User> => payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true })

function failWhen<K extends 'find' | 'findByID' | 'update'>(method: K, collection: string, error: Error) {
  const original = (payload[method] as (...args: unknown[]) => unknown).bind(payload)
  return vi.spyOn(payload, method).mockImplementation(((args: { collection: string }) => args.collection === collection
    ? Promise.reject(error)
    : original(args)) as never)
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  tree = await createCourseTree(payload, { lessons: 2 })
})
afterEach(() => { vi.restoreAllMocks() })

describe('состояние просмотра урока', () => {
  it('несуществующий урок — 404 «Урок недоступен», а не ошибка сервера', async () => {
    const student = await asUser(await createStudent(payload))
    await expect(accessibleLearningLesson(payload, student, 2_000_000_000)).rejects.toMatchObject({ message: 'Урок недоступен', status: 404 })
  })

  it('урок без назначения закрыт тем же сообщением; открытый урок возвращается', async () => {
    const restricted = await asUser(await createStudent(payload, { learningAccessMode: 'assigned' }))
    const error = await accessibleLearningLesson(payload, restricted, tree.lessons[0].id).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(LearningStateError)
    expect(error).toMatchObject({ message: 'Урок недоступен', status: 403 })
    const open = await asUser(await createStudent(payload))
    expect((await accessibleLearningLesson(payload, open, tree.lessons[0].id)).id).toBe(tree.lessons[0].id)
  })

  it('сбой базы при проверке доступа не маскируется под «урок недоступен»', async () => {
    const student = await asUser(await createStudent(payload))
    failWhen('find', 'courses', new Error('connection reset'))
    await expect(accessibleLearningLesson(payload, student, tree.lessons[0].id)).rejects.toThrow('connection reset')
  })

  it('сбой отметки активности откатывает сохранение позиции видео целиком', async () => {
    const student = await asUser(await createStudent(payload))
    const lesson: Lesson = await payload.update({ collection: 'lessons', id: tree.lessons[1].id, data: { content: [{ blockType: 'video', id: 'rollback-clip', title: 'Ролик', videoUrl: 'https://disk.yandex.ru/d/rollback-fixture/video.mp4' }] } })
    const videoId = learningVideos(lesson)[0].id
    // Настройки уже есть и старше просмотра: отметка активности обязана их обновить.
    await payload.create({ collection: 'notification-preferences', data: { user: student.id, lastLearningAt: new Date(Date.now() - 3_600_000).toISOString(), timezone: 'Europe/Moscow', reminderHour: 18 }, overrideAccess: true })
    failWhen('update', 'notification-preferences', new Error('deadlock detected'))
    await expect(saveLearningState(payload, student, lesson, { at: Date.now(), videoId, seconds: 42, ended: false })).rejects.toThrow('deadlock detected')
    vi.restoreAllMocks()
    const states = await payload.find({ collection: 'lesson-learning-states', where: { user: { equals: student.id } }, depth: 0, overrideAccess: true })
    expect(states.totalDocs).toBe(0)

    const saved = await saveLearningState(payload, student, lesson, { at: Date.now(), videoId, seconds: 42, ended: false })
    expect(saved.positions[videoId]).toMatchObject({ seconds: 42, ended: false })
    const prefs = (await payload.find({ collection: 'notification-preferences', where: { user: { equals: student.id } }, depth: 0, overrideAccess: true })).docs[0]
    expect(Date.parse(prefs?.lastLearningAt ?? '')).toBeGreaterThan(Date.now() - 60_000)
  })
})

describe('проверка доступа к уроку и курсу', () => {
  it('гость не получает доступ к уроку без обращения к базе', async () => {
    const reads = vi.spyOn(payload, 'findByID')
    expect(await canAccessLesson(payload, null, tree.lessons[0].id)).toBe(false)
    expect(reads).not.toHaveBeenCalled()
  })

  it('ошибка чтения урока пробрасывается, а не превращается в тихий отказ', async () => {
    const student = await asUser(await createStudent(payload))
    failWhen('findByID', 'lessons', new Error('statement timeout'))
    await expect(canAccessLesson(payload, student, tree.lessons[0].id)).rejects.toThrow('statement timeout')
  })

  it('пропавшая политика ученика (404) закрывает курс, как для гостя', async () => {
    const student = await asUser(await createStudent(payload))
    const req = await createLocalReq({ user: student }, payload)
    failWhen('find', 'learning-access-policies', new APIError('Not Found', 404))
    expect(await canAccessCourse(payload, student, tree.course.id, req)).toBe(false)
  })

  it('режим доступа читается из политики, а не из подделанного поля профиля', async () => {
    const student = await createStudent(payload, { learningAccessMode: 'assigned' })
    expect(await getAuthoritativeLearningMode(payload, student.id)).toBe('assigned')
    await payload.update({ collection: 'users', id: student.id, data: { learningAccessMode: 'all' }, req: await createLocalReq({ user: await asUser(admin) }, payload) })
    expect(await getAuthoritativeLearningMode(payload, student.id)).toBe('all')
  })
})

describe('видимость ссылок в уведомлениях', () => {
  it('тренажёр: тема и задача видны, пока опубликованы; разделы тренажёра — всегда', async () => {
    const student = await createStudent(payload)
    const topic = await createTopic(payload)
    const task = await createSumTask(payload, { topic: topic.id })
    expect(await notificationLinkIsVisible(payload, student.id, '/trainer')).toBe(true)
    expect(await notificationLinkIsVisible(payload, student.id, '/trainer/tasks')).toBe(true)
    expect(await notificationLinkIsVisible(payload, student.id, `/trainer/${topic.slug}`)).toBe(true)
    expect(await notificationLinkIsVisible(payload, student.id, `/trainer/${topic.slug}/${task.slug}`)).toBe(true)
    expect(await notificationLinkIsVisible(payload, student.id, '/trainer/no-such-topic')).toBe(false)
    expect(await notificationLinkIsVisible(payload, student.id, `/trainer/${topic.slug}/no-such-task`)).toBe(false)
    await payload.update({ collection: 'trainer-tasks', id: task.id, data: { isPublished: false } })
    expect(await notificationLinkIsVisible(payload, student.id, `/trainer/${topic.slug}/${task.slug}`)).toBe(false)
    await payload.update({ collection: 'trainer-topics', id: topic.id, data: { isPublished: false } })
    expect(await notificationLinkIsVisible(payload, student.id, `/trainer/${topic.slug}`)).toBe(false)
  })

  it('выключенный тренажёр скрывает все его ссылки, администратор видит любые', async () => {
    const student = await createStudent(payload, { trainerAccessMode: 'disabled' })
    expect(await notificationLinkIsVisible(payload, student.id, '/trainer')).toBe(false)
    expect(await notificationLinkIsVisible(payload, student.id, '/trainer/interview/new')).toBe(false)
    expect(await notificationLinkIsVisible(payload, admin.id, '/trainer/whatever/secret')).toBe(true)
    expect(await notificationLinkIsVisible(payload, admin.id, '/lessons/%E0%A4%A')).toBe(true)
  })

  it('роадмап виден, пока опубликован; битый адрес скрывает уведомление; пустая ссылка не скрывает', async () => {
    const student = await createStudent(payload)
    const own = await createCourseTree(payload, { lessons: 1 })
    expect(await notificationLinkIsVisible(payload, student.id, `/roadmaps/${own.roadmap.slug}`)).toBe(true)
    expect(await notificationLinkIsVisible(payload, student.id, '/roadmaps')).toBe(true)
    expect(await notificationLinkIsVisible(payload, student.id, '/roadmaps/no-such-roadmap')).toBe(false)
    expect(await notificationLinkIsVisible(payload, student.id, '/lessons/%E0%A4%A')).toBe(false)
    expect(await notificationLinkIsVisible(payload, student.id, null)).toBe(true)
    expect(await notificationLinkIsVisible(payload, student.id, '/achievements')).toBe(true)
    await payload.update({ collection: 'roadmaps', id: own.roadmap.id, data: { isPublished: false } })
    expect(await notificationLinkIsVisible(payload, student.id, `/roadmaps/${own.roadmap.slug}`)).toBe(false)
  })
})

describe('профиль: аватар', () => {
  async function upload(owner: TestUser) {
    return payload.create({ collection: 'media', user: await asUser(owner), overrideAccess: true, data: { alt: 'Аватар' }, file: { data: PNG, mimetype: 'image/png', name: `${uid('avatar')}.png`, size: PNG.length } })
  }

  it('свой аватар возвращается ссылкой; удалённый файл аватара — профиль без аватара, а не ошибка', async () => {
    const student = await createStudent(payload)
    const own = await upload(student)
    await payload.update({ collection: 'users', id: student.id, data: { avatar: own.id }, overrideAccess: true })
    const profile = await getProfileDTO(payload, await asUser(student))
    expect(profile.avatar).toEqual({ id: own.id, url: own.url, alt: 'Аватар' })
    expect(profile).toMatchObject({ id: student.id, email: student.email, firstName: 'Тест', telegram: null, bio: null })

    // Сессия держит старый документ пользователя, а файл уже удалили.
    const stale = await asUser(student)
    await payload.delete({ collection: 'media', id: own.id })
    expect((await getProfileDTO(payload, { ...stale, avatar: own.id })).avatar).toBeNull()
    expect((await getProfileDTO(payload, { ...stale, avatar: null })).avatar).toBeNull()
  })

  it('сбой базы при чтении аватара не скрывается: профиль отвечает ошибкой', async () => {
    const student = await createStudent(payload)
    const own = await upload(student)
    try {
      await payload.update({ collection: 'users', id: student.id, data: { avatar: own.id }, overrideAccess: true })
      failWhen('findByID', 'media', new Error('too many clients'))
      await expect(getProfileDTO(payload, await asUser(student))).rejects.toThrow('too many clients')
      const response = await getProfile(new Request('http://lms.test/api/profile', { headers: { Authorization: `JWT ${await login(payload, student)}` } }))
      expect(response.status).toBe(500)
      expect(JSON.stringify(await response.json())).not.toContain('too many clients')
    } finally {
      vi.restoreAllMocks()
      await payload.delete({ collection: 'media', id: own.id })
    }
  })
})

describe('уроки курсов для дашборда', () => {
  it('пустой список курсов не делает запросов', async () => {
    const reads = vi.spyOn(payload, 'find')
    expect(await loadCourseLessons(payload, [], 'пусто')).toEqual({ allIds: new Map(), ordered: new Map() })
    expect(reads).not.toHaveBeenCalled()
  })

  it('порядок как на странице курса: по разделам, затем по номеру; черновики и уроки скрытых разделов не попадают', async () => {
    const key = uid('order')
    const course = await createCourseTree(payload, { lessons: 0 })
    const late = await payload.create({ collection: 'sections', data: { title: `Поздний ${key}`, slug: `late-${key}`, course: course.course.id, order: 2, isPublished: true } })
    const early = await payload.create({ collection: 'sections', data: { title: `Ранний ${key}`, slug: `early-${key}`, course: course.course.id, order: 1, isPublished: true } })
    const hidden = await payload.create({ collection: 'sections', data: { title: `Скрытый ${key}`, slug: `hidden-${key}`, course: course.course.id, order: 0, isPublished: false } })
    const lesson = (slug: string, section: number | null, order: number, isPublished = true) => payload.create({ collection: 'lessons', data: { title: slug, slug: `${slug}-${key}`, course: course.course.id, ...(section ? { section } : {}), order, isPublished } })
    const b2 = await lesson('b2', late.id, 2)
    const a2 = await lesson('a2', early.id, 2)
    const a1 = await lesson('a1', early.id, 1)
    const b1 = await lesson('b1', late.id, 1)
    const loose = await lesson('loose', null, 1)
    await lesson('draft', early.id, 3, false)
    await lesson('hidden', hidden.id, 1)
    const result = await loadCourseLessons(payload, [course.course.id, tree.course.id], 'проверка')
    expect(result.ordered.get(String(course.course.id))?.map((ref) => ref.id)).toEqual([a1, a2, b1, b2, loose].map((doc) => String(doc.id)))
    expect(result.ordered.get(String(course.course.id))?.[0]).toMatchObject({ slug: `a1-${key}`, title: 'a1', courseId: String(course.course.id), sectionId: String(early.id), order: 1 })
    expect(result.ordered.get(String(tree.course.id))).toHaveLength(2)
    // allIds — программа целиком, включая урок скрытого раздела: от неё считается прогресс.
    expect(result.allIds.get(String(course.course.id))).toHaveLength(6)

    const onlyEarly = await loadCourseLessons(payload, [course.course.id], 'фильтр', (doc) => doc.section === early.id)
    expect(onlyEarly.ordered.get(String(course.course.id))?.map((ref) => ref.id)).toEqual([a1, a2].map((doc) => String(doc.id)))
    expect(onlyEarly.allIds.get(String(course.course.id))).toHaveLength(6)
  })

  it('с запросом ученика применяются его права: без назначения уроков нет', async () => {
    const restricted = await asUser(await createStudent(payload, { learningAccessMode: 'assigned' }))
    const req = await createLocalReq({ user: restricted }, payload)
    const result = await loadCourseLessons(payload, [tree.course.id], 'ученик', undefined, req)
    expect(result.allIds.size).toBe(0)
    const open = await asUser(await createStudent(payload))
    const visible = await loadCourseLessons(payload, [tree.course.id], 'ученик', undefined, await createLocalReq({ user: open }, payload))
    expect(visible.allIds.get(String(tree.course.id))).toHaveLength(2)
  })
})

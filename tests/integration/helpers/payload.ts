import { getPayload, handleEndpoints, type Payload } from 'payload'
import config from '@payload-config'
import { DEFAULT_ACHIEVEMENTS } from '@/lib/default-achievements'
import { vi } from 'vitest'

import type { Course, Lesson, Roadmap, Section, TrainerTask, TrainerTopic, User } from '@/payload-types'

let instance: Promise<Payload> | undefined

/** Настоящий Payload поверх тестовой базы. Один экземпляр на файл тестов. */
export function getTestPayload(): Promise<Payload> {
  instance ??= getPayload({ config }).then(async (payload) => {
    // Most fixtures define their own rewards; the rewards suite explicitly activates the catalogue.
    await payload.update({ collection: 'achievements', where: { slug: { in: DEFAULT_ACHIEVEMENTS.map((definition) => definition.slug) } }, data: { isActive: false } })
    return payload
  })
  return instance
}

let seq = 0
/** Уникальный суффикс: база общая для всех файлов, данные не должны пересекаться. */
export function uid(prefix = 'x'): string {
  seq += 1
  return `${prefix}-${process.pid}-${Date.now().toString(36)}-${seq}`
}

export type TestUser = User & { password: string }

export const DEFAULT_PASSWORD = 'Test-Passw0rd!'

export type UserInput = Partial<Omit<User, 'password'>> & { password?: string }

export async function createUser(
  payload: Payload,
  overrides: UserInput = {},
): Promise<TestUser> {
  const password = overrides.password ?? DEFAULT_PASSWORD
  const role = overrides.role ?? 'student'
  const user = await payload.create({
    collection: 'users',
    data: {
      email: `${uid(role)}@lms.test`.toLowerCase(),
      firstName: 'Тест',
      lastName: 'Пользователь',
      role,
      learningCatalogVisibility: 'catalog', trainerAccessMode: 'all', learningAccessMode: 'all',
      isActive: true,
      ...overrides,
      password,
    },
    // Приглашение проверяется отдельным тестом, в фабрике оно только шумит.
    context: { skipHooks: true },
  })
  return { ...user, password }
}

export const createAdmin = (payload: Payload, overrides: UserInput = {}) =>
  createUser(payload, { ...overrides, role: 'admin' })

export const createStudent = (payload: Payload, overrides: UserInput = {}) =>
  createUser(payload, { ...overrides, role: 'student' })

export async function login(payload: Payload, user: { email: string; password: string }): Promise<string> {
  const result = await payload.login({ collection: 'users', data: { email: user.email, password: user.password } })
  if (!result.token) throw new Error(`Не удалось войти как ${user.email}`)
  return result.token
}

export type CourseTree = {
  roadmap: Roadmap
  course: Course
  section: Section
  lessons: Lesson[]
}

/** Роадмап → курс → секция → N опубликованных уроков. */
export async function createCourseTree(
  payload: Payload,
  { lessons = 2, published = true }: { lessons?: number; published?: boolean } = {},
): Promise<CourseTree> {
  const key = uid('tree')
  const roadmap = await payload.create({
    collection: 'roadmaps',
    data: { title: `Роадмап ${key}`, slug: `roadmap-${key}`, isPublished: published },
  })
  const course = await payload.create({
    collection: 'courses',
    data: { title: `Курс ${key}`, slug: `course-${key}`, roadmap: roadmap.id, isPublished: published },
  })
  const section = await payload.create({
    collection: 'sections',
    data: { title: `Секция ${key}`, slug: `section-${key}`, course: course.id, isPublished: published },
  })
  const created: Lesson[] = []
  for (let i = 0; i < lessons; i += 1) {
    created.push(
      await payload.create({
        collection: 'lessons',
        data: {
          title: `Урок ${i + 1} ${key}`,
          slug: `lesson-${i + 1}-${key}`,
          course: course.id,
          section: section.id,
          order: i + 1,
          isPublished: published,
        },
      }),
    )
  }
  return { roadmap, course, section, lessons: created }
}

export async function createTopic(payload: Payload, overrides: Partial<TrainerTopic> = {}): Promise<TrainerTopic> {
  const key = uid('topic')
  return payload.create({
    collection: 'trainer-topics',
    data: { title: `Тема ${key}`, slug: key, isPublished: true, category: 'javascript', ...overrides },
  })
}

/** Задача в режиме unit: функция sum(a, b) с одним открытым и одним скрытым кейсом. */
export async function createSumTask(
  payload: Payload,
  overrides: Partial<TrainerTask> = {},
): Promise<TrainerTask> {
  const topic = overrides.topic ?? (await createTopic(payload)).id
  const key = uid('task')
  return payload.create({
    collection: 'trainer-tasks',
    data: {
      title: `Сумма ${key}`,
      slug: key,
      topic,
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'sum',
      descriptionMd: 'Верните сумму двух чисел.',
      starterCode: 'function sum(a, b) {\n  // ваш код\n}\n',
      starterCodeTs: 'function sum(a: number, b: number): number {\n  return 0\n}\n',
      solutionCode: 'function sum(a, b) {\n  return a + b\n}\n',
      solutionCodeTs: 'function sum(a: number, b: number): number {\n  return a + b\n}\n',
      solutionNotes: 'Сложение.',
      expectedOutput: 'секрет',
      testCases: [
        { name: 'положительные', argsCode: '1, 2', expectedCode: '3', compare: 'deep', hidden: false },
        { name: 'скрытый', argsCode: '-5, 5', expectedCode: '0', compare: 'deep', hidden: true },
      ],
      timeLimitMs: 2000,
      pointsReward: 15,
      isPublished: true,
      ...overrides,
    },
  })
}

export type CapturedEmail = { to: string; subject: string; html?: string; text?: string }

/**
 * Перехват исходящей почты. Адаптер в тестах выключен (нет SMTP_HOST), но
 * хуки всё равно вызывают `payload.sendEmail` — подменяем именно его, чтобы
 * видеть, что и кому ушло бы. Реальных писем не отправляется.
 */
export function captureEmails(payload: Payload): { sent: CapturedEmail[]; restore: () => void } {
  const sent: CapturedEmail[] = []
  const record = async (message: unknown) => {
    sent.push(message as CapturedEmail)
    return { ok: true }
  }
  // Хуки зовут payload.sendEmail, а forgotPassword — напрямую адаптер payload.email.sendEmail.
  const spies = [
    vi.spyOn(payload, 'sendEmail').mockImplementation(record),
    vi.spyOn(payload.email as { sendEmail: (m: unknown) => Promise<unknown> }, 'sendEmail').mockImplementation(record),
  ]
  return { sent, restore: () => spies.forEach((spy) => spy.mockRestore()) }
}

/** REST API Payload без HTTP-сервера: тот же обработчик, что за /api/[...slug]. */
export async function rest(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  { token, body }: { token?: string; body?: unknown } = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token) headers.set('Authorization', `JWT ${token}`)
  const request = new Request(`http://lms.test/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const response = await handleEndpoints({ config, request })
  const text = await response.text()
  let json: Record<string, unknown> = {}
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    json = { raw: text }
  }
  return { status: response.status, json }
}

/** Ждёт, пока фоновые хуки допишут данные: afterChange в Payload синхронны, но письма и лог — нет. */
export async function eventually<T>(fn: () => Promise<T>, check: (value: T) => boolean, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let value = await fn()
  while (!check(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    value = await fn()
  }
  return value
}

import { beforeAll, describe, expect, it } from 'vitest'
import type { CollectionSlug, Payload } from 'payload'

import type { User } from '@/payload-types'
import { buildFixtureContext, makeValid, VALID, type FixtureContext } from '../helpers/fixtures'
import { createAdmin, createStudent, createSumTask, getTestPayload, login, type TestUser } from '../helpers/payload'

/**
 * Контроль доступа на настоящем Local API с `overrideAccess: false` — так же,
 * как Payload проверяет REST, GraphQL и админку. Матрица ниже — спецификация
 * прав: изменение `access` в коллекции без правки матрицы роняет тест.
 */
type Who = 'anon' | 'owner' | 'other' | 'admin'
type Rule = 'public' | 'auth' | 'own' | 'admin' | 'nobody'

type Matrix = { create: Rule; read: Rule; update: Rule; delete: Rule }

const CONTENT: Matrix = { create: 'admin', read: 'auth', update: 'admin', delete: 'admin' }

const MATRIX: Record<string, Matrix> = {
  users: { create: 'admin', read: 'auth', update: 'own', delete: 'admin' },
  roadmaps: CONTENT,
  'roadmap-nodes': CONTENT,
  'roadmap-edges': CONTENT,
  courses: CONTENT,
  sections: CONTENT,
  lessons: CONTENT,
  achievements: CONTENT,
  'trainer-topics': CONTENT,
  'trainer-tasks': CONTENT,
  'faq-items': { create: 'admin', read: 'public', update: 'admin', delete: 'admin' },
  'user-progress': { create: 'auth', read: 'own', update: 'own', delete: 'admin' },
  'user-achievements': { create: 'admin', read: 'own', update: 'admin', delete: 'admin' },
  'points-transactions': { create: 'admin', read: 'own', update: 'nobody', delete: 'admin' },
  notes: { create: 'auth', read: 'own', update: 'own', delete: 'own' },
  comments: { create: 'auth', read: 'own', update: 'own', delete: 'admin' },
  notifications: { create: 'admin', read: 'own', update: 'own', delete: 'admin' },
  certificates: { create: 'admin', read: 'own', update: 'admin', delete: 'admin' },
  streaks: { create: 'admin', read: 'own', update: 'admin', delete: 'admin' },
  // Пишет только сервер после проверки в песочнице (/api/trainer/submit)
  'user-trainer-progress': { create: 'admin', read: 'own', update: 'admin', delete: 'admin' },
  'yandex-disk-imports': { create: 'admin', read: 'admin', update: 'admin', delete: 'admin' },
}

/** Безобидное поле для проверки update в каждой коллекции. */
const PATCH: Record<string, Record<string, unknown>> = {
  users: { bio: 'обновлено' },
  roadmaps: { order: 7 },
  'roadmap-nodes': { order: 7 },
  'roadmap-edges': { animated: true },
  courses: { order: 7 },
  sections: { order: 7 },
  lessons: { order: 7 },
  achievements: { pointsReward: 7 },
  'trainer-topics': { order: 7 },
  'trainer-tasks': { order: 7 },
  'faq-items': { order: 7 },
  'user-progress': { lastAccessedAt: new Date().toISOString() },
  'user-achievements': { unlockedAt: new Date().toISOString() },
  'points-transactions': { description: 'обновлено' },
  notes: { content: 'обновлено' },
  comments: { content: 'обновлено' },
  notifications: { isRead: true },
  certificates: { title: 'обновлено' },
  streaks: { totalActiveDays: 7 },
  'user-trainer-progress': { userCode: '// обновлено' },
  'yandex-disk-imports': { errorLog: 'обновлено' },
}

let payload: Payload
let ctx: FixtureContext
let owner: TestUser
let other: TestUser
let admin: TestUser

function actor(who: Who): User | undefined {
  return { anon: undefined, owner, other, admin }[who]
}

function allowed(rule: Rule, who: Who): boolean {
  switch (rule) {
    case 'public':
      return true
    case 'auth':
      return who !== 'anon'
    case 'own':
      // У users «своё» — это сам пользователь (документом выступает сам owner).
      return who === 'owner' || who === 'admin'
    case 'admin':
      return who === 'admin'
    case 'nobody':
      return false
  }
}

/** Документ, которым владеет owner (для users — сам owner). */
async function ownedDoc(slug: string): Promise<number> {
  if (slug === 'users') return owner.id
  if (slug === 'streaks') {
    // Серия у пользователя одна — берём существующую, если она уже есть.
    const existing = await payload.find({ collection: 'streaks', where: { user: { equals: owner.id } }, limit: 1 })
    if (existing.docs[0]) return existing.docs[0].id
  }
  const data = await makeValid(payload, slug, ctx, owner.id)
  // Пара (user, task) уникальна — под каждый документ своя задача.
  if (slug === 'user-trainer-progress') data.task = (await createSumTask(payload)).id
  const doc = await payload.create({ collection: slug as CollectionSlug, data: data as never, context: { skipHooks: true } })
  return doc.id as number
}

async function attempt(fn: () => Promise<unknown>): Promise<'ok' | 'denied'> {
  try {
    await fn()
    return 'ok'
  } catch (error) {
    const status = (error as { status?: number }).status
    const name = (error as Error).name
    if (status === 403 || status === 404 || status === 401 || name === 'Forbidden' || name === 'NotFound') return 'denied'
    throw error
  }
}

beforeAll(async () => {
  payload = await getTestPayload()
  ctx = await buildFixtureContext(payload)
  owner = await createStudent(payload)
  other = await createStudent(payload)
  admin = await createAdmin(payload)
})

describe('матрица прав покрывает все коллекции', () => {
  it('для каждой коллекции есть строка матрицы и патч', () => {
    expect(Object.keys(MATRIX).sort()).toEqual(Object.keys(VALID).sort())
    expect(Object.keys(PATCH).sort()).toEqual(Object.keys(VALID).sort())
  })
})

const WHO: Who[] = ['anon', 'owner', 'other', 'admin']

describe.each(Object.keys(MATRIX))('права: %s', (slug) => {
  const rules = MATRIX[slug]

  it.each(WHO)('read — %s', async (who) => {
    const id = await ownedDoc(slug)
    let visible = false
    const outcome = await attempt(async () => {
      const result = await payload.find({
        collection: slug as CollectionSlug,
        where: { id: { equals: id } },
        user: actor(who),
        overrideAccess: false,
        depth: 0,
      })
      visible = result.totalDocs === 1
    })
    expect(outcome === 'ok' && visible).toBe(allowed(rules.read, who))
  })

  it.each(WHO)('create — %s', async (who) => {
    if (slug === 'users' && who === 'owner') return
    const data = await makeValid(payload, slug, ctx, actor(who)?.id ?? owner.id)
    if (slug === 'user-trainer-progress') data.task = (await createSumTask(payload)).id
    if (slug === 'streaks') data.user = (await createStudent(payload)).id
    const outcome = await attempt(() =>
      payload.create({
        collection: slug as CollectionSlug,
        data: data as never,
        user: actor(who),
        overrideAccess: false,
        context: { skipHooks: true },
      }),
    )
    expect(outcome === 'ok').toBe(allowed(rules.create, who))
  })

  it.each(WHO)('update — %s', async (who) => {
    const id = await ownedDoc(slug)
    const outcome = await attempt(() =>
      payload.update({
        collection: slug as CollectionSlug,
        id,
        data: PATCH[slug] as never,
        user: actor(who),
        overrideAccess: false,
        context: { skipHooks: true },
      }),
    )
    expect(outcome === 'ok').toBe(allowed(rules.update, who))
  })

  it.each(WHO)('delete — %s', async (who) => {
    // Удалять самого owner нельзя — он нужен остальным тестам; для users берём свежего студента.
    const target = slug === 'users' ? await createStudent(payload) : null
    const id = target ? target.id : await ownedDoc(slug)
    const as = slug === 'users' && who === 'owner' ? target! : actor(who)
    const outcome = await attempt(() =>
      payload.delete({ collection: slug as CollectionSlug, id, user: as, overrideAccess: false }),
    )
    expect(outcome === 'ok').toBe(allowed(rules.delete, who))
  })
})

describe('глобал site-settings', () => {
  it.each(WHO)('read — %s', async (who) => {
    const outcome = await attempt(() =>
      payload.findGlobal({ slug: 'site-settings', user: actor(who), overrideAccess: false }),
    )
    expect(outcome === 'ok').toBe(who !== 'anon')
  })

  it.each(WHO)('update — %s', async (who) => {
    const outcome = await attempt(() =>
      payload.updateGlobal({
        slug: 'site-settings',
        data: { platformDescription: `правка ${who}` },
        user: actor(who),
        overrideAccess: false,
      }),
    )
    expect(outcome === 'ok').toBe(who === 'admin')
  })
})

describe('доступ к админке', () => {
  it('студент не проходит проверку access.admin, админ проходит', async () => {
    const check = payload.collections.users.config.access.admin
    expect(check).toBeTypeOf('function')
    const req = (user: User) => ({ req: { user, payload } }) as never
    expect(await check!(req(owner))).toBe(false)
    expect(await check!(req(admin))).toBe(true)
  })
})

describe('попытки эскалации прав', () => {
  it('студент не может назначить себе роль admin (field-level access)', async () => {
    const student = await createStudent(payload)
    const updated = await payload.update({
      collection: 'users', id: student.id, data: { role: 'admin' }, user: student, overrideAccess: false,
    })
    expect(updated.role).toBe('student')
    const fresh = await payload.findByID({ collection: 'users', id: student.id })
    expect(fresh.role).toBe('student')
  })

  it('студент не может создать пользователя-админа', async () => {
    const outcome = await attempt(() =>
      payload.create({
        collection: 'users',
        data: { email: `evil-${Date.now()}@lms.test`, password: 'Evil-Pass-1', firstName: 'Злой', lastName: 'Студент', role: 'admin' },
        user: owner,
        overrideAccess: false,
      }),
    )
    expect(outcome).toBe('denied')
  })

  it('студент не может редактировать чужой профиль', async () => {
    const outcome = await attempt(() =>
      payload.update({ collection: 'users', id: other.id, data: { firstName: 'Взломан' }, user: owner, overrideAccess: false }),
    )
    expect(outcome).toBe('denied')
    expect((await payload.findByID({ collection: 'users', id: other.id })).firstName).not.toBe('Взломан')
  })

  it.each(['user-progress', 'notes', 'comments'])('%s: владелец на создании подставляется хуком, чужой user игнорируется', async (slug) => {
    const data = await makeValid(payload, slug, ctx, other.id)
    const doc = await payload.create({ collection: slug as CollectionSlug, data: data as never, user: owner, overrideAccess: false })
    expect((doc as { user: number | { id: number } }).user).toEqual(expect.objectContaining({ id: owner.id }))
  })

  it('user-trainer-progress: студент не может записать прогресс ни на чужое, ни на своё имя', async () => {
    const task = await createSumTask(payload)
    for (const user of [other.id, owner.id]) {
      await expect(
        payload.create({
          collection: 'user-trainer-progress',
          data: { user, task: task.id },
          user: owner,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    }
  })

  it('студент не видит скрытые поля задачи: эталон, разбор и ожидаемый вывод', async () => {
    const task = await createSumTask(payload)
    const asStudent = await payload.findByID({ collection: 'trainer-tasks', id: task.id, user: owner, overrideAccess: false })
    for (const field of ['solutionCode', 'solutionCodeTs', 'solutionNotes', 'expectedOutput'] as const) {
      expect(asStudent[field], field).toBeUndefined()
    }
    const asAdmin = await payload.findByID({ collection: 'trainer-tasks', id: task.id, user: admin, overrideAccess: false })
    expect(asAdmin.solutionCode).toContain('return a + b')
    expect(asAdmin.expectedOutput).toBe('секрет')
  })

  it('студент видит чужие профили (нужно лидерборду), но без хеша пароля и токенов', async () => {
    await login(payload, other)
    const found = await payload.findByID({ collection: 'users', id: other.id, user: owner, overrideAccess: false })
    expect(found.email).toBe(other.email)
    for (const secret of ['hash', 'salt', 'resetPasswordToken', 'resetPasswordExpiration', 'password', 'loginAttempts', 'lockUntil']) {
      expect(found, secret).not.toHaveProperty(secret)
    }
    // Сессии чужого пользователя (после его входа) наружу не отдаются.
    expect((found as { sessions?: unknown[] }).sessions ?? []).toEqual([])
  })

  // ↓ Найденные дефекты: тест описывает ожидаемое поведение и помечен it.fails,
  //   пока продукт не исправлен. После исправления снять .fails.

  it('студент не должен менять себе totalPoints', async () => {
    const student = await createStudent(payload)
    await payload.update({ collection: 'users', id: student.id, data: { totalPoints: 100500 }, user: student, overrideAccess: false })
    const fresh = await payload.findByID({ collection: 'users', id: student.id })
    expect(fresh.totalPoints).toBe(0)
  })

  it('скрытый админом студент (isActive=false) не должен сам вернуть себя в лидерборд', async () => {
    const student = await createStudent(payload, { isActive: false })
    await payload.update({ collection: 'users', id: student.id, data: { isActive: true }, user: student, overrideAccess: false })
    const fresh = await payload.findByID({ collection: 'users', id: student.id })
    expect(fresh.isActive).toBe(false)
  })

  it.fails('БАГ: владелец заметки не должен переписать её на другого пользователя через update', async () => {
    const note = await payload.create({
      collection: 'notes', data: { user: owner.id, lesson: ctx.lessonId, content: 'моё' }, user: owner, overrideAccess: false,
    })
    await payload.update({ collection: 'notes', id: note.id, data: { user: other.id }, user: owner, overrideAccess: false })
    const fresh = await payload.findByID({ collection: 'notes', id: note.id, depth: 0 })
    expect(fresh.user).toBe(owner.id)
  })

  it.fails('БАГ: студент не должен читать неопубликованные уроки через API', async () => {
    const draft = await payload.create({
      collection: 'lessons', data: { title: `Черновик ${Date.now()}`, course: ctx.courseId, isPublished: false } as never,
    })
    const outcome = await attempt(() => payload.findByID({ collection: 'lessons', id: draft.id, user: owner, overrideAccess: false }))
    expect(outcome).toBe('denied')
  })
})

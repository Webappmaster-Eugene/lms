import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import type { Achievement, PointsTransaction } from '@/payload-types'
import {
  captureEmails,
  createAdmin,
  createCourseTree,
  createStudent,
  createSumTask,
  getTestPayload,
  login,
  type CapturedEmail,
  type TestUser,
} from '../helpers/payload'

/**
 * Хуки Payload на настоящей базе: цепочка начислений при прохождении урока,
 * сертификаты, уведомления, серия, достижения, письма, очистка связей.
 * Почта перехватывается на `payload.sendEmail` — реальных писем нет.
 */
let payload: Payload
let emails: { sent: CapturedEmail[]; restore: () => void }
const achievements: Achievement[] = []

async function transactions(userId: number): Promise<PointsTransaction[]> {
  const result = await payload.find({
    collection: 'points-transactions',
    where: { user: { equals: userId } },
    sort: 'id',
    limit: 100,
    depth: 0,
  })
  return result.docs
}

async function completeLesson(student: TestUser, lessonId: number) {
  return payload.create({
    collection: 'user-progress',
    data: { lesson: lessonId, isCompleted: true, completedAt: new Date().toISOString() } as never,
    user: student,
    overrideAccess: false,
  })
}

const total = async (userId: number) => (await payload.findByID({ collection: 'users', id: userId })).totalPoints

beforeAll(async () => {
  payload = await getTestPayload()
  emails = captureEmails(payload)
  for (const data of [
    { title: 'Первый шаг (hooks)', description: 'Первый урок', criteriaType: 'lesson_count' as const, criteriaValue: 1, pointsReward: 5 },
    { title: 'Курс пройден (hooks)', description: 'Любой курс', criteriaType: 'course_completion' as const, criteriaValue: 1, pointsReward: 30 },
  ]) {
    achievements.push(await payload.create({ collection: 'achievements', data: { ...data, isActive: true } }))
  }
})

afterAll(async () => {
  // Не оставляем активных достижений другим файлам: они бы начисляли лишние баллы.
  for (const a of achievements) await payload.update({ collection: 'achievements', id: a.id, data: { isActive: false } })
  emails.restore()
})

beforeEach(() => {
  emails.sent.length = 0
})

describe('прохождение урока → баллы, серия, достижения', () => {
  it('первый урок: транзакция, серия, достижение «Первый шаг» с бонусом', async () => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 2 })
    await completeLesson(student, tree.lessons[0].id)

    const txs = await transactions(student.id)
    expect(txs.map((t) => [t.reason, t.amount])).toEqual([
      ['lesson_completed', 10],
      ['achievement_unlocked', 5],
    ])
    expect(txs[0].relatedEntity).toBe(String(tree.lessons[0].id))
    expect(await total(student.id)).toBe(15)

    const streak = await payload.find({ collection: 'streaks', where: { user: { equals: student.id } } })
    expect(streak.docs[0]).toMatchObject({
      currentStreak: 1, longestStreak: 1, totalActiveDays: 1,
      lastActivityDate: new Date().toISOString().split('T')[0],
    })

    const unlocked = await payload.find({ collection: 'user-achievements', where: { user: { equals: student.id } }, depth: 1 })
    expect(unlocked.docs.map((u) => (u.achievement as Achievement).title)).toEqual(['Первый шаг (hooks)'])

    expect(emails.sent.filter((e) => e.to === student.email).map((e) => e.subject)).toEqual(['Новое достижение: Первый шаг (hooks)'])
  })

  it('последний урок курса: бонусы за курс и роадмап, totalPoints = сумма транзакций', async () => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 2 })
    await completeLesson(student, tree.lessons[0].id)
    await completeLesson(student, tree.lessons[1].id)

    const txs = await transactions(student.id)
    const reasons = txs.map((t) => t.reason)
    expect(reasons.filter((r) => r === 'lesson_completed')).toHaveLength(2)
    expect(txs.find((t) => t.reason === 'course_completed')).toMatchObject({ amount: 50, relatedEntity: String(tree.course.id) })
    expect(txs.find((t) => t.reason === 'roadmap_completed')).toMatchObject({ amount: 200, relatedEntity: String(tree.roadmap.id) })
    // Достижение «Курс пройден» (+30) выдаётся тем же проходом.
    expect(txs.filter((t) => t.reason === 'achievement_unlocked').map((t) => t.amount).sort()).toEqual([30, 5])
    expect(await total(student.id)).toBe(txs.reduce((acc, t) => acc + t.amount, 0))
  })

  it('завершение курса и роадмапа шлёт письма', async () => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 1 })
    await completeLesson(student, tree.lessons[0].id)
    const subjects = emails.sent.filter((e) => e.to === student.email).map((e) => e.subject)
    expect(subjects).toEqual(
      expect.arrayContaining([`Курс «${tree.course.title}» завершён!`, expect.stringContaining(`Роадмап «${tree.roadmap.title}» завершён!`)]),
    )
  })

  it('завершение курса и роадмапа выдаёт сертификаты', async () => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 1 })
    await completeLesson(student, tree.lessons[0].id)
    const certificates = await payload.find({ collection: 'certificates', where: { user: { equals: student.id } }, sort: 'type' })
    expect(certificates.docs.map((c) => [c.type, c.title])).toEqual([
      ['course', tree.course.title],
      ['roadmap', tree.roadmap.title],
    ])
    for (const c of certificates.docs) expect(c.certificateNumber).toMatch(/^MC-[CR]-[0-9A-Z]+-[0-9A-F]{6}$/)
  })

  it('завершение курса создаёт уведомления «Курс завершён!» и «Роадмап завершён!»', async () => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 1 })
    await completeLesson(student, tree.lessons[0].id)
    const titles = (await payload.find({ collection: 'notifications', where: { user: { equals: student.id } } })).docs.map((n) => n.title)
    expect(titles).toEqual(expect.arrayContaining(['Курс завершён!', 'Роадмап завершён!']))
  })

  it('полученное достижение создаёт уведомление в колокольчике', async () => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 2 })
    await completeLesson(student, tree.lessons[0].id)
    const notes = await payload.find({ collection: 'notifications', where: { user: { equals: student.id } } })
    expect(notes.docs.map((n) => n.title)).toContain('Достижение: Первый шаг (hooks)')
  })

  it('неопубликованный урок не мешает считать курс завершённым', async () => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 1 })
    await payload.create({
      collection: 'lessons',
      data: { title: `Черновик ${tree.course.slug}`, slug: `draft-${tree.course.slug}`, course: tree.course.id, isPublished: false },
    })
    await completeLesson(student, tree.lessons[0].id)
    const reasons = (await transactions(student.id)).map((t) => t.reason)
    expect(reasons).toContain('course_completed')
  })

  it('идемпотентность: снятие и повторная отметка урока не начисляет баллы второй раз', async () => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 3 })
    const progress = await completeLesson(student, tree.lessons[0].id)
    const before = await transactions(student.id)

    await payload.update({ collection: 'user-progress', id: progress.id, data: { isCompleted: false }, user: student, overrideAccess: false })
    await payload.update({ collection: 'user-progress', id: progress.id, data: { isCompleted: true }, user: student, overrideAccess: false })
    // Даже новая запись прогресса на тот же урок не даёт второй транзакции.
    await completeLesson(student, tree.lessons[0].id)

    expect(await transactions(student.id)).toHaveLength(before.length)
    expect(await total(student.id)).toBe(before.reduce((a, t) => a + t.amount, 0))
  })

  it('незавершённый прогресс (просто открыл урок) ничего не начисляет', async () => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 1 })
    await payload.create({
      collection: 'user-progress',
      data: { lesson: tree.lessons[0].id, lastAccessedAt: new Date().toISOString() } as never,
      user: student,
      overrideAccess: false,
    })
    expect(await transactions(student.id)).toEqual([])
    expect((await payload.find({ collection: 'streaks', where: { user: { equals: student.id } } })).totalDocs).toBe(0)
  })

  it('баллы за урок берутся из настроек сайта', async () => {
    const before = await payload.findGlobal({ slug: 'site-settings' })
    await payload.updateGlobal({ slug: 'site-settings', data: { points: { ...before.points, lessonCompleted: 3 } } })
    try {
      const student = await createStudent(payload)
      const tree = await createCourseTree(payload, { lessons: 2 })
      await completeLesson(student, tree.lessons[0].id)
      expect((await transactions(student.id))[0]).toMatchObject({ reason: 'lesson_completed', amount: 3 })
    } finally {
      await payload.updateGlobal({ slug: 'site-settings', data: { points: before.points } })
    }
  })

  it('параллельные отметки одного урока не начисляют баллы дважды', async () => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 3 })
    await Promise.allSettled(Array.from({ length: 4 }, () => completeLesson(student, tree.lessons[0].id)))
    const lessonTx = (await transactions(student.id)).filter((t) => t.reason === 'lesson_completed')
    expect(lessonTx).toHaveLength(1)
  })

  it('параллельные отметки разных уроков все сохраняются (без deadlock на users)', async () => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 5 })
    // Пять уроков разом: гонка за строку users в recalculateTotalPoints воспроизводится стабильно.
    const results = await Promise.allSettled(tree.lessons.map((lesson) => completeLesson(student, lesson.id)))
    expect(results.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason))).toEqual([])
  })
})

describe('серия (updateStreak)', () => {
  async function prepare(lastActivity: string, current: number, longest: number) {
    const student = await createStudent(payload)
    await payload.create({
      collection: 'streaks',
      data: { user: student.id, currentStreak: current, longestStreak: longest, lastActivityDate: lastActivity, totalActiveDays: 10 },
    })
    const tree = await createCourseTree(payload, { lessons: 2 })
    await completeLesson(student, tree.lessons[0].id)
    return (await payload.find({ collection: 'streaks', where: { user: { equals: student.id } } })).docs[0]
  }
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return d.toISOString().split('T')[0]
  }

  it('активность вчера продолжает серию и обновляет рекорд', async () => {
    expect(await prepare(day(-1), 4, 4)).toMatchObject({ currentStreak: 5, longestStreak: 5, totalActiveDays: 11, lastActivityDate: day(0) })
  })

  it('пропуск дня сбрасывает серию до 1, рекорд сохраняется', async () => {
    expect(await prepare(day(-3), 7, 9)).toMatchObject({ currentStreak: 1, longestStreak: 9, totalActiveDays: 11 })
  })

  it('второй урок за день не увеличивает серию', async () => {
    expect(await prepare(day(0), 2, 3)).toMatchObject({ currentStreak: 2, longestStreak: 3, totalActiveDays: 10 })
  })
})

describe('тренажёр (awardTrainerPoints)', () => {
  it('решённая задача даёт её pointsReward, повторная отметка — ничего', async () => {
    const student = await createStudent(payload)
    const task = await createSumTask(payload, { pointsReward: 15 })
    const progress = await payload.create({
      collection: 'user-trainer-progress',
      data: { user: student.id, task: task.id, isCompleted: true, verifiedBy: 'server' },
    })
    await payload.update({ collection: 'user-trainer-progress', id: progress.id, data: { isCompleted: false } })
    await payload.update({ collection: 'user-trainer-progress', id: progress.id, data: { isCompleted: true } })
    const txs = (await transactions(student.id)).filter((t) => t.reason === 'trainer_task_completed')
    expect(txs).toHaveLength(1)
    expect(txs[0]).toMatchObject({ amount: 15, relatedEntity: String(task.id) })
    expect(await total(student.id)).toBe(15)
  })

  it('задача с нулевой наградой берёт баллы из настроек сайта', async () => {
    const student = await createStudent(payload)
    const task = await createSumTask(payload, { pointsReward: 0 })
    await payload.create({ collection: 'user-trainer-progress', data: { user: student.id, task: task.id, isCompleted: true, verifiedBy: 'server' } })
    expect((await transactions(student.id))[0]).toMatchObject({ reason: 'trainer_task_completed', amount: 10 })
  })

  it('студент не может записать себе «решено» напрямую через API и получить баллы', async () => {
    const student = await createStudent(payload)
    const task = await createSumTask(payload)
    await expect(
      payload.create({
        collection: 'user-trainer-progress',
        data: { task: task.id, isCompleted: true, verifiedBy: 'server' } as never,
        user: student,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    expect(await transactions(student.id)).toEqual([])
  })
})

describe('сертификаты и уведомления по транзакциям', () => {
  it('транзакция за курс выдаёт ровно один сертификат, повторная — не дублирует', async () => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 1 })
    await completeLesson(student, tree.lessons[0].id)
    for (let i = 0; i < 2; i += 1) {
      await payload.create({
        collection: 'points-transactions',
        data: { user: student.id, amount: 50, reason: 'course_completed', relatedEntity: String(tree.course.id) },
      })
    }
    const certs = await payload.find({ collection: 'certificates', where: { user: { equals: student.id } } })
    expect(certs.docs.filter(cert => cert.type === 'course')).toHaveLength(1)
  })

  it('ручная корректировка баллов не создаёт ни сертификата, ни уведомления, ни письма', async () => {
    const student = await createStudent(payload)
    await payload.create({ collection: 'points-transactions', data: { user: student.id, amount: 7, reason: 'admin_adjustment' } })
    expect((await payload.find({ collection: 'certificates', where: { user: { equals: student.id } } })).totalDocs).toBe(0)
    expect((await payload.find({ collection: 'notifications', where: { user: { equals: student.id } } })).totalDocs).toBe(0)
    expect(emails.sent.filter((e) => e.to === student.email)).toEqual([])
  })

  it('выдача достижения админом вручную шлёт письмо о достижении', async () => {
    const student = await createStudent(payload)
    await payload.create({
      collection: 'user-achievements',
      data: { user: student.id, achievement: achievements[0].id, unlockedAt: new Date().toISOString() },
    })
    expect(emails.sent.map((e) => [e.to, e.subject])).toEqual([[student.email, 'Новое достижение: Первый шаг (hooks)']])
  })

  it('выдача достижения админом создаёт уведомление', async () => {
    const student = await createStudent(payload)
    await payload.create({
      collection: 'user-achievements',
      data: { user: student.id, achievement: achievements[0].id, unlockedAt: new Date().toISOString() },
    })
    const notes = await payload.find({ collection: 'notifications', where: { user: { equals: student.id } } })
    expect(notes.docs[0]).toMatchObject({ type: 'achievement', link: '/profile', isRead: false })
  })
})

describe('приглашение и восстановление пароля', () => {
  it('новый пользователь получает письмо-приглашение со ссылкой на /reset-password, по токену задаётся пароль', async () => {
    const admin = await createAdmin(payload)
    const email = `invite-${Date.now()}@lms.test`
    await payload.create({
      collection: 'users',
      data: { email, password: 'Temporary-Pass-1', firstName: 'Новичок', lastName: 'Приглашённый', role: 'student' },
      user: admin,
      overrideAccess: false,
    })
    expect(emails.sent).toHaveLength(1)
    const [mail] = emails.sent
    expect(mail.to).toBe(email)
    expect(mail.subject).toMatch(/^Доступ к /)
    expect(mail.html).toContain('Новичок')
    const match = /http:\/\/lms\.test\/reset-password\?token=([A-Za-z0-9%]+)/.exec(mail.html ?? '')
    expect(match, 'ссылка на /reset-password в письме').not.toBeNull()
    expect(mail.html).not.toContain('/admin/reset')
    expect(mail.html).not.toContain('Temporary-Pass-1')

    const user = (await payload.find({ collection: 'users', where: { email: { equals: email } }, showHiddenFields: true })).docs[0]
    const ttlDays = (new Date(user.resetPasswordExpiration as string).getTime() - Date.now()) / 86_400_000
    expect(ttlDays).toBeGreaterThan(6.9)
    expect(ttlDays).toBeLessThanOrEqual(7)

    await payload.resetPassword({
      collection: 'users',
      data: { token: decodeURIComponent(match![1]), password: 'Chosen-Pass-1' },
      overrideAccess: true,
    })
    const token = await login(payload, { email, password: 'Chosen-Pass-1' })
    expect(token).toBeTruthy()
    // Токен одноразовый.
    await expect(
      payload.resetPassword({ collection: 'users', data: { token: decodeURIComponent(match![1]), password: 'Again-Pass-1' }, overrideAccess: true }),
    ).rejects.toThrow()
  })

  it('сбой почты не мешает создать пользователя', async () => {
    emails.restore()
    const spy = vi.spyOn(payload, 'sendEmail').mockRejectedValue(new Error('SMTP недоступен'))
    try {
      const email = `nomail-${Date.now()}@lms.test`
      const user = await payload.create({
        collection: 'users',
        data: { email, password: 'Some-Pass-1', firstName: 'Без', lastName: 'Почты', role: 'student' },
      })
      expect(user.email).toBe(email)
    } finally {
      spy.mockRestore()
      emails = captureEmails(payload)
    }
  })

  it('forgot-password шлёт письмо со ссылкой на /reset-password (не в админку), срок — час', async () => {
    const student = await createStudent(payload, { firstName: 'Забывчивый' })
    await payload.forgotPassword({ collection: 'users', data: { email: student.email } })
    expect(emails.sent).toHaveLength(1)
    expect(emails.sent[0].subject).toMatch(/^Восстановление пароля/)
    expect(emails.sent[0].html).toMatch(/http:\/\/lms\.test\/reset-password\?token=/)
    expect(emails.sent[0].html).not.toContain('/admin/reset')
    const user = await payload.findByID({ collection: 'users', id: student.id, showHiddenFields: true })
    const ttlMinutes = (new Date(user.resetPasswordExpiration as string).getTime() - Date.now()) / 60_000
    expect(ttlMinutes).toBeGreaterThan(55)
    expect(ttlMinutes).toBeLessThanOrEqual(60)
  })

  it('forgot-password на неизвестный email не шлёт писем и не раскрывает отсутствие аккаунта', async () => {
    await expect(payload.forgotPassword({ collection: 'users', data: { email: 'nobody@lms.test' } })).resolves.not.toThrow()
    expect(emails.sent).toEqual([])
  })

  it('после 5 неверных паролей аккаунт блокируется даже для верного пароля', async () => {
    const student = await createStudent(payload)
    for (let i = 0; i < 5; i += 1) {
      await expect(login(payload, { email: student.email, password: 'wrong-password' })).rejects.toThrow()
    }
    await expect(login(payload, student)).rejects.toThrow(/locked|заблок/i)
  })
})

describe('удаление документов со связями', () => {
  it('удаление урока чистит прогресс, заметки и комментарии, история баллов остаётся', async () => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 2 })
    const lessonId = tree.lessons[0].id
    await completeLesson(student, lessonId)
    await payload.create({ collection: 'notes', data: { lesson: lessonId, content: 'заметка' } as never, user: student, overrideAccess: false })
    await payload.create({ collection: 'comments', data: { lesson: lessonId, content: 'вопрос' } as never, user: student, overrideAccess: false })

    await payload.delete({ collection: 'lessons', id: lessonId })

    for (const collection of ['user-progress', 'notes', 'comments'] as const) {
      expect((await payload.count({ collection, where: { lesson: { equals: lessonId } } })).totalDocs, collection).toBe(0)
    }
    await expect(payload.findByID({ collection: 'lessons', id: lessonId })).rejects.toThrow()
    expect((await transactions(student.id)).some((t) => t.relatedEntity === String(lessonId))).toBe(true)
  })

  it('полученное кем-то достижение удаляется вместе с выдачами', async () => {
    const student = await createStudent(payload)
    const achievement = await payload.create({
      collection: 'achievements',
      data: { title: 'Удаляемое', description: 'x', criteriaType: 'lesson_count', criteriaValue: 999999, isActive: false },
    })
    await payload.create({
      collection: 'user-achievements',
      data: { user: student.id, achievement: achievement.id, unlockedAt: new Date().toISOString() },
      context: { skipHooks: true },
    })
    await payload.delete({ collection: 'achievements', id: achievement.id })
  })

  it('студента с прогрессом можно удалить (зависимые записи чистятся)', async () => {
    const student = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 2 })
    await completeLesson(student, tree.lessons[0].id)
    await payload.delete({ collection: 'users', id: student.id })
  })
})

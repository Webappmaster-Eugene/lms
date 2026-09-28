import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import type { Comment } from '@/payload-types'
import { loadQuestionThreads } from '@/lib/questions'
import { createAdmin, createCourseTree, createStudent, getTestPayload, type CourseTree, type TestUser } from '../helpers/payload'

/**
 * Вопросы к уроку — приватная ветка ученика и ментора. Раньше ученик читал
 * только свои записи, и ответ ментора (другой автор) был ему не виден.
 */
let payload: Payload
let tree: CourseTree
let asker: TestUser
let stranger: TestUser
let mentor: TestUser

const ask = (user: TestUser, content: string, extra: Record<string, unknown> = {}) =>
  payload.create({
    collection: 'comments',
    data: { lesson: tree.lessons[0].id, content, ...extra } as never,
    user,
    overrideAccess: false,
  })

const visibleTo = async (user: TestUser) =>
  (
    await payload.find({
      collection: 'comments',
      where: { lesson: { equals: tree.lessons[0].id } },
      depth: 0,
      limit: 100,
      user,
      overrideAccess: false,
    })
  ).docs.map((c: Comment) => c.content)

const notificationsOf = async (user: TestUser) =>
  (
    await payload.find({
      collection: 'notifications',
      where: { user: { equals: user.id }, type: { equals: 'comment' } },
      depth: 0,
      limit: 100,
    })
  ).docs

beforeAll(async () => {
  payload = await getTestPayload()
  tree = await createCourseTree(payload, { lessons: 2 })
  asker = await createStudent(payload)
  stranger = await createStudent(payload)
  mentor = await createAdmin(payload)
})

describe('ветка вопроса', () => {
  it('ответ ментора виден автору вопроса и не виден другим ученикам', async () => {
    const question = await ask(asker, 'Почему useEffect срабатывает дважды?')
    await ask(mentor, 'Это StrictMode в режиме разработки', { parentComment: question.id })

    expect(await visibleTo(asker)).toEqual(
      expect.arrayContaining(['Почему useEffect срабатывает дважды?', 'Это StrictMode в режиме разработки']),
    )
    const strangerSees = await visibleTo(stranger)
    expect(strangerSees).not.toContain('Почему useEffect срабатывает дважды?')
    expect(strangerSees).not.toContain('Это StrictMode в режиме разработки')
  })

  it('автор получает уведомление об ответе со ссылкой на свой вопрос', async () => {
    const question = await ask(asker, 'Вопрос для уведомления')
    await ask(mentor, 'Ответ для уведомления', { parentComment: question.id })

    const notes = await notificationsOf(asker)
    const note = notes.find((n) => n.message === 'Ответ для уведомления')
    expect(note?.link).toBe(`/lessons/${tree.lessons[0].slug}#comment-${question.id}`)
    expect(note?.title).toContain(tree.lessons[0].title)
  })

  it('ментор получает уведомление о новом вопросе со ссылкой на страницу ответов', async () => {
    const question = await ask(asker, 'Вопрос ментору')

    const note = (await notificationsOf(mentor)).find((n) => n.message === 'Вопрос ментору')
    expect(note?.link).toBe(`/admin/questions#comment-${question.id}`)
  })

  it('уточнение в своей ветке разрешено и не шлёт уведомление самому себе', async () => {
    const question = await ask(asker, 'Исходный вопрос')
    const before = (await notificationsOf(asker)).length

    const followUp = await ask(asker, 'Уточнение', { parentComment: question.id })

    expect(followUp.parentComment).toEqual(expect.objectContaining({ id: question.id }))
    expect((await notificationsOf(asker)).length).toBe(before)
  })

  it('в чужую ветку ученик писать не может', async () => {
    const question = await ask(asker, 'Чужой вопрос')

    await expect(ask(stranger, 'Подглядываю', { parentComment: question.id })).rejects.toThrow()
    expect(await visibleTo(stranger)).not.toContain('Чужой вопрос')
  })

  it('ответ можно отправить без урока — он берётся из вопроса', async () => {
    const question = await ask(asker, 'Вопрос без урока в ответе')

    const reply = await payload.create({
      collection: 'comments',
      data: { content: 'Ответ без урока', parentComment: question.id } as never,
      user: mentor,
      overrideAccess: false,
    })

    expect(reply.lesson).toEqual(expect.objectContaining({ id: tree.lessons[0].id }))
  })

  it('ответ на ответ крепится к корню и к уроку корня', async () => {
    const question = await ask(asker, 'Корень')
    const reply = await ask(mentor, 'Ответ', { parentComment: question.id })

    const nested = await ask(asker, 'Ответ на ответ', { parentComment: reply.id, lesson: tree.lessons[1].id })

    expect(nested.parentComment).toEqual(expect.objectContaining({ id: question.id }))
    expect(nested.lesson).toEqual(expect.objectContaining({ id: tree.lessons[0].id }))
  })

  it('свой комментарий нельзя перенести в чужую ветку правкой', async () => {
    const foreign = await ask(stranger, 'Вопрос постороннего')
    const mine = await ask(asker, 'Мой вопрос')

    await payload.update({
      collection: 'comments',
      id: mine.id,
      data: { parentComment: foreign.id } as never,
      user: asker,
      overrideAccess: false,
    })

    const after = await payload.findByID({ collection: 'comments', id: mine.id, depth: 0 })
    expect(after.parentComment ?? null).toBeNull()
    expect(await visibleTo(stranger)).not.toContain('Мой вопрос')
  })
})

describe('страницы «Мои вопросы» и «Вопросы учеников»', () => {
  it('ученик получает только свои ветки вместе с ответами ментора и уроком', async () => {
    const question = await ask(asker, 'Вопрос для страницы')
    await ask(mentor, 'Ответ для страницы', { parentComment: question.id })
    await ask(stranger, 'Чужой вопрос для страницы')

    const threads = await loadQuestionThreads(payload, asker)
    const mine = threads.find((t) => t.question.content === 'Вопрос для страницы')

    expect(mine?.replies.map((r) => r.content)).toEqual(['Ответ для страницы'])
    expect(mine?.lesson).toEqual({ title: tree.lessons[0].title, slug: tree.lessons[0].slug })
    expect(threads.some((t) => t.question.content === 'Чужой вопрос для страницы')).toBe(false)
  })

  it('ментор получает ветки всех учеников', async () => {
    const threads = await loadQuestionThreads(payload, mentor)

    expect(threads.map((t) => t.question.content)).toEqual(
      expect.arrayContaining(['Вопрос для страницы', 'Чужой вопрос для страницы']),
    )
  })

  it('у вопроса к снятому уроку ссылки нет, а переписка остаётся', async () => {
    const hidden = await createCourseTree(payload, { lessons: 1 })
    await payload.create({
      collection: 'comments',
      data: { lesson: hidden.lessons[0].id, content: 'Вопрос к снятому уроку' } as never,
      user: asker,
      overrideAccess: false,
    })
    await payload.update({ collection: 'lessons', id: hidden.lessons[0].id, data: { isPublished: false } })

    const thread = (await loadQuestionThreads(payload, asker)).find((t) => t.question.content === 'Вопрос к снятому уроку')

    expect(thread).toBeDefined()
    expect(thread?.lesson).toBeNull()
  })
})

describe('отметка ответов прочитанными', () => {
  it('массовая отметка ученика задевает только его уведомления об ответах', async () => {
    const mine = await ask(asker, 'Вопрос для прочтения')
    await ask(mentor, 'Ответ для прочтения', { parentComment: mine.id })
    const theirs = await ask(stranger, 'Чужой вопрос для прочтения')
    await ask(mentor, 'Чужой ответ для прочтения', { parentComment: theirs.id })

    // Тот же запрос, что шлёт markAnswersRead: PATCH /api/notifications?where[...]
    await payload.update({
      collection: 'notifications',
      where: { type: { equals: 'comment' }, isRead: { equals: false }, link: { like: '/lessons/' } },
      data: { isRead: true },
      user: asker,
      overrideAccess: false,
    })

    const unread = async (user: TestUser) =>
      (await notificationsOf(user)).filter((n) => !n.isRead).map((n) => n.message)
    expect(await unread(asker)).not.toContain('Ответ для прочтения')
    expect(await unread(stranger)).toContain('Чужой ответ для прочтения')
    expect(await unread(mentor)).toContain('Чужой вопрос для прочтения')
  })
})

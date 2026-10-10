import { beforeAll, describe, expect, it } from 'vitest'
import type { CollectionBeforeValidateHook, Payload } from 'payload'

import { createAdmin, createCourseTree, createStudent, getTestPayload, login, rest, type CourseTree } from '../helpers/payload'

let payload: Payload
let tree: CourseTree
let mine: string
let other: string
let mentor: string
let ownerId: number
let otherId: number
let mentorId: number

async function comment(token: string, content = 'Исходный вопрос', parentComment?: number) {
  const result = await rest('POST', '/comments', { token, body: { lesson: tree.lessons[0].id, content, parentComment } })
  expect(result.status).toBe(201)
  const doc = result.json.doc as { id: number }
  return doc.id
}

beforeAll(async () => {
  payload = await getTestPayload()
  tree = await createCourseTree(payload)
  const owner = await createStudent(payload)
  const stranger = await createStudent(payload)
  ownerId = owner.id
  otherId = stranger.id
  mine = await login(payload, owner)
  other = await login(payload, stranger)
  const mentorUser = await createAdmin(payload)
  mentorId = mentorUser.id
  mentor = await login(payload, mentorUser)
})

describe('редактирование и удаление своих комментариев через REST', () => {
  it('правит свой вопрос и своё уточнение, сохраняя авторство и ветку', async () => {
    const root = await comment(mine)
    const reply = await comment(mine, 'Уточнение', root)
    for (const id of [root, reply]) {
      const response = await rest('PATCH', `/comments/${id}`, { token: mine, body: {
        content: '  Исправлено  ', user: otherId, lesson: tree.lessons[1].id, parentComment: null,
      } })
      expect(response.status).toBe(200)
      expect(await payload.findByID({ collection: 'comments', id, depth: 0 })).toMatchObject({
        content: 'Исправлено', user: ownerId, lesson: tree.lessons[0].id, parentComment: id === root ? null : root,
      })
    }
  })

  it('не позволяет изменить или удалить чужой вопрос и ответ ментора в своей ветке', async () => {
    const root = await comment(mine)
    const answer = await comment(mentor, 'Ответ ментора', root)
    for (const [token, id] of [[other, root], [mine, answer]] as const) {
      expect((await rest('PATCH', `/comments/${id}`, { token, body: { content: 'Взлом' } })).status).toBeGreaterThanOrEqual(400)
      expect((await rest('DELETE', `/comments/${id}/remove`, { token })).status).toBe(404)
    }
    expect((await payload.findByID({ collection: 'comments', id: answer })).content).toBe('Ответ ментора')
  })

  it('удаляет текст корня, сохраняя ответы, уточнения, приватность и возможность уточнить', async () => {
    const root = await comment(mine, 'Текст, который необходимо удалить')
    const answer = await comment(mentor, 'Полезный ответ', root)
    const followUp = await comment(mine, 'Уточнение', root)
    expect((await rest('DELETE', `/comments/${root}/remove`, { token: mine })).status).toBe(200)
    const deleted = await payload.findByID({ collection: 'comments', id: root, depth: 0 })
    expect(deleted.content).toBe('(Комментарий удалён)')
    expect(deleted.deletedAt).toEqual(expect.any(String))
    expect((await payload.findByID({ collection: 'comments', id: answer })).content).toBe('Полезный ответ')
    expect((await payload.findByID({ collection: 'comments', id: followUp })).content).toBe('Уточнение')
    expect((await rest('GET', `/comments/${root}`, { token: other })).status).toBe(404)
    expect((await rest('GET', `/comments/${answer}`, { token: other })).status).toBe(404)
    await comment(mine, 'После удаления', root)
    expect((await rest('DELETE', `/comments/${root}/remove`, { token: mine })).status).toBe(200)
    expect((await rest('DELETE', `/comments/${root}`, { token: mine })).status).toBe(403)
  })

  it('удаляет своё уточнение, не удаляя корень и другие ответы', async () => {
    const root = await comment(mine)
    const reply = await comment(mine, 'Удаляемое уточнение', root)
    expect((await rest('DELETE', `/comments/${reply}/remove`, { token: mine })).status).toBe(200)
    expect((await payload.findByID({ collection: 'comments', id: root })).content).toBe('Исходный вопрос')
    expect((await payload.findByID({ collection: 'comments', id: reply })).content).toBe('(Комментарий удалён)')
  })

  it('не позволяет подделать дату удаления при создании или правке и воскресить удалённое', async () => {
    const created = await rest('POST', '/comments', { token: mine, body: { lesson: tree.lessons[0].id, content: 'Живой', deletedAt: '2026-10-10T00:00:00Z', isResolved: true } })
    expect(created.status).toBe(201)
    const id = (created.json.doc as { id: number }).id
    expect(await payload.findByID({ collection: 'comments', id })).toMatchObject({ deletedAt: null, isResolved: false })
    expect((await rest('PATCH', `/comments/${id}`, { token: mine, body: { deletedAt: '2026-10-10T00:00:00Z' } })).status).toBe(200)
    expect((await payload.findByID({ collection: 'comments', id })).deletedAt).toBeNull()
    await rest('DELETE', `/comments/${id}/remove`, { token: mine })
    expect((await rest('PATCH', `/comments/${id}`, { token: mine, body: { content: 'Воскрес', deletedAt: null } })).status).toBe(409)
    expect((await payload.findByID({ collection: 'comments', id })).content).toBe('(Комментарий удалён)')
  })

  it('отвергает пустой текст и текст длиннее 2000 символов', async () => {
    const id = await comment(mine)
    for (const content of ['   ', 'x'.repeat(2001)]) {
      expect((await rest('PATCH', `/comments/${id}`, { token: mine, body: { content } })).status).toBe(400)
    }
  })

  it('проверяет актуальный доступ к уроку при правке и удалении', async () => {
    const hidden = await createCourseTree(payload, { lessons: 1 })
    const response = await rest('POST', '/comments', { token: mine, body: { lesson: hidden.lessons[0].id, content: 'Пока доступен' } })
    const id = (response.json.doc as { id: number }).id
    await payload.update({ collection: 'lessons', id: hidden.lessons[0].id, data: { isPublished: false } })
    expect((await rest('PATCH', `/comments/${id}`, { token: mine, body: { content: 'После снятия' } })).status).toBe(404)
    expect((await rest('DELETE', `/comments/${id}/remove`, { token: mine })).status).toBe(404)
    expect((await rest('DELETE', `/comments/${id}/remove`)).status).toBe(401)
  })

  it('редактирование и удаление сохраняют resolved, ответы и прочитанные уведомления без повторной рассылки', async () => {
    const root = await comment(mine, 'Вопрос с ответом')
    const answer = await comment(mentor, 'Ответ, который будет исправлен', root)
    expect((await rest('PATCH', `/comments/${root}`, { token: mentor, body: { isResolved: true } })).status).toBe(200)
    const notifications = () => payload.find({
      collection: 'notifications', depth: 0, limit: 10, sort: 'id', where: { and: [
        { user: { in: [ownerId, mentorId] } }, { type: { equals: 'comment' } },
        { or: [{ link: { equals: `/admin/questions#comment-${root}` } }, { link: { equals: `/lessons/${tree.lessons[0].slug}#comment-${root}` } }] },
      ] },
    })
    const created = await notifications()
    expect(created.docs).toHaveLength(2)
    for (const notification of created.docs) {
      expect((await rest('PATCH', `/notifications/${notification.id}`, { token: notification.user === ownerId ? mine : mentor, body: { isRead: true } })).status).toBe(200)
    }
    const before = await notifications()
    const originalAnswer = await payload.findByID({ collection: 'comments', id: answer, depth: 0 })
    expect((await rest('PATCH', `/comments/${root}`, { token: mine, body: { content: 'Исправленный вопрос' } })).status).toBe(200)
    expect((await rest('PATCH', `/comments/${answer}`, { token: mentor, body: { content: 'Исправленный ответ' } })).status).toBe(200)
    expect((await rest('DELETE', `/comments/${root}/remove`, { token: mine })).status).toBe(200)
    expect((await payload.findByID({ collection: 'comments', id: root })).isResolved).toBe(true)
    expect(await payload.findByID({ collection: 'comments', id: answer, depth: 0 })).toMatchObject({
      content: 'Исправленный ответ', parentComment: root, user: mentorId, createdAt: originalAnswer.createdAt, deletedAt: null,
    })
    const after = await notifications()
    expect(after.totalDocs).toBe(before.totalDocs)
    expect(after.docs.map(({ id, message, isRead }) => ({ id, message, isRead }))).toEqual(before.docs.map(({ id, message, isRead }) => ({ id, message, isRead })))
  })

  it.each(['student', 'admin'] as const)('правка %s сохраняет свежий resolved; отметку явно меняет только ментор', async (actor) => {
    const id = await comment(mine)
    let enter: () => void = () => undefined
    let release: () => void = () => undefined
    const entered = new Promise<void>((resolve) => { enter = resolve })
    const released = new Promise<void>((resolve) => { release = resolve })
    const hooks = payload.collections.comments.config.hooks.beforeValidate ?? []
    const pause: CollectionBeforeValidateHook = async ({ data, originalDoc, operation }) => {
      if (operation === 'update' && originalDoc?.id === id && data?.content === 'Отложенная правка') { enter(); await released }
      return data
    }
    hooks.unshift(pause)
    let pending: ReturnType<typeof rest> | undefined
    try {
      pending = rest('PATCH', `/comments/${id}`, { token: actor === 'admin' ? mentor : mine, body: { content: 'Отложенная правка' } })
      await Promise.race([entered, pending.then((result) => { throw new Error(`PATCH завершился до точки гонки: ${result.status}`) })])
      expect((await rest('PATCH', `/comments/${id}`, { token: mentor, body: { isResolved: true } })).status).toBe(200)
      release()
      expect((await pending).status).toBe(200)
      expect(await payload.findByID({ collection: 'comments', id, depth: 0 })).toMatchObject({ content: 'Отложенная правка', isResolved: true })
      expect((await rest('PATCH', `/comments/${id}`, { token: mine, body: { content: 'Правка с подделкой', isResolved: false } })).status).toBe(200)
      expect(await payload.findByID({ collection: 'comments', id })).toMatchObject({ content: 'Правка с подделкой', isResolved: true })
      expect((await rest('PATCH', `/comments/${id}`, { token: mentor, body: { isResolved: false } })).status).toBe(200)
      expect((await payload.findByID({ collection: 'comments', id })).isResolved).toBe(false)
      expect((await rest('PATCH', `/comments/${id}`, { token: mine, body: { isResolved: true } })).status).toBe(200)
      expect((await payload.findByID({ collection: 'comments', id })).isResolved).toBe(false)
    } finally {
      release()
      if (pending) await pending
      const index = hooks.indexOf(pause)
      if (index !== -1) hooks.splice(index, 1)
    }
  })

  it('отложенная отметка resolved сохраняет текст, который автор исправил до блокировки ментора', async () => {
    const id = await comment(mine, 'Первоначальный текст')
    let enter: () => void = () => undefined
    let release: () => void = () => undefined
    const entered = new Promise<void>((resolve) => { enter = resolve })
    const released = new Promise<void>((resolve) => { release = resolve })
    const hooks = payload.collections.comments.config.hooks.beforeValidate ?? []
    const pause: CollectionBeforeValidateHook = async ({ data, originalDoc, operation }) => {
      if (operation === 'update' && originalDoc?.id === id && data?.isResolved === true && data.content === 'Первоначальный текст') { enter(); await released }
      return data
    }
    hooks.unshift(pause)
    let pending: ReturnType<typeof rest> | undefined
    try {
      pending = rest('PATCH', `/comments/${id}`, { token: mentor, body: { isResolved: true } })
      await Promise.race([entered, pending.then((result) => { throw new Error(`PATCH завершился до точки гонки: ${result.status}`) })])
      expect((await rest('PATCH', `/comments/${id}`, { token: mine, body: { content: 'Свежая правка автора' } })).status).toBe(200)
      expect(await payload.findByID({ collection: 'comments', id, depth: 0 })).toMatchObject({ content: 'Свежая правка автора', isResolved: false })
      release()
      const resolved = await pending
      expect(resolved.status).toBe(200)
      expect(resolved.json.doc).toMatchObject({ content: 'Свежая правка автора', isResolved: true })
      expect(await payload.findByID({ collection: 'comments', id, depth: 0 })).toMatchObject({ content: 'Свежая правка автора', isResolved: true, user: ownerId })
    } finally {
      release()
      if (pending) await pending
      const index = hooks.indexOf(pause)
      if (index !== -1) hooks.splice(index, 1)
    }
  })

  it('заранее начатая правка после удаления получает409 и не восстанавливает текст, дату и ветку', async () => {
    const id = await comment(mine, 'Удаляемый корень')
    const answer = await comment(mentor, 'Сохраняемый ответ', id)
    const before = await payload.findByID({ collection: 'comments', id, depth: 0 })
    let enter: () => void = () => undefined
    let release: () => void = () => undefined
    const entered = new Promise<void>((resolve) => { enter = resolve })
    const released = new Promise<void>((resolve) => { release = resolve })
    const hooks = payload.collections.comments.config.hooks.beforeValidate ?? []
    const pause: CollectionBeforeValidateHook = async ({ data, originalDoc, operation }) => {
      if (operation === 'update' && originalDoc?.id === id && data?.content === 'Поздний текст') { enter(); await released }
      return data
    }
    hooks.unshift(pause)
    let pending: ReturnType<typeof rest> | undefined
    try {
      pending = rest('PATCH', `/comments/${id}`, { token: mine, body: { content: 'Поздний текст', deletedAt: null, parentComment: null } })
      await Promise.race([entered, pending.then((result) => { throw new Error(`PATCH завершился до точки гонки: ${result.status}`) })])
      const removed = await rest('DELETE', `/comments/${id}/remove`, { token: mine })
      expect(removed.status).toBe(200)
      release()
      expect((await pending).status).toBe(409)
      expect(await payload.findByID({ collection: 'comments', id, depth: 0 })).toMatchObject({
        content: '(Комментарий удалён)', deletedAt: removed.json.deletedAt, createdAt: before.createdAt, user: ownerId, parentComment: null,
      })
      expect(await payload.findByID({ collection: 'comments', id: answer, depth: 0 })).toMatchObject({ content: 'Сохраняемый ответ', parentComment: id, user: mentorId })
    } finally {
      release()
      if (pending) await pending
      const index = hooks.indexOf(pause)
      if (index !== -1) hooks.splice(index, 1)
    }
  })

  it('одновременные удаление и правка не восстанавливают содержимое', async () => {
    const id = await comment(mine)
    const results = await Promise.all([
      rest('DELETE', `/comments/${id}/remove`, { token: mine }),
      rest('PATCH', `/comments/${id}`, { token: mine, body: { content: 'Параллельный текст' } }),
    ])
    expect(results[0].status).toBe(200)
    expect([200, 409]).toContain(results[1].status)
    expect(await payload.findByID({ collection: 'comments', id, depth: 0 })).toMatchObject({ content: '(Комментарий удалён)', deletedAt: expect.any(String) })
  })
})

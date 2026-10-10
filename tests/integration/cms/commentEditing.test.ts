import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { createAdmin, createCourseTree, createStudent, getTestPayload, login, rest, type CourseTree } from '../helpers/payload'

let payload: Payload
let tree: CourseTree
let mine: string
let other: string
let mentor: string
let ownerId: number
let otherId: number

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
  mentor = await login(payload, await createAdmin(payload))
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
    const created = await rest('POST', '/comments', { token: mine, body: { lesson: tree.lessons[0].id, content: 'Живой', deletedAt: '2026-10-10T00:00:00Z' } })
    expect(created.status).toBe(201)
    const id = (created.json.doc as { id: number }).id
    expect((await payload.findByID({ collection: 'comments', id })).deletedAt).toBeNull()
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

import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { COMMENT_MAX_LENGTH } from '@/lib/comment-threads'
import { STARTER_TEMPLATES, TEMPLATE_TITLE_MAX } from '@/lib/reply-templates'
import { createAdmin, createStudent, getTestPayload, login, rest } from '../helpers/payload'

let payload: Payload
let mentor: string
let student: string

async function create(body: Record<string, unknown> = { title: 'Нужен код', content: '{имя}, пришлите код' }) {
  const result = await rest('POST', '/reply-templates', { token: mentor, body })
  expect(result.status).toBe(201)
  return (result.json.doc as { id: number }).id
}

const usageOf = async (id: number) =>
  (await payload.findByID({ collection: 'reply-templates', id, depth: 0, overrideAccess: true })).usageCount

beforeAll(async () => {
  payload = await getTestPayload()
  mentor = await login(payload, await createAdmin(payload))
  student = await login(payload, await createStudent(payload))
})

/** Заготовки ответов ментора: счётчик вставок, пределы, права. */
describe('заготовки ответов ментора', () => {
  it('новая заготовка начинает со счётчиком 0, вставки считаются без потерь даже одновременно', async () => {
    const id = await create()
    expect(await usageOf(id)).toBe(0)
    const before = (await payload.findByID({ collection: 'reply-templates', id, depth: 0, overrideAccess: true })).updatedAt

    const results = await Promise.all(Array.from({ length: 5 }, () => rest('POST', `/reply-templates/${id}/use`, { token: mentor })))

    expect(results.map((r) => r.status)).toEqual(Array(5).fill(200))
    expect(results.map((r) => r.json.usageCount).sort()).toEqual([1, 2, 3, 4, 5])
    expect(await usageOf(id)).toBe(5)
    // Вставка - не правка текста: дата изменения остаётся прежней.
    expect((await payload.findByID({ collection: 'reply-templates', id, depth: 0, overrideAccess: true })).updatedAt).toBe(before)
  })

  it('ученик и гость счётчик не трогают, несуществующая заготовка - 404', async () => {
    const id = await create()

    expect((await rest('POST', `/reply-templates/${id}/use`, { token: student })).status).toBe(403)
    expect((await rest('POST', `/reply-templates/${id}/use`)).status).toBe(403)
    expect((await rest('POST', '/reply-templates/999999999/use', { token: mentor })).status).toBe(404)
    expect((await rest('POST', '/reply-templates/abc/use', { token: mentor })).status).toBe(404)
    expect(await usageOf(id)).toBe(0)
  })

  it('ученик не видит заготовки ни списком, ни по id', async () => {
    const id = await create()

    for (const path of ['/reply-templates', `/reply-templates/${id}`]) {
      const result = await rest('GET', path, { token: student })
      expect(result.status).toBe(403)
      expect(JSON.stringify(result.json)).not.toContain('пришлите код')
    }
  })

  it('держит пределы названия и текста', async () => {
    await create({ title: 'т'.repeat(TEMPLATE_TITLE_MAX), content: 'к'.repeat(COMMENT_MAX_LENGTH) })
    for (const body of [
      { title: 'т'.repeat(TEMPLATE_TITLE_MAX + 1), content: 'Текст' },
      { title: 'Название', content: 'к'.repeat(COMMENT_MAX_LENGTH + 1) },
      { title: 'Название', content: '' },
      { title: '', content: 'Текст' },
    ]) {
      expect((await rest('POST', '/reply-templates', { token: mentor, body })).status).toBe(400)
    }
  })

  it('примеры для пустого списка проходят проверку коллекции', async () => {
    for (const starter of STARTER_TEMPLATES) await create({ ...starter })
  })
})

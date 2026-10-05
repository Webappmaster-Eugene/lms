import { beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import type { Course, Lesson, Section } from '@/payload-types'
import { POST } from '@/app/api/manage/content/[collection]/route'
import { PATCH } from '@/app/api/manage/content/[collection]/[id]/route'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, uid } from '../helpers/payload'

let payload: Payload
let adminToken: string
let studentToken: string

const richText = {
  root: { type: 'root', version: 1, direction: null, format: '' as const, indent: 0, children: [{ type: 'paragraph', version: 1, direction: null, format: '', indent: 0, textFormat: 0, textStyle: '', children: [{ type: 'text', version: 1, text: 'Разберите сервер Node.js', detail: 0, format: 0, mode: 'normal', style: '' }] }] },
}

async function write(collection: string, body: unknown, options: { id?: number; token?: string | null; raw?: string; key?: string; headers?: Record<string, string>; requestUrl?: string } = {}) {
  const token = options.token === undefined ? adminToken : options.token
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token) headers.set('Authorization', `JWT ${token}`)
  if (options.key) headers.set('Idempotency-Key', options.key)
  for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value)
  const request = new Request(options.requestUrl ?? `http://lms.test/api/manage/content/${collection}`, { method: options.id ? 'PATCH' : 'POST', headers, body: options.raw ?? JSON.stringify(body) })
  const response = options.id
    ? await PATCH(request, { params: Promise.resolve({ collection, id: String(options.id) }) })
    : await POST(request, { params: Promise.resolve({ collection }) })
  return { status: response.status, body: await response.json() as { doc: Course & Section & Lesson; error?: string } }
}

beforeAll(async () => {
  payload = await getTestPayload()
  adminToken = await login(payload, await createAdmin(payload))
  studentToken = await login(payload, await createStudent(payload))
})

describe('Управление курсами и уроками через LMS API', () => {
  it('доступ только админу, без изменений при 401/403', async () => {
    const { course } = await createCourseTree(payload)
    const before = await payload.count({ collection: 'lessons', where: { course: { equals: course.id } } })
    const body = { title: 'Новый урок', course: course.id }
    expect((await write('lessons', body, { token: null })).status).toBe(401)
    expect((await write('lessons', body, { token: studentToken })).status).toBe(403)
    expect((await payload.count({ collection: 'lessons', where: { course: { equals: course.id } } })).totalDocs).toBe(before.totalDocs)
  })

  it('невалидный JSON, неизвестная коллекция и поля отклоняются', async () => {
    expect((await write('courses', {}, { raw: '{' })).status).toBe(400)
    expect((await write('users', { title: 'Тест' })).status).toBe(404)
    expect((await write('courses', { title: 'Тест', roadmap: 1, role: 'admin' })).status).toBe(400)
  })

  it('cookie-auth запись требует собственный Origin и JSON, явный токен не откатывается к cookie', async () => {
    const { course } = await createCourseTree(payload)
    const body = { title: 'Урок', course: course.id }
    const cookie = `${payload.config.cookiePrefix}-token=${adminToken}`
    expect((await write('lessons', body, { token: null, headers: { Cookie: cookie, Origin: 'https://evil.lms.test' } })).status).toBe(403)
    expect((await write('lessons', body, { token: null, headers: { Cookie: cookie, Origin: 'http://lms.test', 'Sec-Fetch-Site': 'same-site' } })).status).toBe(403)
    expect((await write('lessons', body, { token: null, headers: { Cookie: cookie, Origin: 'https://evil.lms.test', 'Content-Type': 'text/plain' } })).status).toBe(400)
    expect((await write('lessons', body, { token: null, headers: { Cookie: cookie, Origin: 'http://lms.test', 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json; charset=utf-8' } })).status).toBe(201)
    expect((await write('lessons', body, { token: null, headers: { Cookie: cookie, Origin: 'http://lms.test', Authorization: 'JWT invalid-token' } })).status).toBe(401)
    expect((await write('lessons', body)).status).toBe(201)
  })

  it('cookie-auth учитывает настоящий Host за proxy, но не поддельный X-Forwarded-Host', async () => {
    const { course } = await createCourseTree(payload)
    const body = { title: 'Проксируемый урок', course: course.id }
    const options = { token: null, requestUrl: 'http://localhost:3102/api/manage/content/lessons' }
    const cookie = `${payload.config.cookiePrefix}-token=${adminToken}`
    expect((await write('lessons', body, { ...options, headers: { Cookie: cookie, Host: 'host.docker.internal:3102', Origin: 'http://host.docker.internal:3102', 'Sec-Fetch-Site': 'same-origin' } })).status).toBe(201)
    expect((await write('lessons', body, { ...options, headers: { Cookie: cookie, Host: 'learn.mentorcareer.ru', Origin: 'https://learn.mentorcareer.ru', 'X-Forwarded-Proto': 'https', 'Sec-Fetch-Site': 'same-origin' } })).status).toBe(201)
    expect((await write('lessons', body, { ...options, headers: { Cookie: cookie, Host: 'learn.mentorcareer.ru', Origin: 'https://evil.mentorcareer.ru', 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'evil.mentorcareer.ru' } })).status).toBe(403)
  })

  it('один Idempotency-Key создаёт документ единожды, изменённый запрос конфликтует', async () => {
    const { roadmap, course } = await createCourseTree(payload)
    const key = randomUUID()
    const body = { title: 'Повторное сохранение', roadmap: roadmap.id, description: richText }
    const results = await Promise.all([write('courses', body, { key }), write('courses', body, { key })])
    expect(results.map((result) => result.status).sort()).toEqual([200, 201])
    expect(results[0].body.doc.id).toBe(results[1].body.doc.id)
    expect(results[0].body.doc.slug.length).toBeLessThanOrEqual(200)
    expect((await write('courses', { description: richText, roadmap: roadmap.id, title: body.title }, { key })).status).toBe(200)
    expect((await write('courses', { ...body, title: 'Другой запрос' }, { key })).status).toBe(409)
    expect((await payload.count({ collection: 'courses', where: { slug: { contains: key.replaceAll('-', '') } } })).totalDocs).toBe(1)
    expect((await write('sections', { title: 'Та же операция в другой коллекции', course: course.id }, { key })).status).toBe(201)
    expect((await write('courses', { ...body, slug: 'explicit-slug' }, { key: randomUUID() })).status).toBe(400)
  })

  it('roundtrip родного Lexical link version3 и неизменяемых сложных блоков', async () => {
    const { course, roadmap } = await createCourseTree(payload)
    const linked = { ...richText, root: { ...richText.root, children: [{ type: 'paragraph', version: 1, direction: null, format: '', indent: 0, children: [{ type: 'link', version: 3, format: '', indent: 0, direction: null, fields: { linkType: 'custom', url: 'https://nodejs.org', newTab: true }, children: richText.root.children[0].children }] }] } }
    const created = await write('courses', { title: 'Документация', roadmap: roadmap.id, description: linked })
    expect(created.status).toBe(201)
    expect(created.body.doc.description).toEqual(linked)
    expect((await write('courses', { title: 'Документация Node.js', description: created.body.doc.description, expectedUpdatedAt: created.body.doc.updatedAt }, { id: created.body.doc.id })).status).toBe(200)
    const complex = { root: { ...richText.root, children: [{ type: 'legacy-formula', version: 3, formula: 'E=mc2' }] } }
    const lesson = await payload.create({ collection: 'lessons', data: { title: 'Сложный материал', slug: uid('complex'), course: course.id, content: [{ blockType: 'text', content: complex }, { blockType: 'video', title: 'Первый заголовок', videoUrl: 'https://youtube.com/watch?v=abc', displayMode: 'embed' }] } })
    const renamed = await write('lessons', { title: 'Новое имя', content: lesson.content, expectedUpdatedAt: lesson.updatedAt }, { id: lesson.id })
    expect(renamed.status).toBe(200)
    expect(renamed.body.doc.content).toEqual(lesson.content)
    const videoEdited = renamed.body.doc.content?.map((block) => block.blockType === 'video' ? { ...block, title: 'Новый заголовок видео' } : block)
    const edited = await write('lessons', { content: videoEdited, expectedUpdatedAt: renamed.body.doc.updatedAt }, { id: lesson.id })
    expect(edited.status).toBe(200)
    expect(edited.body.doc.content?.[0]).toEqual(lesson.content?.[0])
    const unsafeEdit = edited.body.doc.content?.map((block) => block.blockType === 'text' ? { ...block, content: { root: { ...complex.root, children: [{ type: 'legacy-formula', version: 3, formula: 'changed' }] } } } : block)
    expect((await write('lessons', { content: unsafeEdit, expectedUpdatedAt: edited.body.doc.updatedAt }, { id: lesson.id })).status).toBe(400)
  })

  it('создаёт одинаковые заголовки с уникальными адресами и полную иерархию', async () => {
    const { roadmap } = await createCourseTree(payload, { published: true })
    const first = await write('courses', { title: 'Node.js: начало', roadmap: roadmap.id, description: richText, isPublished: true })
    const second = await write('courses', { title: 'Node.js: начало', roadmap: roadmap.id })
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(first.body.doc.slug).not.toBe(second.body.doc.slug)
    expect(first.body.doc.slug).toMatch(/^node-js-nachalo-/)
    expect(first.body.doc.description).toEqual(richText)
    const section = await write('sections', { title: 'Первые шаги', course: first.body.doc.id, isPublished: true, description: 'Базовые понятия' })
    const lesson = await write('lessons', { title: 'Event loop', course: first.body.doc.id, section: section.body.doc.id, isPublished: true, content: [{ blockType: 'text', content: richText }, { blockType: 'video', title: 'Цикл событий', videoUrl: 'https://youtube.com/watch?v=test', displayMode: 'link' }, { blockType: 'miro', title: 'Схема', embedUrl: 'https://miro.com/app/embed/test', height: 600 }, { blockType: 'link', title: 'Программа', url: `/courses/${first.body.doc.slug}`, platform: 'other' }] })
    expect(section.status).toBe(201)
    expect(lesson.status).toBe(201)
    expect(lesson.body.doc.course).toBe(first.body.doc.id)
    expect(lesson.body.doc.section).toBe(section.body.doc.id)
    expect(lesson.body.doc.content?.map((block) => block.blockType)).toEqual(['text', 'video', 'miro', 'link'])
  })

  it('переименование сохраняет адрес, контент и ID блоков', async () => {
    const { course } = await createCourseTree(payload)
    const created = await write('lessons', { title: 'Старый заголовок', course: course.id, description: 'Пояснение', content: [{ blockType: 'text', content: richText }] })
    const current = created.body.doc
    const updated = await write('lessons', { title: 'Новое название', expectedUpdatedAt: current.updatedAt }, { id: current.id })
    expect(updated.status).toBe(200)
    expect(updated.body.doc).toMatchObject({ id: current.id, title: 'Новое название', slug: current.slug, description: 'Пояснение', content: current.content })
  })

  it('изображения и файлы берутся из медиатеки по ID, отсутствующие файлы отклоняются', async () => {
    const { course, roadmap } = await createCourseTree(payload)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
    const media = await payload.create({ collection: 'media', data: { alt: 'Учебная схема' }, file: { data: png, mimetype: 'image/png', name: `${uid('diagram')}.png`, size: png.length } })
    let lessonId: number | undefined
    let coverCourseId: number | undefined
    try {
      const created = await write('lessons', { title: 'Материалы', course: course.id, content: [{ blockType: 'image', image: media.id, altText: 'Схема' }, { blockType: 'file', title: 'Материалы', file: media.id }] })
      lessonId = created.body.doc?.id
      expect(created.status).toBe(201)
      expect(created.body.doc.content).toEqual(expect.arrayContaining([expect.objectContaining({ blockType: 'image', image: media.id }), expect.objectContaining({ blockType: 'file', file: media.id })]))
      const covered = await write('courses', { title: 'Курс с обложкой', roadmap: roadmap.id, coverImage: media.id })
      coverCourseId = covered.body.doc?.id
      expect(covered.status).toBe(201)
      expect((await write('courses', { title: 'Нет обложки', roadmap: roadmap.id, coverImage: 987654 })).status).toBe(404)
      expect((await write('lessons', { title: 'Нет файла', course: course.id, content: [{ blockType: 'file', title: 'Материалы', file: 987654 }] })).status).toBe(404)
    } finally {
      if (lessonId) await payload.update({ collection: 'lessons', id: lessonId, data: { content: [] } })
      if (coverCourseId) await payload.update({ collection: 'courses', id: coverCourseId, data: { coverImage: null } })
      await payload.delete({ collection: 'media', id: media.id })
    }
  })

  it('устаревшая и параллельная запись не перетирает изменения', async () => {
    const { lessons: [lesson] } = await createCourseTree(payload)
    const patch = { expectedUpdatedAt: lesson.updatedAt }
    const results = await Promise.all([
      write('lessons', { ...patch, description: 'Первый автор' }, { id: lesson.id }),
      write('lessons', { ...patch, description: 'Второй автор' }, { id: lesson.id }),
    ])
    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    const success = results.find((result) => result.status === 200)
    expect((await payload.findByID({ collection: 'lessons', id: lesson.id })).description).toBe(success?.body.doc.description)
    expect((await write('lessons', { ...patch, description: 'Устаревший автор' }, { id: lesson.id })).status).toBe(409)
  })

  it('нельзя переносить материалы, привязывать чужой раздел или чужой узел', async () => {
    const first = await createCourseTree(payload)
    const other = await createCourseTree(payload)
    expect((await write('courses', { roadmap: other.roadmap.id, expectedUpdatedAt: first.course.updatedAt }, { id: first.course.id })).status).toBe(400)
    expect((await write('sections', { course: other.course.id, expectedUpdatedAt: first.section.updatedAt }, { id: first.section.id })).status).toBe(400)
    expect((await write('lessons', { title: 'Чужой раздел', course: first.course.id, section: other.section.id })).status).toBe(400)
    const node = await payload.create({ collection: 'roadmap-nodes', data: { nodeId: uid('node'), label: 'Тема', nodeType: 'topic', roadmap: other.roadmap.id, positionX: 0, positionY: 0 } })
    expect((await write('courses', { title: 'Чужая тема', roadmap: first.roadmap.id, roadmapNode: node.id })).status).toBe(400)
  })

  it('публикация требует опубликованных родителей и не публикует их автоматически', async () => {
    const tree = await createCourseTree(payload, { published: false })
    expect((await write('courses', { title: 'Черновой роадмап', roadmap: tree.roadmap.id, isPublished: true })).status).toBe(400)
    expect((await write('sections', { title: 'Черновой курс', course: tree.course.id, isPublished: true })).status).toBe(400)
    expect((await write('lessons', { title: 'Черновой курс', course: tree.course.id, isPublished: true })).status).toBe(400)
    expect((await payload.findByID({ collection: 'roadmaps', id: tree.roadmap.id })).isPublished).toBe(false)
    expect((await payload.findByID({ collection: 'courses', id: tree.course.id })).isPublished).toBe(false)
    await payload.update({ collection: 'roadmaps', id: tree.roadmap.id, data: { isPublished: true } })
    await payload.update({ collection: 'courses', id: tree.course.id, data: { isPublished: true } })
    const failed = await write('lessons', { title: 'Черновой раздел', course: tree.course.id, section: tree.section.id, isPublished: true })
    expect(failed.status).toBe(400)
    expect(failed.body.error).toMatch(/раздел/)
    expect((await write('lessons', { title: 'Без раздела', course: tree.course.id, isPublished: true })).status).toBe(201)
  })

  it('изменение раздела в пределах курса и снятие публикации сохраняют материалы', async () => {
    const tree = await createCourseTree(payload)
    const section = await write('sections', { title: 'Другая секция', course: tree.course.id, isPublished: true })
    const lesson = tree.lessons[0]
    const updated = await write('lessons', { section: section.body.doc.id, isPublished: false, expectedUpdatedAt: lesson.updatedAt }, { id: lesson.id })
    expect(updated.status).toBe(200)
    expect(updated.body.doc).toMatchObject({ id: lesson.id, course: tree.course.id, section: section.body.doc.id, isPublished: false })
    expect((await payload.findByID({ collection: 'lessons', id: lesson.id })).id).toBe(lesson.id)
  })

  it('без timestamp или с отсутствующим материалом возвращает понятную ошибку', async () => {
    expect((await write('lessons', { description: 'Изменение' }, { id: 987654 })).status).toBe(400)
    expect((await write('lessons', { description: 'Изменение', expectedUpdatedAt: new Date().toISOString() }, { id: 987654 })).status).toBe(404)
    expect((await write('courses', { title: 'Курс', roadmap: 987654 })).status).toBe(404)
  })
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { runSolution } from '@/server/trainer/sandbox'
import { lexical } from '../helpers/fixtures'
import { captureEmails, createAdmin, createStudent, getTestPayload, login, rest, uid } from '../helpers/payload'

type Doc = { id: number; [field: string]: unknown }

let payload: Payload
let adminToken: string
let studentToken: string
let emails: ReturnType<typeof captureEmails>

async function create(collection: string, body: Record<string, unknown>): Promise<Doc> {
  const response = await rest('POST', `/${collection}`, { token: adminToken, body })
  expect(response.status, collection).toBe(201)
  const doc = response.json.doc
  if (!doc || typeof doc !== 'object' || !('id' in doc) || typeof doc.id !== 'number') {
    throw new Error(`Нет ID созданного документа ${collection}`)
  }
  return doc as Doc
}

async function patch(collection: string, id: number, body: Record<string, unknown>) {
  const response = await rest('PATCH', `/${collection}/${id}`, { token: adminToken, body })
  expect(response.status, collection).toBe(200)
}

beforeAll(async () => {
  payload = await getTestPayload()
  emails = captureEmails(payload)
  adminToken = await login(payload, await createAdmin(payload))
  studentToken = await login(payload, await createStudent(payload))
})

afterAll(() => emails?.restore())

describe('практические операции lms-content через REST Payload', () => {
  it('создаёт программу, дополняет урок и публикует её без смены ID и URL', async () => {
    const roadmap = await create('roadmaps', { title: `Карта ${uid('content')}` })
    const course = await create('courses', { title: `Курс ${uid('content')}`, roadmap: roadmap.id })
    const section = await create('sections', { title: `Раздел ${uid('content')}`, course: course.id })
    const lesson = await create('lessons', {
      title: `Урок ${uid('content')}`, course: course.id, section: section.id,
      content: [{ blockType: 'text', content: lexical('Первый абзац') }],
    })

    for (const [collection, doc] of [['courses', course], ['lessons', lesson]] as const) {
      expect(doc.isPublished).toBe(false)
      expect((await rest('GET', `/${collection}/${doc.id}`, { token: studentToken })).status).toBe(404)
    }

    const originalBlocks = lesson.content
    expect(Array.isArray(originalBlocks)).toBe(true)
    if (!Array.isArray(originalBlocks)) throw new Error('Нет блоков урока')
    await patch('lessons', lesson.id, {
      title: 'Переименованный урок', slug: lesson.slug,
      content: [...originalBlocks, { blockType: 'link', title: 'Материал', url: 'https://example.org/lesson', platform: 'other' }],
    })
    const updated = await rest('GET', `/lessons/${lesson.id}?depth=0`, { token: adminToken })
    expect(updated.json).toMatchObject({
      id: lesson.id, slug: lesson.slug, course: course.id, section: section.id,
      content: [originalBlocks[0], expect.objectContaining({ blockType: 'link', title: 'Материал' })],
    })

    for (const [collection, doc] of [['roadmaps', roadmap], ['courses', course], ['sections', section], ['lessons', lesson]] as const) {
      await patch(collection, doc.id, { isPublished: true })
      expect((await rest('GET', `/${collection}/${doc.id}`, { token: studentToken })).status).toBe(200)
    }
    expect((await rest('PATCH', `/lessons/${lesson.id}`, { token: studentToken, body: { title: 'Чужая правка' } })).status).toBe(403)
  })

  it('изменяет карту с числовыми связями и привязкой курса, сохраняя граф', async () => {
    const key = uid('graph')
    const roadmap = await create('roadmaps', { title: `Карта ${key}`, slug: key })
    const course = await create('courses', { title: `Курс ${key}`, roadmap: roadmap.id })
    const first = await create('roadmap-nodes', {
      roadmap: roadmap.id, nodeId: `${key}-start`, label: 'Старт', nodeType: 'category', positionX: 0, positionY: 0,
    })
    const second = await create('roadmap-nodes', {
      roadmap: roadmap.id, nodeId: `${key}-react`, label: 'React', nodeType: 'topic',
      positionX: 300, positionY: 200, bullets: [{ text: 'Компоненты' }], course: course.id,
    })
    await patch('courses', course.id, { roadmapNode: second.id })
    const edge = await create('roadmap-edges', {
      edgeId: `${key}-path`, roadmap: roadmap.id, source: first.id, target: second.id,
    })
    await patch('roadmap-nodes', second.id, { label: 'React и TypeScript', positionX: 400 })

    expect((await rest('GET', `/roadmap-nodes/${second.id}?depth=0`, { token: adminToken })).json).toMatchObject({
      id: second.id, nodeId: second.nodeId, positionX: 400, positionY: 200, course: course.id,
      bullets: [expect.objectContaining({ text: 'Компоненты' })],
    })
    expect((await rest('GET', `/roadmap-edges/${edge.id}?depth=0`, { token: adminToken })).json).toMatchObject({
      id: edge.id, source: first.id, target: second.id, roadmap: roadmap.id,
    })
    expect((await rest('GET', `/courses/${course.id}?depth=0`, { token: adminToken })).json).toMatchObject({
      roadmap: roadmap.id, roadmapNode: second.id,
    })
    expect((await rest('GET', `/roadmaps/${roadmap.id}`, { token: studentToken })).status).toBe(404)
    expect((await rest('GET', `/roadmap-nodes/${second.id}`, { token: studentToken })).status).toBe(200)
    expect((await rest('GET', `/roadmap-edges/${edge.id}`, { token: studentToken })).status).toBe(200)
  })

  it('сохраняет Lexical FAQ, управляет публикацией и меняет один контакт без потери соседних', async () => {
    const faq = await create('faq-items', { question: `Вопрос ${uid('faq')}`, answer: lexical('Ответ'), isPublished: false })
    const query = `/faq-items?where[id][equals]=${faq.id}&where[isPublished][equals]=true`
    expect((await rest('GET', query)).json.totalDocs).toBe(0)
    // Флаг контролирует интерфейс, а сам публичный API разрешает читать черновик.
    expect((await rest('GET', `/faq-items/${faq.id}`)).status).toBe(200)
    await patch('faq-items', faq.id, { answer: lexical('Уточнённый ответ'), isPublished: true })
    expect((await rest('GET', query)).json.totalDocs).toBe(1)
    expect((await rest('GET', `/faq-items/${faq.id}`)).json.answer).toMatchObject(lexical('Уточнённый ответ'))

    const previous = await rest('GET', '/globals/site-settings', { token: adminToken })
    expect(previous.status).toBe(200)
    const contacts = previous.json.contacts
    if (!contacts || typeof contacts !== 'object') throw new Error('Нет группы контактов')
    try {
      const initialized = await rest('POST', '/globals/site-settings', {
        token: adminToken, body: { contacts: {
          ...contacts, telegramGroup: 'https://t.me/lms_skill_group',
          website: 'https://example.org/practice', email: 'practice@lms.test',
        } },
      })
      expect(initialized.status).toBe(200)
      const baseline = await rest('GET', '/globals/site-settings', { token: adminToken })
      const baselineContacts = baseline.json.contacts
      if (!baselineContacts || typeof baselineContacts !== 'object') throw new Error('Нет сохранённых контактов')
      const response = await rest('POST', '/globals/site-settings', {
        token: adminToken, body: { contacts: { ...baselineContacts, telegramChannel: 'https://t.me/lms_skill_practice' } },
      })
      expect(response.status).toBe(200)
      const updated = await rest('GET', '/globals/site-settings', { token: studentToken })
      expect(updated.json.contacts).toEqual({ ...baselineContacts, telegramChannel: 'https://t.me/lms_skill_practice' })
      expect(updated.json.points).toEqual(previous.json.points)
    } finally {
      const restored = { telegramChannel: null, telegramGroup: null, website: null, email: null, ...contacts }
      expect((await rest('POST', '/globals/site-settings', { token: adminToken, body: { contacts: restored } })).status).toBe(200)
    }
  })

  it('создаёт ученика с приглашением, меняет пароль и не путает активность с блокировкой', async () => {
    const email = `${uid('skill-user')}@lms.test`
    const user = await create('users', {
      email, password: 'Content-Local-Test-1', firstName: 'Проверка', lastName: 'Скилла', role: 'student', isActive: true,
    })
    expect(emails.sent.filter((message) => message.to === email)).toHaveLength(1)
    const initial = await rest('POST', '/users/login', { body: { email, password: 'Content-Local-Test-1' } })
    expect(initial.status).toBe(200)
    const token = initial.json.token
    if (typeof token !== 'string') throw new Error('Нет токена ученика')
    const escalated = await rest('PATCH', `/users/${user.id}`, { token, body: { role: 'admin' } })
    expect(escalated.status).toBe(200)
    expect(escalated.json.doc).toMatchObject({ role: 'student' })

    await patch('users', user.id, { password: 'Content-Local-Test-2', bio: 'Профиль изменён', isActive: false })
    expect((await rest('POST', '/users/login', { body: { email, password: 'Content-Local-Test-1' } })).status).toBe(401)
    const signedIn = await rest('POST', '/users/login', { body: { email, password: 'Content-Local-Test-2' } })
    expect(signedIn.status).toBe(200)
    expect(signedIn.json.user).toMatchObject({ id: user.id, role: 'student', isActive: false, totalPoints: 0 })
    expect(signedIn.json.user).not.toHaveProperty('hash')
    expect(signedIn.json.user).not.toHaveProperty('salt')
    await patch('users', user.id, { role: 'admin' })
    expect((await rest('GET', `/users/${user.id}`, { token: adminToken })).json.role).toBe('admin')
    await patch('users', user.id, { role: 'student', isActive: true })
  })

  it('создаёт задачу вне каталога и проверяет эталон в изоляте без выдачи скрытых данных', async () => {
    const topic = await create('trainer-topics', { title: `Тема ${uid('trainer')}`, isPublished: true })
    const task = await create('trainer-tasks', {
      title: `Сумма ${uid('trainer')}`, topic: topic.id, isPublished: true,
      descriptionMd: 'Верните сумму двух чисел.', checkMode: 'unit', languages: ['js'], entryName: 'sum',
      starterCode: 'function sum(a, b) { return 0 }', solutionCode: 'function sum(a, b) { return a + b }',
      testCases: [
        { name: 'открытый', argsCode: '2, 3', expectedCode: '5', compare: 'deep', hidden: false },
        { name: 'скрытый', argsCode: '-5, 2', expectedCode: '-3', compare: 'deep', hidden: true },
      ],
    })
    const saved = await payload.findByID({ collection: 'trainer-tasks', id: task.id, depth: 0 })
    expect(saved.solutionCode).toBeTruthy()
    if (!saved.solutionCode) throw new Error('Нет эталона')
    expect((await runSolution(saved, 'js', saved.solutionCode)).status).toBe('passed')
    expect((await runSolution(saved, 'js', saved.starterCode)).status).not.toBe('passed')
    const learner = await rest('GET', `/trainer-tasks/${task.id}`, { token: studentToken })
    expect(learner.status).toBe(200)
    expect(learner.json).not.toHaveProperty('solutionCode')
    expect(learner.json.testCases).toContainEqual(expect.objectContaining({ hidden: true }))
    const cases = learner.json.testCases
    if (!Array.isArray(cases)) throw new Error('Нет тестов задачи')
    for (const test of cases.filter((item: { hidden?: boolean }) => item.hidden)) {
      expect(test).not.toHaveProperty('argsCode')
      expect(test).not.toHaveProperty('expectedCode')
    }
    expect((await rest('GET', `/user-trainer-progress?where[task][equals]=${task.id}`, { token: studentToken })).json.totalDocs).toBe(0)
  })
})

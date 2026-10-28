import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { GET as analyticsGET } from '@/app/api/manage/student-analytics/route'
import { GET as accessGET, PUT as accessPUT } from '@/app/api/manage/learning-access/route'
import { POST as metadataPOST } from '@/app/api/manage/trainer/metadata/route'
import { GET as settingsGET, PATCH as settingsPATCH } from '@/app/api/push/settings/route'
import { POST as unsubscribePOST } from '@/app/api/email/unsubscribe/route'
import { emailBroadcastConsent } from '@/server/broadcasts/consent'
import { createUnsubscribeToken } from '@/server/broadcasts/unsubscribe-token'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, uid, type CourseTree, type TestUser } from '../helpers/payload'

/**
 * Ветки собственных маршрутов, которые не покрывают основные наборы: поиск
 * учеников в управлении, ответы на испорченный ввод и сбои базы посреди запроса.
 */
let payload: Payload
let admin: TestUser
let adminToken: string
let student: TestUser
let studentToken: string
let tree: CourseTree
const marker = uid('needle').replaceAll('-', '')

const get = (path: string, token: string | null = adminToken, headers: Record<string, string> = {}) =>
  new Request(`http://lms.test/api/${path}`, { headers: { ...(token ? { Authorization: `JWT ${token}` } : {}), ...headers } })
const send = (path: string, method: string, body: string, token: string | null = adminToken, headers: Record<string, string> = {}) =>
  new Request(`http://lms.test/api/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `JWT ${token}` } : {}), ...headers }, body })

/** Подменяет чтение одной коллекции ошибкой базы, остальные запросы идут в настоящий PostgreSQL. */
function failFind(collection: string, message = 'connection terminated unexpectedly') {
  const find = payload.find.bind(payload)
  return vi.spyOn(payload, 'find').mockImplementation(((args: Parameters<Payload['find']>[0]) => args.collection === collection
    ? Promise.reject(new Error(message))
    : find(args)) as Payload['find'])
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload, { firstName: `Админ${marker}` })
  adminToken = await login(payload, admin)
  student = await createStudent(payload, { firstName: `Ученик${marker}`, lastName: 'Поиска' })
  studentToken = await login(payload, student)
  tree = await createCourseTree(payload, { lessons: 1 })
})
afterEach(() => { vi.restoreAllMocks() })
afterAll(async () => {
  for (const user of [admin, student]) if (user) await payload.delete({ collection: 'users', id: user.id })
})

describe('GET /api/manage/student-analytics — список учеников и ошибки', () => {
  it('администратор ищет учеников по имени и получает только безопасные поля', async () => {
    const inactive = await createStudent(payload, { firstName: `Ученик${marker}`, lastName: 'Отключённый', isActive: false })
    const response = await analyticsGET(get(`manage/student-analytics?kind=students&search=${marker}`))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await response.json() as { docs: Record<string, unknown>[]; page: number; hasNextPage: boolean }
    expect(body.page).toBe(1)
    expect(body.hasNextPage).toBe(false)
    expect(body.docs).toEqual(expect.arrayContaining([
      { id: student.id, title: `Ученик${marker} Поиска`, email: student.email, isActive: true, role: 'student' },
      { id: inactive.id, title: `Ученик${marker} Отключённый`, email: inactive.email, isActive: false, role: 'student' },
      expect.objectContaining({ id: admin.id, role: 'admin' }),
    ]))
    expect(JSON.stringify(body)).not.toMatch(/hash|salt|sessions|password/)
    const empty = await (await analyticsGET(get(`manage/student-analytics?kind=students&search=${marker}&page=2`))).json() as { docs: unknown[] }
    expect(empty.docs).toEqual([])
  })

  it.each([
    ['слишком длинный поиск', `kind=students&search=${'a'.repeat(101)}`, 'Поиск слишком длинный'],
    ['страница ноль', 'kind=students&page=0', 'Некорректный номер'],
    ['страница не число', 'kind=students&page=abc', 'Некорректный номер'],
    ['без ученика', '', 'Некорректный номер'],
    ['ученик за пределом номеров', 'user=1000001', 'Некорректный номер'],
  ])('%s — 400 с понятным текстом', async (_, query, error) => {
    const response = await analyticsGET(get(`manage/student-analytics?${query}`))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error })
  })

  it('гость, ученик и испорченный заголовок авторизации с рабочей cookie не получают список', async () => {
    expect((await analyticsGET(get('manage/student-analytics?kind=students', null))).status).toBe(401)
    expect((await analyticsGET(get('manage/student-analytics?kind=students', studentToken))).status).toBe(403)
    const cookieFallback = new Request('http://lms.test/api/manage/student-analytics?kind=students', { headers: { Authorization: 'Basic YWRtaW46YWRtaW4=', Cookie: `payload-token=${adminToken}` } })
    expect((await analyticsGET(cookieFallback)).status).toBe(401)
  })

  it('несуществующий ученик — 404 без подробностей', async () => {
    const response = await analyticsGET(get('manage/student-analytics?user=999999'))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Ученик не найден' })
  })

  it('сбой базы — 500 с общим текстом без внутренних деталей', async () => {
    failFind('student-session-telemetry', 'relation "student_session_telemetry" secret detail')
    const response = await analyticsGET(get(`manage/student-analytics?user=${student.id}`))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Не удалось загрузить аналитику' })
  })
})

describe('GET/PUT /api/manage/learning-access — поиск и испорченный ввод', () => {
  it('поиск учеников не показывает администраторов и подписывает ученика его email', async () => {
    const response = await accessGET(get(`manage/learning-access?kind=students&search=${marker}`))
    expect(response.status).toBe(200)
    const body = await response.json() as { docs: { id: number; title: string }[]; page: number; hasNextPage: boolean }
    expect(body.docs).toContainEqual({ id: student.id, title: `Ученик${marker} Поиска (${student.email})` })
    expect(body.docs.some((doc) => doc.id === admin.id)).toBe(false)
    expect(body).toMatchObject({ page: 1, hasNextPage: false })
  })

  it('поиск узлов роадмапа идёт по подписи узла и фильтруется по роадмапу', async () => {
    const label = `Узел ${marker}`
    const node = await payload.create({ collection: 'roadmap-nodes', data: { nodeId: uid('node'), label, nodeType: 'topic', roadmap: tree.roadmap.id, positionX: 0, positionY: 0 } })
    const found = await (await accessGET(get(`manage/learning-access?kind=targets&type=roadmap-nodes&search=${encodeURIComponent(label)}&parent=${tree.roadmap.id}`))).json() as { docs: { id: number; title: string }[] }
    expect(found.docs).toEqual([{ id: node.id, title: label }])
    const otherRoadmap = await (await accessGET(get(`manage/learning-access?kind=targets&type=roadmap-nodes&search=${encodeURIComponent(label)}&parent=${tree.roadmap.id + 100000}`))).json() as { docs: unknown[] }
    expect(otherRoadmap.docs).toEqual([])
  })

  it.each([
    ['слишком длинный поиск', `kind=students&search=${'я'.repeat(101)}`, 400],
    ['неизвестный тип материала', 'kind=targets&type=users', 400],
    ['родитель у гайда', 'kind=targets&type=guides&parent=1', 400],
    ['неверная страница', 'kind=students&page=10001', 400],
  ])('%s — %s', async (_, query, status) => {
    expect((await accessGET(get(`manage/learning-access?${query}`))).status).toBe(status)
  })

  it('испорченный JSON назначений — 400 и ничего не меняется', async () => {
    const before = await payload.count({ collection: 'learning-access-grants', where: { user: { equals: student.id } } })
    const response = await accessPUT(send('manage/learning-access', 'PUT', '{"userId":'))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Не удалось прочитать назначения' })
    expect((await payload.count({ collection: 'learning-access-grants', where: { user: { equals: student.id } } })).totalDocs).toBe(before.totalDocs)
  })

  it('назначения администратора недоступны: только ученикам', async () => {
    const response = await accessGET(get(`manage/learning-access?user=${admin.id}`))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Назначения доступны для аккаунтов учеников' })
  })
})

describe('POST /api/manage/trainer/metadata — ввод и откат', () => {
  const request = (body: string) => send('manage/trainer/metadata', 'POST', body, adminToken, { Origin: 'http://lms.test' })

  it('испорченный JSON — 400, слишком большой запрос — 413', async () => {
    const broken = await metadataPOST(request('{"dryRun":'))
    expect(broken.status).toBe(400)
    expect(await broken.json()).toEqual({ error: 'Невалидный JSON' })
    const huge = await metadataPOST(request(JSON.stringify({ dryRun: true, pad: 'x'.repeat(300 * 1024) })))
    expect(huge.status).toBe(413)
  })

  it('сбой базы во время применения — 500 «Изменения отменены», данные задач не меняются', async () => {
    failFind('trainer-tasks')
    const response = await metadataPOST(request(JSON.stringify({ dryRun: false })))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Не удалось обновить метаданные. Изменения отменены.' })
  })
})

describe('GET/PATCH /api/push/settings — проверка полей и сохранение', () => {
  const patch = (body: unknown, token: string | null = studentToken, headers: Record<string, string> = {}) =>
    settingsPATCH(send('push/settings', 'PATCH', JSON.stringify(body), token, headers))

  it('ученик меняет часовой пояс, час напоминаний и переключатели — ответ и база совпадают', async () => {
    const response = await patch({ timezone: 'Asia/Yekaterinburg', reminderHour: 9, remindersEnabled: false, emailBroadcastsEnabled: false })
    expect(response.status).toBe(200)
    expect((await response.json()).preferences).toMatchObject({ timezone: 'Asia/Yekaterinburg', reminderHour: 9, remindersEnabled: false, emailBroadcastsEnabled: false })
    const stored = (await payload.find({ collection: 'notification-preferences', where: { user: { equals: student.id } }, depth: 0 })).docs[0]
    expect(stored).toMatchObject({ timezone: 'Asia/Yekaterinburg', reminderHour: 9, remindersEnabled: false, emailBroadcastsEnabled: false })
    const read = await settingsGET(get('push/settings', studentToken))
    expect((await read.json()).preferences).toMatchObject({ timezone: 'Asia/Yekaterinburg', reminderHour: 9 })
  })

  it.each([
    ['переключатель строкой', { pushEnabled: 'yes' }, 'Некорректные настройки'],
    ['неизвестный часовой пояс', { timezone: 'Mars/Olympus' }, 'Выберите часовой пояс'],
    ['час раньше 08:00', { reminderHour: 7 }, 'Время напоминания - с 08:00 до 21:00'],
    ['час позже 21:00', { reminderHour: 22 }, 'Время напоминания - с 08:00 до 21:00'],
    ['дробный час', { reminderHour: 8.5 }, 'Время напоминания - с 08:00 до 21:00'],
    ['тело — массив', [], 'Некорректные данные'],
  ])('%s — 400, настройки не меняются', async (_, body, error) => {
    const before = (await payload.find({ collection: 'notification-preferences', where: { user: { equals: student.id } }, depth: 0 })).docs[0]
    const response = await patch(body)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error })
    const after = (await payload.find({ collection: 'notification-preferences', where: { user: { equals: student.id } }, depth: 0 })).docs[0]
    expect(after?.updatedAt).toBe(before?.updatedAt)
  })

  it('гость — 401, cookie с чужого сайта отклоняется и ничего не меняет', async () => {
    expect((await patch({ reminderHour: 10 }, null)).status).toBe(401)
    const forged = new Request('http://lms.test/api/push/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: `payload-token=${studentToken}`, Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' }, body: JSON.stringify({ reminderHour: 10 }) })
    // Payload сам не принимает cookie с чужим Origin (401), маршрут — подделку с нашей cookie (403).
    expect([401, 403]).toContain((await settingsPATCH(forged)).status)
    const sameSiteForged = new Request('http://lms.test/api/push/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `JWT ${studentToken}`, Origin: 'http://lms.test', 'Sec-Fetch-Site': 'same-site' }, body: JSON.stringify({ reminderHour: 10 }) })
    expect((await settingsPATCH(sameSiteForged)).status).toBe(403)
    const stored = (await payload.find({ collection: 'notification-preferences', where: { user: { equals: student.id } }, depth: 0 })).docs[0]
    expect(stored?.reminderHour).not.toBe(10)
  })

  it('сбой базы — 500 с общим текстом', async () => {
    failFind('notification-preferences')
    const response = await settingsGET(get('push/settings', studentToken))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Не удалось сохранить уведомления. Попробуйте позже' })
  })
})

describe('POST /api/email/unsubscribe — форматы формы и сбои', () => {
  it('multipart-форма отписывает; файл вместо поля action не превращается в повторную подписку', async () => {
    const reader = await createStudent(payload)
    try {
      const form = new FormData()
      form.set('token', createUnsubscribeToken(reader.id))
      form.set('action', new Blob(['resubscribe']), 'action.txt')
      const response = await unsubscribePOST(new Request('http://lms.test/api/email/unsubscribe', { method: 'POST', body: form }))
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toContain('done=unsubscribed')
      expect(await emailBroadcastConsent(payload, reader.id)).toBe(false)
    } finally { await payload.delete({ collection: 'users', id: reader.id }) }
  })

  it('тело больше 4 КБ — 413 без изменений', async () => {
    const reader = await createStudent(payload)
    try {
      const body = new URLSearchParams({ token: createUnsubscribeToken(reader.id), pad: 'x'.repeat(5000) }).toString()
      const response = await unsubscribePOST(new Request('http://lms.test/api/email/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }))
      expect(response.status).toBe(413)
      expect(await emailBroadcastConsent(payload, reader.id)).toBe(true)
    } finally { await payload.delete({ collection: 'users', id: reader.id }) }
  })

  it('ссылка удалённого аккаунта: кнопка почтового клиента — 400, страница — error=invalid', async () => {
    const gone = await createStudent(payload)
    const token = createUnsubscribeToken(gone.id)
    await payload.delete({ collection: 'users', id: gone.id })
    const oneClick = await unsubscribePOST(new Request(`http://lms.test/api/email/unsubscribe?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }))
    expect(oneClick.status).toBe(400)
    const page = await unsubscribePOST(new Request('http://lms.test/api/email/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString() }))
    expect(page.status).toBe(303)
    expect(page.headers.get('location')).toContain('error=invalid')
  })

  it('сбой базы: кнопка почтового клиента — 500, страница — error=failed; согласие не меняется', async () => {
    const reader = await createStudent(payload)
    try {
      const token = createUnsubscribeToken(reader.id)
      failFind('users')
      const oneClick = await unsubscribePOST(new Request(`http://lms.test/api/email/unsubscribe?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }))
      expect(oneClick.status).toBe(500)
      expect(await oneClick.text()).toBe('Не удалось отписаться. Попробуйте позже')
      const page = await unsubscribePOST(new Request('http://lms.test/api/email/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString() }))
      expect(page.headers.get('location')).toContain('error=failed')
      vi.restoreAllMocks()
      expect(await emailBroadcastConsent(payload, reader.id)).toBe(true)
    } finally {
      vi.restoreAllMocks()
      await payload.delete({ collection: 'users', id: reader.id })
    }
  })
})

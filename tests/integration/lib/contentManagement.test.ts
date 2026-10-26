import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Forbidden, type Payload } from 'payload'
import { headers } from 'next/headers'

import { contentId, managedDocument, managedList, relationId, requireContentAdmin } from '@/lib/content-management/pages'
import { POST } from '@/app/api/manage/content/[collection]/route'
import { PATCH } from '@/app/api/manage/content/[collection]/[id]/route'
import type { Course } from '@/payload-types'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, uid, type CourseTree } from '../helpers/payload'

// Заголовки запроса страницы — граница Next: в тестах их отдаёт подмена, остальное настоящее.
vi.mock('next/headers', () => ({ headers: vi.fn() }))

let payload: Payload
let adminToken: string
let studentToken: string
let tree: CourseTree

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404'
const asRequest = (token?: string) => vi.mocked(headers).mockResolvedValue(new Headers(token ? { Authorization: `JWT ${token}` } : {}) as never)
const digest = async (promise: Promise<unknown>) => (await promise.then(() => null, (error: { digest?: string }) => error)) as { digest?: string } | null
const thrownDigest = (action: () => unknown) => { try { action(); return null } catch (error) { return (error as { digest?: string }).digest } }

async function write(collection: string, body: unknown, options: { id?: number; headers?: Record<string, string> } = {}) {
  const request = new Request(`http://lms.test/api/manage/content/${collection}`, {
    method: options.id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${adminToken}`, ...options.headers },
    body: JSON.stringify(body),
  })
  const response = options.id
    ? await PATCH(request, { params: Promise.resolve({ collection, id: String(options.id) }) })
    : await POST(request, { params: Promise.resolve({ collection }) })
  return { status: response.status, body: await response.json() as { doc: Course; error?: string } }
}

beforeAll(async () => {
  payload = await getTestPayload()
  adminToken = await login(payload, await createAdmin(payload))
  studentToken = await login(payload, await createStudent(payload))
  tree = await createCourseTree(payload, { lessons: 2 })
})
afterEach(() => { vi.restoreAllMocks() })

describe('страницы управления контентом /manage', () => {
  it('гость уходит на вход с возвратом в /manage, ученик получает 404, администратор — Payload и себя', async () => {
    asRequest()
    expect(await digest(requireContentAdmin())).toEqual(expect.objectContaining({ digest: 'NEXT_REDIRECT;replace;/login?redirect=%2Fmanage;307;' }))
    asRequest(studentToken)
    expect(await digest(requireContentAdmin())).toEqual(expect.objectContaining({ digest: NOT_FOUND }))
    asRequest(adminToken)
    const { user, payload: instance } = await requireContentAdmin()
    expect(user.role).toBe('admin')
    expect(instance).toBe(payload)
  })

  it('номер материала из адреса: только положительное целое без ведущих нулей', () => {
    expect(contentId('42')).toBe(42)
    for (const value of ['0', '042', '-1', '1.5', 'abc', '', '9007199254740993']) expect(thrownDigest(() => contentId(value))).toBe(NOT_FOUND)
  })

  it('связь читается и как номер, и как документ', () => {
    expect(relationId(5)).toBe(5)
    expect(relationId({ id: 7 })).toBe(7)
    expect(relationId(null)).toBeNull()
    expect(relationId(undefined)).toBeNull()
  })

  it('документ открывается администратору; несуществующий — 404 страницы, ученику — тоже 404', async () => {
    asRequest(adminToken)
    expect((await managedDocument('courses', String(tree.course.id))).id).toBe(tree.course.id)
    expect(await digest(managedDocument('courses', '2000000000'))).toEqual(expect.objectContaining({ digest: NOT_FOUND }))
    asRequest(studentToken)
    expect(await digest(managedDocument('courses', String(tree.course.id)))).toEqual(expect.objectContaining({ digest: NOT_FOUND }))
  })

  it('сбой базы не превращается в «не найдено»', async () => {
    asRequest(adminToken)
    const findByID = payload.findByID.bind(payload)
    vi.spyOn(payload, 'findByID').mockImplementation(((args: Parameters<Payload['findByID']>[0]) => args.collection === 'courses'
      ? Promise.reject(new Error('connection terminated'))
      : findByID(args)) as Payload['findByID'])
    await expect(managedDocument('courses', String(tree.course.id))).rejects.toThrow('connection terminated')
  })

  it('список собирает все страницы и сортирует по порядку, затем по номеру', async () => {
    asRequest(adminToken)
    const own = await createCourseTree(payload, { lessons: 0 })
    const sections = []
    for (const order of [3, 1, 2, 1]) {
      const key = uid('list')
      sections.push(await payload.create({ collection: 'sections', data: { title: key, slug: key, course: own.course.id, order, isPublished: true } }))
    }
    const listed = await managedList('sections', { course: { equals: own.course.id } })
    const expected = [own.section, ...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id).map((doc) => doc.id)
    expect(listed.map((doc) => doc.id)).toEqual(expected)
  })
})

describe('запись контента: ветки проверок и ошибок', () => {
  it('без Content-Type JSON — 400 даже с токеном', async () => {
    const result = await write('lessons', { title: 'Урок', course: tree.course.id }, { headers: { 'Content-Type': 'text/plain' } })
    expect(result).toEqual({ status: 400, body: { error: 'Для сохранения требуется Content-Type: application/json' } })
  })

  it('Idempotency-Key не в формате UUIDv4 — 400 и ничего не создаётся', async () => {
    const title = uid('Курс')
    const result = await write('courses', { title, roadmap: tree.roadmap.id }, { headers: { 'Idempotency-Key': 'not-a-uuid' } })
    expect(result).toEqual({ status: 400, body: { error: 'Idempotency-Key должен быть UUIDv4' } })
    expect((await payload.count({ collection: 'courses', where: { title: { equals: title } } })).totalDocs).toBe(0)
  })

  it('пререквизиты: свой курс, повтор и несуществующий отклоняются, существующие сохраняются', async () => {
    const created = await write('courses', { title: uid('Курс'), roadmap: tree.roadmap.id, prerequisites: [tree.course.id] })
    expect(created.status).toBe(201)
    expect(created.body.doc.prerequisites).toEqual([tree.course.id])
    const id = created.body.doc.id
    const current = () => payload.findByID({ collection: 'courses', id, depth: 0 })
    const patch = async (prerequisites: number[]) => write('courses', { prerequisites, expectedUpdatedAt: (await current()).updatedAt }, { id })
    expect(await patch([id])).toEqual({ status: 400, body: { error: 'Курс не может быть своим пререквизитом' } })
    expect(await patch([tree.course.id, tree.course.id])).toEqual({ status: 400, body: { error: 'Курсы-пререквизиты не должны повторяться' } })
    expect(await patch([2_000_000_000])).toEqual({ status: 404, body: { error: 'Один из курсов-пререквизитов не найден' } })
    expect((await current()).prerequisites).toEqual([tree.course.id])
    expect((await patch([])).status).toBe(200)
    expect((await current()).prerequisites ?? []).toEqual([])
  })

  it('занятый адрес — 400 с подсказкой про slug, материал не меняется', async () => {
    const [first, second] = tree.lessons
    const result = await write('lessons', { slug: second.slug, expectedUpdatedAt: (await payload.findByID({ collection: 'lessons', id: first.id })).updatedAt }, { id: first.id })
    expect(result).toEqual({ status: 400, body: { error: 'Не удалось сохранить данные. Проверьте поля и уникальность адреса (slug)' } })
    expect((await payload.findByID({ collection: 'lessons', id: first.id })).slug).toBe(first.slug)
  })

  it('запрет Payload на связанный материал — 403 без подробностей', async () => {
    const findByID = payload.findByID.bind(payload)
    vi.spyOn(payload, 'findByID').mockImplementation(((args: Parameters<Payload['findByID']>[0]) => args.collection === 'roadmaps'
      ? Promise.reject(new Forbidden())
      : findByID(args)) as Payload['findByID'])
    expect(await write('courses', { title: uid('Курс'), roadmap: tree.roadmap.id })).toEqual({ status: 403, body: { error: 'Недостаточно прав для изменения контента' } })
  })

  it('сбой базы — 500, транзакция откатывается, в лог уходит только тип ошибки без тела запроса', async () => {
    const title = uid('Курс secret-token')
    const errors = vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined)
    const findByID = payload.findByID.bind(payload)
    vi.spyOn(payload, 'findByID').mockImplementation(((args: Parameters<Payload['findByID']>[0]) => args.collection === 'roadmaps'
      ? Promise.reject(new RangeError('pool exhausted'))
      : findByID(args)) as Payload['findByID'])
    const result = await write('courses', { title, roadmap: tree.roadmap.id })
    expect(result).toEqual({ status: 500, body: { error: 'Не удалось сохранить материал. Повторите попытку' } })
    expect(errors).toHaveBeenCalledWith({ msg: 'Content management write failed', error: 'RangeError' })
    expect(JSON.stringify(errors.mock.calls)).not.toContain('secret-token')
    vi.restoreAllMocks()
    expect((await payload.count({ collection: 'courses', where: { title: { equals: title } } })).totalDocs).toBe(0)
  })
})

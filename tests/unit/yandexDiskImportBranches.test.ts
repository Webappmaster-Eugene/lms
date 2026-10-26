import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { YandexDiskItem } from '@/lib/yandex-disk'

/**
 * Ветки импорта курса с Яндекс Диска, которых нет в основном наборе: старая
 * плоская нумерация «X.Y - Название», ссылка с битым адресом в текстовом
 * материале и исчерпанные варианты slug. Payload и Диск — границы, подменены.
 */
const auth = vi.fn()
const find = vi.fn()
const findByID = vi.fn()
const create = vi.fn()
const update = vi.fn()
const fetchFolderRecursive = vi.fn()
const fetchPublicTextFile = vi.fn()
const fetchVideoDuration = vi.fn()

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ auth, find, findByID, create, update })) }))
vi.mock('@/lib/yandex-disk', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/yandex-disk')>(), fetchFolderRecursive, fetchPublicTextFile, fetchVideoDuration,
}))

const { POST } = await import('@/app/api/yandex-disk/import/route')

const FOLDER = 'https://disk.yandex.ru/d/XP2GssUqm7HIEg'
const file = (path: string): YandexDiskItem => ({ name: path.split('/').filter(Boolean).pop() ?? '', type: 'file', path, size: 10 })
const dir = (path: string): YandexDiskItem => ({ name: path.split('/').filter(Boolean).pop() ?? '', type: 'dir', path })
const post = () => new Request('https://learn.mentorcareer.ru/api/yandex-disk/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicUrl: FOLDER, courseId: '3' }) })
const created = (collection: string) => create.mock.calls.map(([args]) => args as { collection: string; data: Record<string, unknown> }).filter((call) => call.collection === collection)

let nextId = 100
beforeEach(() => {
  vi.clearAllMocks()
  nextId = 100
  auth.mockResolvedValue({ user: { id: 7, role: 'admin' } })
  findByID.mockResolvedValue({ id: 3, title: 'Курс по стартапу', slug: 'startup' })
  find.mockResolvedValue({ docs: [], totalDocs: 0 })
  create.mockImplementation(async () => ({ id: nextId++ }))
  update.mockResolvedValue({})
  fetchPublicTextFile.mockResolvedValue(null)
  fetchVideoDuration.mockResolvedValue(null)
})

describe('старая плоская нумерация «X.Y - Название»', () => {
  it('все видео в корне по формату — разделы по первому числу, уроки по второму, заголовки из имён', async () => {
    fetchFolderRecursive.mockResolvedValue([
      file('/2.1 - Итоги.mp4'), file('/1.2 – Установка.mp4'), file('/1.1 - Введение.mp4'),
    ])
    const response = await POST(post())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ sectionsCreated: 2, lessonsCreated: 3 })
    const lessons = created('lessons').map((call) => call.data)
    expect(lessons.map((lesson) => [lesson.title, lesson.order])).toEqual([['Введение', 1], ['Установка', 2], ['Итоги', 1]])
    expect((lessons[0].content as Record<string, unknown>[])[0]).toMatchObject({
      blockType: 'video', title: 'Введение', videoUrl: `${FOLDER}/${encodeURIComponent('1.1 - Введение.mp4')}`,
    })
    expect(created('sections').map((call) => call.data.order)).toEqual([1, 2])
  })

  it('одно видео не по формату — разбор по папкам, а не по номерам', async () => {
    fetchFolderRecursive.mockResolvedValue([
      file('/1.1 - Введение.mp4'), file('/Бонус.mp4'),
    ])
    const response = await POST(post())
    expect(response.status).toBe(200)
    // Плоский разбор потерял бы «Бонус»; разбор по папкам берёт оба видео в один раздел курса.
    expect(created('lessons').map((call) => call.data.title)).toEqual(['Введение', 'Бонус'])
    expect(created('sections').map((call) => call.data.title)).toEqual(['Курс по стартапу'])
  })
})

describe('ссылки из текстового материала', () => {
  it('битый адрес без подписи: заголовком становится название материала, платформа — прочее', async () => {
    fetchFolderRecursive.mockResolvedValue([dir('/Блок 1'), file('/Блок 1/1.mp4'), file('/Блок 1/1.ссылки.txt')])
    fetchPublicTextFile.mockResolvedValue('http://[broken-link\n')
    const response = await POST(post())
    expect(response.status).toBe(200)
    const content = created('lessons')[0].data.content as Record<string, unknown>[]
    expect(content.find((block) => block.blockType === 'link')).toEqual({ blockType: 'link', title: '1.ссылки.txt', url: 'http://[broken-link', platform: 'other' })
  })
})

describe('исчерпанные варианты slug', () => {
  it('50 занятых вариантов — 500, понятная ошибка и статус failed в журнале импорта', async () => {
    fetchFolderRecursive.mockResolvedValue([dir('/Блок 1'), file('/Блок 1/1.mp4')])
    create.mockImplementation(async ({ collection }: { collection: string }) => ({ id: collection === 'yandex-disk-imports' ? 55 : nextId++ }))
    find.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => 'slug' in where ? { docs: [{ id: 1 }], totalDocs: 1 } : { docs: [], totalDocs: 0 })
    const response = await POST(post())
    expect(response.status).toBe(500)
    const { error } = await response.json() as { error: string }
    expect(error).toMatch(/^Не удалось подобрать уникальный slug/)
    expect(find.mock.calls.filter(([args]) => 'slug' in (args as { where: object }).where)).toHaveLength(50)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ collection: 'yandex-disk-imports', id: 55, data: { status: 'failed', errorLog: error } }))
    expect(created('lessons')).toEqual([])
  })
})

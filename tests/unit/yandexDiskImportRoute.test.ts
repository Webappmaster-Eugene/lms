import { describe, it, expect, beforeEach, vi } from 'vitest'

import type { YandexDiskItem } from '@/lib/yandex-disk'

const auth = vi.fn()
const find = vi.fn()
const findByID = vi.fn()
const create = vi.fn()
const update = vi.fn()
const fetchFolderRecursive = vi.fn()
const fetchPublicTextFile = vi.fn()

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ auth, find, findByID, create, update })),
}))
vi.mock('@/lib/yandex-disk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/yandex-disk')>()
  return { ...actual, fetchFolderRecursive, fetchPublicTextFile }
})

const { POST } = await import('@/app/api/yandex-disk/import/route')

const FOLDER = 'https://disk.yandex.ru/d/XP2GssUqm7HIEg'
const ADMIN = { id: 7, role: 'admin' }
const COURSE = { id: 3, title: 'Курс по стартапу', slug: 'startup' }

function dir(path: string): YandexDiskItem {
  return { name: path.split('/').filter(Boolean).pop() ?? '', type: 'dir', path }
}

function file(path: string): YandexDiskItem {
  return { name: path.split('/').filter(Boolean).pop() ?? '', type: 'file', path, size: 10 }
}

const LISTING: YandexDiskItem[] = [
  dir('/Блок 1 – Идеи'),
  file('/Блок 1 – Идеи/1.mp4'),
  file('/Блок 1 – Идеи/2.mp4'),
  file('/Блок 1 – Идеи/2.ссылки.txt'),
]

function post(body: unknown, raw?: string): Request {
  return new Request('https://lms.nadtocheev.ru/api/yandex-disk/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  })
}

/** Запросы существующих секций/уроков и проверки slug по умолчанию пустые. */
function emptyFind() {
  return { docs: [], totalDocs: 0 }
}

function createdDocs() {
  return create.mock.calls.map(([args]) => args as { collection: string; data: Record<string, unknown> })
}

function lessonsCreated() {
  return createdDocs().filter((call) => call.collection === 'lessons')
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ user: ADMIN })
  findByID.mockResolvedValue(COURSE)
  find.mockResolvedValue(emptyFind())
  create.mockImplementation(async ({ collection }: { collection: string }) => ({
    id: collection === 'sections' ? 100 : 200,
  }))
  update.mockResolvedValue({})
  fetchFolderRecursive.mockResolvedValue(LISTING)
  fetchPublicTextFile.mockResolvedValue(null)
})

describe('доступ и валидация', () => {
  it('не админ — 403 и ничего не создаётся', async () => {
    auth.mockResolvedValue({ user: { id: 1, role: 'student' } })

    const response = await POST(post({ publicUrl: FOLDER, courseId: '3' }))

    expect(response.status).toBe(403)
    expect(create).not.toHaveBeenCalled()
  })

  it('битый JSON — 400', async () => {
    const response = await POST(post(null, '{не json'))

    expect(response.status).toBe(400)
  })

  it.each([
    ['без ссылки', { courseId: '3' }],
    ['без курса', { publicUrl: FOLDER }],
    ['курс не число', { publicUrl: FOLDER, courseId: 'abc' }],
  ])('%s — 400', async (_label, body) => {
    const response = await POST(post(body))

    expect(response.status).toBe(400)
    expect(fetchFolderRecursive).not.toHaveBeenCalled()
  })

  it('ссылка не на Яндекс.Диск — 400 до похода в сеть', async () => {
    const response = await POST(post({ publicUrl: 'https://example.com/d/abc', courseId: '3' }))

    expect(response.status).toBe(400)
    expect(fetchFolderRecursive).not.toHaveBeenCalled()
  })

  it('несуществующий курс — 404', async () => {
    findByID.mockRejectedValue(new Error('not found'))

    const response = await POST(post({ publicUrl: FOLDER, courseId: '999' }))

    expect(response.status).toBe(404)
  })
})

describe('создание структуры', () => {
  it('создаёт секцию и уроки, отчитываясь о количестве', async () => {
    const response = await POST(post({ publicUrl: FOLDER, courseId: '3' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      sectionsCreated: 1,
      lessonsCreated: 2,
      courseName: COURSE.title,
    })
  })

  it('видео получает ссылку на конкретный файл, а не на папку', async () => {
    await POST(post({ publicUrl: FOLDER, courseId: '3' }))

    const [firstLesson] = lessonsCreated()
    const content = firstLesson.data.content as Array<Record<string, unknown>>

    expect(content[0]).toMatchObject({
      blockType: 'video',
      displayMode: 'embed',
      videoUrl: `${FOLDER}/${encodeURIComponent('Блок 1 – Идеи')}/1.mp4`,
    })
  })

  it('уроки и секции публикуются и нумеруются по порядку', async () => {
    await POST(post({ publicUrl: FOLDER, courseId: '3' }))

    expect(createdDocs().find((c) => c.collection === 'sections')?.data).toMatchObject({
      order: 1,
      isPublished: true,
      course: 3,
    })
    expect(lessonsCreated().map((c) => c.data.order)).toEqual([1, 2])
    expect(lessonsCreated().every((c) => c.data.isPublished === true)).toBe(true)
  })

  it('slug детерминированный и включает курс с секцией', async () => {
    await POST(post({ publicUrl: FOLDER, courseId: '3' }))

    expect(lessonsCreated()[0].data.slug).toBe('startup-blok-1-idei-urok-1')
  })

  it('занятый slug получает суффикс, а не падает', async () => {
    find.mockImplementation(async ({ collection, where }: { collection: string; where: Record<string, unknown> }) => {
      const slug = (where as { slug?: { equals: string } }).slug?.equals
      if (collection === 'lessons' && slug === 'startup-blok-1-idei-urok-1') {
        return { docs: [{ id: 1 }], totalDocs: 1 }
      }
      return emptyFind()
    })

    await POST(post({ publicUrl: FOLDER, courseId: '3' }))

    expect(lessonsCreated()[0].data.slug).toBe('startup-blok-1-idei-urok-1-2')
  })
})

describe('повторный импорт', () => {
  beforeEach(() => {
    find.mockImplementation(async ({ collection, where }: { collection: string; where: Record<string, unknown> }) => {
      const hasTitle = 'title' in where
      if (collection === 'sections' && hasTitle) return { docs: [{ id: 50 }], totalDocs: 1 }
      if (collection === 'lessons' && hasTitle) return { docs: [{ id: 60 }], totalDocs: 1 }
      return emptyFind()
    })
  })

  it('обновляет существующие секцию и уроки вместо создания копий', async () => {
    const response = await POST(post({ publicUrl: FOLDER, courseId: '3' }))

    expect(response.status).toBe(200)
    expect(createdDocs().filter((c) => c.collection !== 'yandex-disk-imports')).toHaveLength(0)
    expect(update.mock.calls.filter(([args]) => args.collection === 'lessons')).toHaveLength(2)
  })

  it('в отчёте обновления не выдаются за создание', async () => {
    const response = await POST(post({ publicUrl: FOLDER, courseId: '3' }))

    await expect(response.json()).resolves.toMatchObject({
      sectionsCreated: 0,
      sectionsUpdated: 1,
      lessonsCreated: 0,
      lessonsUpdated: 2,
    })
  })
})

describe('уроки, исчезнувшие из папки', () => {
  it('не удаляются, но попадают в предупреждения', async () => {
    find.mockImplementation(async ({ collection, where }: { collection: string; where: Record<string, unknown> }) => {
      // Запрос без title — это сверка курса на осиротевшие уроки.
      if (collection === 'lessons' && !('title' in where) && !('slug' in where)) {
        return { docs: [{ id: 999, title: 'Старый урок' }], totalDocs: 1 }
      }
      return emptyFind()
    })

    const response = await POST(post({ publicUrl: FOLDER, courseId: '3' }))
    const body = (await response.json()) as { errors: string[] }

    expect(body.errors.join('\n')).toContain('Старый урок')
    expect(update.mock.calls.some(([args]) => args.collection === 'lessons' && args.id === 999)).toBe(
      false,
    )
  })
})

describe('материалы', () => {
  it('ссылки из текстового файла разворачиваются в блоки урока', async () => {
    fetchPublicTextFile.mockResolvedValue(
      'Доска Miro — https://miro.com/app/board/123\nhttps://t.me/channel\n',
    )

    await POST(post({ publicUrl: FOLDER, courseId: '3' }))

    const content = lessonsCreated()[1].data.content as Array<Record<string, unknown>>

    expect(content.slice(1)).toEqual([
      { blockType: 'link', title: 'Доска Miro', url: 'https://miro.com/app/board/123', platform: 'other' },
      { blockType: 'link', title: 't.me', url: 'https://t.me/channel', platform: 'telegram' },
    ])
  })

  it('подпись берётся со строки выше, а нумерация списка подписью не считается', async () => {
    fetchPublicTextFile.mockResolvedValue(
      'Доска урока:\nhttps://miro.com/app/board/1\n1. https://semrush.com/\n',
    )

    await POST(post({ publicUrl: FOLDER, courseId: '3' }))

    const content = lessonsCreated()[1].data.content as Array<Record<string, unknown>>

    expect(content.slice(1).map((block) => block.title)).toEqual(['Доска урока', 'semrush.com'])
  })

  it('нечитаемый текстовый файл остаётся ссылкой на сам файл и даёт предупреждение', async () => {
    fetchPublicTextFile.mockRejectedValue(new Error('403'))

    const response = await POST(post({ publicUrl: FOLDER, courseId: '3' }))
    const body = (await response.json()) as { errors: string[] }
    const content = lessonsCreated()[1].data.content as Array<Record<string, unknown>>

    expect(content[1]).toMatchObject({
      blockType: 'link',
      url: `${FOLDER}/${encodeURIComponent('Блок 1 – Идеи')}/${encodeURIComponent('2.ссылки.txt')}`,
    })
    expect(body.errors.join('\n')).toContain('2.ссылки.txt')
  })

  it('повторяющаяся ссылка в уроке не дублируется', async () => {
    fetchPublicTextFile.mockResolvedValue('https://miro.com/b/1\nhttps://miro.com/b/1\n')

    await POST(post({ publicUrl: FOLDER, courseId: '3' }))

    const content = lessonsCreated()[1].data.content as Array<Record<string, unknown>>

    expect(content.filter((block) => block.blockType === 'link')).toHaveLength(1)
  })
})

describe('ошибки импорта', () => {
  it('папка без подходящих видео — 400 и статус failed в журнале', async () => {
    fetchFolderRecursive.mockResolvedValue([dir('/Пусто')])

    const response = await POST(post({ publicUrl: FOLDER, courseId: '3' }))

    expect(response.status).toBe(400)
    expect(
      update.mock.calls.some(
        ([args]) => args.collection === 'yandex-disk-imports' && args.data.status === 'failed',
      ),
    ).toBe(true)
  })

  it('сбой Яндекс.Диска — 500 и запись об ошибке', async () => {
    fetchFolderRecursive.mockRejectedValue(new Error('Папка не найдена'))

    const response = await POST(post({ publicUrl: FOLDER, courseId: '3' }))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({ error: 'Папка не найдена' })
    expect(
      update.mock.calls.some(
        ([args]) => args.collection === 'yandex-disk-imports' && args.data.status === 'failed',
      ),
    ).toBe(true)
  })
})

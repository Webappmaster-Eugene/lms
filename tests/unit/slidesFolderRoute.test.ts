import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.fn()
const logError = vi.fn()
const fetchPublicFolderContents = vi.fn()

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', async (importOriginal) => ({
  ...await importOriginal<typeof import('payload')>(),
  getPayload: vi.fn(async () => ({ auth, logger: { error: logError } })),
}))
vi.mock('@/lib/yandex-disk', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/yandex-disk')>(),
  fetchPublicFolderContents,
}))

const { POST } = await import('@/app/api/manage/slides-folder/route')
const FOLDER = 'https://disk.yandex.com/d/vElPjy8GncYsUg/guide'

const post = (body: unknown, raw?: string) => POST(new Request('https://learn.mentorcareer.ru/api/manage/slides-folder', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ?? JSON.stringify(body),
}))

beforeEach(() => {
  auth.mockReset()
  logError.mockReset()
  fetchPublicFolderContents.mockReset()
  auth.mockResolvedValue({ user: { id: 7, role: 'admin' } })
})

describe('POST /api/manage/slides-folder', () => {
  it('гость и ученик не читают папки Диска через платформу', async () => {
    auth.mockResolvedValueOnce({ user: null })
    expect((await post({ url: FOLDER })).status).toBe(401)
    auth.mockResolvedValueOnce({ user: { id: 3, role: 'student' } })
    expect((await post({ url: FOLDER })).status).toBe(403)
    expect(fetchPublicFolderContents).not.toHaveBeenCalled()
  })

  it('запрос с чужого сайта отклоняется до проверки сессии', async () => {
    const response = await POST(new Request('https://learn.mentorcareer.ru/api/manage/slides-folder', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, body: JSON.stringify({ url: FOLDER }),
    }))
    expect(response.status).toBe(403)
    expect(auth).not.toHaveBeenCalled()
  })

  it('администратор получает файлы папки по порядку показа', async () => {
    fetchPublicFolderContents.mockResolvedValue([
      { name: '2.png', type: 'file', path: '/guide/2.png' },
      { name: '1.png', type: 'file', path: '/guide/1.png' },
      { name: 'видео.mp4', type: 'file', path: '/guide/видео.mp4' },
    ])
    const response = await post({ url: FOLDER })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ files: [{ url: `${FOLDER}/1.png`, fileName: '1.png' }, { url: `${FOLDER}/2.png`, fileName: '2.png' }] })
  })

  it.each([
    ['битый JSON', undefined, '{', 400, 'Невалидный JSON'],
    ['нет ссылки', {}, undefined, 400, 'Укажите ссылку'],
    ['ссылка не строкой', { url: 5 }, undefined, 400, 'Укажите ссылку'],
    ['не Диск', { url: 'https://example.com/folder' }, undefined, 400, 'публичная ссылка Яндекс Диска'],
    ['огромное тело', { url: `${FOLDER}/${'x'.repeat(9000)}` }, undefined, 413, 'Слишком длинная'],
  ])('%s — отказ без чтения Диска', async (_label, body, raw, status, message) => {
    const response = await post(body, raw)
    expect(response.status).toBe(status)
    expect((await response.json() as { error: string }).error).toContain(message)
    expect(fetchPublicFolderContents).not.toHaveBeenCalled()
  })

  it('пустая папка возвращает объяснение, а не пустой список', async () => {
    fetchPublicFolderContents.mockResolvedValue([{ name: 'Вложенная', type: 'dir', path: '/guide/Вложенная' }])
    const response = await post({ url: FOLDER })
    expect(response.status).toBe(400)
    expect((await response.json() as { error: string }).error).toContain('нет картинок, PDF')
    expect(logError).not.toHaveBeenCalled()
  })
})

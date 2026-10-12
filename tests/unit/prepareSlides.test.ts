import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

import type { Lesson } from '@/payload-types'

const fetchPublicFolderContents = vi.fn()
const fetchPublicResourceMeta = vi.fn()
vi.mock('@/lib/yandex-disk', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/yandex-disk')>(),
  fetchPublicFolderContents,
  fetchPublicResourceMeta,
}))

const { prepareSlides } = await import('@/payload/hooks/prepareSlides')

type Content = NonNullable<Lesson['content']>
type Slides = Extract<Content[number], { blockType: 'slides' }>
const KEY = 'https://disk.yandex.com/d/vElPjy8GncYsUg'
const FOLDER = `${KEY}/guide`

const run = (content: Content, originalDoc?: Partial<Lesson>) => prepareSlides({
  data: { title: 'Урок', content }, originalDoc, operation: originalDoc ? 'update' : 'create',
  req: {} as PayloadRequest, collection: {} as never, context: {},
} as Parameters<typeof prepareSlides>[0])

const slidesOf = async (content: Content, originalDoc?: Partial<Lesson>): Promise<Slides> => {
  const result: Partial<Lesson> | undefined = await run(content, originalDoc)
  const block = result?.content?.find((item) => item.blockType === 'slides')
  if (block?.blockType !== 'slides') throw new Error('в результате нет презентации')
  return block
}

beforeEach(() => {
  fetchPublicFolderContents.mockReset()
  fetchPublicResourceMeta.mockReset()
})

describe('подготовка презентации при сохранении урока', () => {
  it('пустой список заполняется файлами папки по порядку имён', async () => {
    fetchPublicFolderContents.mockResolvedValue([
      { name: '2.png', type: 'file', path: '/guide/2.png' },
      { name: '10.png', type: 'file', path: '/guide/10.png' },
      { name: '1.png', type: 'file', path: '/guide/1.png' },
    ])
    const block = await slidesOf([{ blockType: 'slides', title: 'Гайд', folderUrl: ` ${FOLDER} `, items: [] }])
    expect(block.folderUrl).toBe(FOLDER)
    expect(block.items?.map((item) => [item.url, item.fileName])).toEqual([
      [`${FOLDER}/1.png`, '1.png'], [`${FOLDER}/2.png`, '2.png'], [`${FOLDER}/10.png`, '10.png'],
    ])
  })

  it('заполненный список папка не перезаписывает: состав и порядок задал администратор', async () => {
    const block = await slidesOf([{ blockType: 'slides', title: 'Гайд', folderUrl: FOLDER, items: [{ url: `${FOLDER}/b.png`, caption: ' Итог ' }, { url: `${FOLDER}/a.pdf` }] }])
    expect(fetchPublicFolderContents).not.toHaveBeenCalled()
    expect(block.items).toEqual([
      { url: `${FOLDER}/b.png`, fileName: 'b.png', caption: 'Итог' },
      { url: `${FOLDER}/a.pdf`, fileName: 'a.pdf', caption: null },
    ])
  })

  it('имя файла определяется по адресу, а не по присланному значению', async () => {
    const block = await slidesOf([{ blockType: 'slides', title: 'Гайд', items: [{ url: `${FOLDER}/slide.png`, fileName: 'document.pdf' }, { url: '/api/media/file/%D1%81%D1%85%D0%B5%D0%BC%D0%B0.png' }] }])
    expect(block.items?.map((item) => item.fileName)).toEqual(['slide.png', 'схема.png'])
  })

  it('имя по ссылке на отдельный файл спрашивается у Диска один раз, дальше берётся из урока', async () => {
    const single = 'https://disk.yandex.ru/i/AbCdEf123'
    fetchPublicResourceMeta.mockResolvedValue({ name: 'Гайд.pdf', type: 'file' })
    const created = await slidesOf([{ blockType: 'slides', title: 'Гайд', items: [{ url: single }] }])
    expect(created.items?.[0].fileName).toBe('Гайд.pdf')
    expect(fetchPublicResourceMeta).toHaveBeenCalledTimes(1)
    const saved = await slidesOf([{ id: 'b1', blockType: 'slides', title: 'Гайд', items: [{ url: single }] }], { content: [{ id: 'b1', blockType: 'slides', title: 'Гайд', items: [{ url: single, fileName: 'Гайд.pdf' }] }] })
    expect(saved.items?.[0].fileName).toBe('Гайд.pdf')
    expect(fetchPublicResourceMeta).toHaveBeenCalledTimes(1)
  })

  it.each<[string, Content[number], string]>([
    ['без файлов и папки', { blockType: 'slides', title: 'Пусто' }, 'Презентация «Пусто»: добавьте файлы или ссылку на папку'],
    ['чужой адрес', { blockType: 'slides', title: 'Гайд', items: [{ url: 'https://example.com/a.png' }] }, 'файл 1: нужна ссылка на файл на Яндекс Диске или в медиатеке'],
    ['видео', { blockType: 'slides', title: 'Гайд', items: [{ url: `${FOLDER}/a.png` }, { url: `${FOLDER}/video.mp4` }] }, 'файл 2: видео добавляйте блоком «Видео»'],
    ['папка среди файлов', { blockType: 'slides', title: 'Гайд', items: [{ url: KEY }] }, 'файл 1: это ссылка на папку'],
  ])('%s — сохранение отклоняется с объяснением', async (_label, block, message) => {
    await expect(run([block])).rejects.toMatchObject({ status: 400, message: expect.stringContaining(message) })
  })

  it('отдельный файл Диска с видео не проходит по имени с Диска', async () => {
    fetchPublicResourceMeta.mockResolvedValue({ name: 'запись.mp4', type: 'file' })
    await expect(run([{ blockType: 'slides', title: 'Гайд', items: [{ url: 'https://disk.yandex.ru/i/Video123' }] }])).rejects.toThrow('блоком «Видео»')
  })

  it('урок без презентаций проходит без обращений к Диску и без изменений', async () => {
    const data = { title: 'Урок', content: [{ blockType: 'link' as const, title: 'Файл', url: `${FOLDER}/a.pdf` }] }
    const result = await prepareSlides({ data, operation: 'create', req: {} as PayloadRequest, collection: {} as never, context: {} } as Parameters<typeof prepareSlides>[0])
    expect(result).toBe(data)
    expect(fetchPublicFolderContents).not.toHaveBeenCalled()
  })
})

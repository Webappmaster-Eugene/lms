import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listSlideFolder, resolveSlideFileName, SlidesError } from '@/server/slides-folder'

const KEY = 'https://disk.yandex.com/d/vElPjy8GncYsUg'
const fetchMock = vi.fn<typeof fetch>()

type Entry = { name: string; type: 'file' | 'dir' }
const listing = (folder: string, entries: Entry[], total = entries.length) => new Response(JSON.stringify({
  name: folder, type: 'dir',
  _embedded: { total, limit: 100, offset: 0, items: entries.map((entry) => ({ ...entry, path: `/${folder}/${entry.name}` })) },
}), { status: 200 })
const file = (name: string): Entry => ({ name, type: 'file' })

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('папка Диска как презентация', () => {
  it('отдаёт файлы по порядку имён со ссылками на каждый файл', async () => {
    fetchMock.mockResolvedValue(listing('Легенда', [file('Слайд 10.png'), file('Слайд 2.png'), file('итог.pdf'), file('Слайд 1.png')]))
    const files = await listSlideFolder(`${KEY}/${encodeURIComponent('Легенда')}`)
    expect(files.map((item) => item.fileName)).toEqual(['итог.pdf', 'Слайд 1.png', 'Слайд 2.png', 'Слайд 10.png'])
    expect(files[1].url).toBe(`${KEY}/${encodeURIComponent('Легенда')}/${encodeURIComponent('Слайд 1.png')}`)
    const request = new URL(String(fetchMock.mock.calls[0][0]))
    expect(request.searchParams.get('public_key')).toBe(KEY)
    expect(request.searchParams.get('path')).toBe('/Легенда')
  })

  it('пропускает подпапки, видео и служебные файлы', async () => {
    fetchMock.mockResolvedValue(listing('Гайд', [
      { name: 'Архив', type: 'dir' }, file('запись.mp4'), file('.DS_Store'), file('._слайд.png'), file('~$deck.pptx'),
      file('Thumbs.db'), file('README'), file('слайд.png'), file('deck.pptx'),
    ]))
    const names = (await listSlideFolder(`${KEY}/x`)).map((item) => item.fileName)
    expect(names).toHaveLength(2)
    expect(names).toEqual(expect.arrayContaining(['слайд.png', 'deck.pptx']))
  })

  it('пустая папка и папка только с видео — понятная ошибка, а не пустая презентация', async () => {
    fetchMock.mockResolvedValue(listing('Видео', [file('1.mp4'), { name: 'Вложенная', type: 'dir' }]))
    await expect(listSlideFolder(KEY)).rejects.toThrow('нет картинок, PDF')
  })

  it('слишком большая папка не обрезается молча', async () => {
    fetchMock.mockImplementation(async (input) => {
      const offset = Number(new URL(String(input)).searchParams.get('offset'))
      return listing('Много', Array.from({ length: 100 }, (_, index) => file(`${offset + index}.png`)), 400)
    })
    await expect(listSlideFolder(KEY)).rejects.toThrow('Файлов в папке: 400')
  })

  it.each([
    ['не ссылка Диска', 'https://example.com/folder', 'публичная ссылка Яндекс Диска'],
    ['пустая строка', '   ', 'публичная ссылка Яндекс Диска'],
  ])('%s отклоняется без обращения к Диску', async (_label, url, message) => {
    await expect(listSlideFolder(url)).rejects.toThrow(message)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('закрытая или удалённая папка объясняется администратору', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }))
    const failure = await listSlideFolder(KEY).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(SlidesError)
    expect(failure).toMatchObject({ status: 400, message: expect.stringContaining('не открыл ссылку') })
  })

  it('сбой сети не выдаётся за ошибку в ссылке', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(listSlideFolder(KEY)).rejects.toThrow('Повторите попытку позже')
  })
})

describe('имя файла по ссылке на отдельный файл', () => {
  const single = 'https://disk.yandex.ru/i/AbCdEf123'

  it('берётся с Диска', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ name: 'Гайд.pdf', type: 'file' }), { status: 200 }))
    expect(await resolveSlideFileName(single)).toBe('Гайд.pdf')
  })

  it('ссылка на папку направляет в поле папки', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ name: 'Гайды', type: 'dir' }), { status: 200 }))
    await expect(resolveSlideFileName(single)).rejects.toThrow('поле «Папка на Яндекс Диске»')
  })
})

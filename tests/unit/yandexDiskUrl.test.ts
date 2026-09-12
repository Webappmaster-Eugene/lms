import { describe, it, expect } from 'vitest'

import { buildPublicFileUrl, parsePublicResourceUrl } from '@/lib/yandex-disk-url'

const FOLDER = 'https://disk.yandex.ru/d/XP2GssUqm7HIEg'

describe('parsePublicResourceUrl', () => {
  it('ссылка на папку разбирается без пути', () => {
    expect(parsePublicResourceUrl(FOLDER)).toEqual({ publicKey: FOLDER, path: null })
  })

  it('ссылка на опубликованный файл (/i/) разбирается без пути', () => {
    expect(parsePublicResourceUrl('https://disk.yandex.ru/i/abc123')).toEqual({
      publicKey: 'https://disk.yandex.ru/i/abc123',
      path: null,
    })
  })

  it('путь внутри папки отделяется от ключа публикации', () => {
    expect(parsePublicResourceUrl(`${FOLDER}/Block%201/1.mp4`)).toEqual({
      publicKey: FOLDER,
      path: '/Block 1/1.mp4',
    })
  })

  it('кириллица в пути декодируется — API принимает путь в исходном виде', () => {
    const url = `${FOLDER}/${encodeURIComponent('0. Предобучение')}/1.mp4`

    expect(parsePublicResourceUrl(url)?.path).toBe('/0. Предобучение/1.mp4')
  })

  it.each([
    ['чужой хост', 'https://example.com/d/abc/1.mp4'],
    ['не ссылка', 'просто текст'],
    ['javascript-схема', 'javascript:alert(1)'],
    ['корень диска без ключа', 'https://disk.yandex.ru/'],
    ['неизвестный тип публикации', 'https://disk.yandex.ru/x/abc'],
  ])('%s — null', (_label, url) => {
    expect(parsePublicResourceUrl(url)).toBeNull()
  })

  it('битая percent-последовательность не роняет разбор', () => {
    expect(parsePublicResourceUrl(`${FOLDER}/%E0%A4%A`)).toBeNull()
  })

  it('домены-зеркала поддерживаются', () => {
    expect(parsePublicResourceUrl('https://yadi.sk/d/abc')?.publicKey).toBe('https://yadi.sk/d/abc')
  })
})

describe('buildPublicFileUrl', () => {
  it('собирает ссылку на файл внутри папки с экранированием', () => {
    const url = buildPublicFileUrl(FOLDER, '/0. Предобучение/1.mp4')

    expect(url).toBe(`${FOLDER}/${encodeURIComponent('0. Предобучение')}/1.mp4`)
  })

  it('результат разбирается обратно в исходный путь', () => {
    const path = '/Блок 5 – Лендинг/3_1 [tag].mp4'
    const url = buildPublicFileUrl(FOLDER, path)

    expect(parsePublicResourceUrl(url!)).toEqual({ publicKey: FOLDER, path })
  })

  it('пустой путь даёт ссылку на саму папку', () => {
    expect(buildPublicFileUrl(FOLDER, '/')).toBe(FOLDER)
  })

  it('некорректная ссылка на папку — null, без исключения', () => {
    expect(buildPublicFileUrl('https://example.com/d/abc', '/1.mp4')).toBeNull()
  })
})

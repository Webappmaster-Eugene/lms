import { describe, it, expect } from 'vitest'

import {
  groupIntoSections,
  parseVideoFilename,
  parseYandexDiskFolder,
  type ParsedVideo,
} from '@/lib/yandex-disk-parser'
import { filterVideoFiles, type YandexDiskItem } from '@/lib/yandex-disk'

function file(name: string, extra: Partial<YandexDiskItem> = {}): YandexDiskItem {
  return { name, type: 'file', path: `/disk/${name}`, ...extra }
}

describe('parseVideoFilename: поддерживаемые форматы', () => {
  it('разбирает "X.Y - Название"', () => {
    expect(parseVideoFilename('1.1 - Введение.mp4')).toMatchObject({
      sectionNumber: 1,
      lessonOrder: 1,
      title: 'Введение',
      originalName: '1.1 - Введение.mp4',
    })
  })

  it('разбирает имя без тире', () => {
    expect(parseVideoFilename('1.1 Введение.mp4')).toMatchObject({ title: 'Введение' })
  })

  it.each([
    ['дефис', '2.3 - Название.mp4'],
    ['среднее тире', '2.3 – Название.mp4'],
    ['длинное тире', '2.3 — Название.mp4'],
  ])('принимает %s как разделитель', (_label, name) => {
    expect(parseVideoFilename(name)).toMatchObject({
      sectionNumber: 2,
      lessonOrder: 3,
      title: 'Название',
    })
  })

  it('ведущие нули не меняют номера', () => {
    expect(parseVideoFilename('01.02 - Название.mp4')).toMatchObject({
      sectionNumber: 1,
      lessonOrder: 2,
    })
  })

  it('двузначный порядок урока разбирается как число, а не как строка', () => {
    expect(parseVideoFilename('2.10 — Длинное название урока.mov')).toMatchObject({
      sectionNumber: 2,
      lessonOrder: 10,
    })
  })

  it('расширение отбрасывается, а точки внутри названия остаются', () => {
    expect(parseVideoFilename('1.1 - Версия 2.0 модуля.mp4')?.title).toBe('Версия 2.0 модуля')
  })

  it('пробелы вокруг названия обрезаются', () => {
    expect(parseVideoFilename('1.1 -    Название   .mp4')?.title).toBe('Название')
  })

  it('publicUrl и path остаются пустыми — их заполняет вызывающий код', () => {
    expect(parseVideoFilename('1.1 - X.mp4')).toMatchObject({ publicUrl: '', path: '' })
  })
})

describe('parseVideoFilename: что отвергается', () => {
  it.each([
    ['без нумерации', 'Введение.mp4'],
    ['одно число вместо двух', '1 - Введение.mp4'],
    ['нумерация без названия', '1.1 - .mp4'],
    ['только нумерация', '1.1.mp4'],
    ['нумерация не в начале', 'Урок 1.1 - Введение.mp4'],
    ['пустое имя', ''],
  ])('отвергает %s', (_label, name) => {
    expect(parseVideoFilename(name)).toBeNull()
  })
})

describe('groupIntoSections', () => {
  const video = (sectionNumber: number, lessonOrder: number, title: string): ParsedVideo => ({
    sectionNumber,
    lessonOrder,
    title,
    originalName: `${sectionNumber}.${lessonOrder} - ${title}.mp4`,
    publicUrl: '',
    path: '',
  })

  it('раскладывает уроки по разделам', () => {
    const sections = groupIntoSections([video(1, 1, 'a'), video(2, 1, 'b'), video(1, 2, 'c')])

    expect(sections.map((s) => s.sectionNumber)).toEqual([1, 2])
    expect(sections[0].lessons.map((l) => l.title)).toEqual(['a', 'c'])
  })

  it('сортирует разделы по номеру независимо от порядка файлов', () => {
    const sections = groupIntoSections([video(3, 1, 'c'), video(1, 1, 'a'), video(2, 1, 'b')])
    expect(sections.map((s) => s.sectionNumber)).toEqual([1, 2, 3])
  })

  it('сортирует уроки внутри раздела численно, а не лексикографически', () => {
    const sections = groupIntoSections([video(1, 10, 'десятый'), video(1, 2, 'второй')])
    expect(sections[0].lessons.map((l) => l.order)).toEqual([2, 10])
  })

  it('разрывы в нумерации не создают пустых разделов', () => {
    const sections = groupIntoSections([video(1, 1, 'a'), video(5, 1, 'b')])
    expect(sections.map((s) => s.sectionNumber)).toEqual([1, 5])
  })

  it('название раздела выводится из номера', () => {
    expect(groupIntoSections([video(2, 1, 'a')])[0].title).toBe('Раздел 2')
  })

  it('пустой вход даёт пустой результат', () => {
    expect(groupIntoSections([])).toEqual([])
  })
})

describe('parseYandexDiskFolder', () => {
  const FOLDER = 'https://disk.yandex.ru/d/example'

  it('собирает разделы и проставляет ссылки', () => {
    const result = parseYandexDiskFolder(
      [file('1.1 - Введение.mp4', { public_url: 'https://disk.yandex.ru/i/one' })],
      FOLDER,
    )

    expect(result.totalVideos).toBe(1)
    expect(result.errors).toEqual([])
    expect(result.sections[0].lessons[0]).toMatchObject({
      publicUrl: 'https://disk.yandex.ru/i/one',
      path: '/disk/1.1 - Введение.mp4',
    })
  })

  it('без собственной ссылки у файла подставляется ссылка папки', () => {
    const result = parseYandexDiskFolder([file('1.1 - Введение.mp4')], FOLDER)
    expect(result.sections[0].lessons[0].publicUrl).toBe(FOLDER)
  })

  it('каталоги пропускаются молча, без записи в ошибки', () => {
    const result = parseYandexDiskFolder(
      [{ name: 'Раздел 1', type: 'dir', path: '/disk/Раздел 1' }, file('1.1 - a.mp4')],
      FOLDER,
    )

    expect(result.totalVideos).toBe(1)
    expect(result.errors).toEqual([])
  })

  it('файл с неподходящим именем не теряется молча, а попадает в errors', () => {
    const result = parseYandexDiskFolder([file('1.1 - a.mp4'), file('Лекция.mp4')], FOLDER)

    expect(result.totalVideos).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Лекция.mp4')
  })

  it('дубликат нумерации отбрасывается, но объявляется в errors', () => {
    const result = parseYandexDiskFolder(
      [file('1.1 - Первый.mp4'), file('1.1 - Второй.mp4')],
      FOLDER,
    )

    expect(result.totalVideos).toBe(1)
    expect(result.sections[0].lessons[0].title).toBe('Первый')
    expect(result.errors.some((e) => e.includes('Дубликат'))).toBe(true)
  })

  it('папка без подходящих файлов возвращает внятную ошибку, а не пустой успех', () => {
    const result = parseYandexDiskFolder([file('readme.txt')], FOLDER)

    expect(result.sections).toEqual([])
    expect(result.totalVideos).toBe(0)
    expect(result.errors.some((e) => e.includes('Не найдено видео-файлов'))).toBe(true)
  })
})

describe('filterVideoFiles', () => {
  it('оставляет поддерживаемые видео-расширения', () => {
    const items = ['a.mp4', 'b.mov', 'c.avi', 'd.mkv', 'e.webm', 'f.flv', 'g.wmv'].map((n) =>
      file(n),
    )
    expect(filterVideoFiles(items)).toHaveLength(7)
  })

  it('регистр расширения не важен', () => {
    expect(filterVideoFiles([file('A.MP4'), file('B.MoV')])).toHaveLength(2)
  })

  it('отбрасывает не-видео и каталоги', () => {
    const items = [
      file('doc.pdf'),
      file('без расширения'),
      file('archive.mp4.zip'),
      { name: 'video.mp4', type: 'dir' as const, path: '/disk/video.mp4' },
    ]
    expect(filterVideoFiles(items)).toEqual([])
  })

  it('расширение берётся после последней точки', () => {
    expect(filterVideoFiles([file('Версия 2.0 урока.mp4')])).toHaveLength(1)
  })
})

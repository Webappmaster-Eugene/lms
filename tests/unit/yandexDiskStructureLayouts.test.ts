import { describe, expect, it } from 'vitest'

import { parseYandexDiskTree } from '@/lib/yandex-disk-structure'
import type { YandexDiskItem } from '@/lib/yandex-disk'

/** Раскладки курсов, которые встречаются реже основных: импорт не должен на них терять файлы. */

function dir(path: string): YandexDiskItem {
  return { name: basename(path), type: 'dir', path }
}

function file(path: string, size = 1024): YandexDiskItem {
  return { name: basename(path), type: 'file', path, size }
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? ''
}

describe('нумерация «раздел.урок» вне обычной папки-секции', () => {
  it('в корне публикации делит курс на разделы, а не складывает всё в одну секцию с названием курса', () => {
    const result = parseYandexDiskTree([
      file('/1.1. Почему FSD (Введение).mp4'),
      file('/1.2. Как устроен курс.mp4'),
      file('/2.1. Настройка VSCode (Настройка).mp4'),
    ], { rootTitle: 'Курс FSD' })

    expect(result.sections.map((section) => section.title)).toEqual(['Введение', 'Настройка'])
    expect(result.totalVideos).toBe(3)
  })

  it('у папки-группы её собственные видео тоже делятся на разделы рядом с вложенными блоками', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/1.1 Обзор (Введение).mp4'),
      file('/Курс/2.1 Установка (Настройка).mp4'),
      dir('/Курс/Блок A'),
      file('/Курс/Блок A/1.mp4'),
      file('/Курс/Блок A/2.mp4'),
    ])

    expect(result.sections.map((section) => section.title)).toEqual(['Введение', 'Настройка', 'Блок A'])
    expect(result.totalVideos).toBe(4)
  })

  it('видео без номера раздела становится последним уроком последнего раздела', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/1.1 Обзор (Введение).mp4'),
      file('/Курс/2.1 Установка (Настройка).mp4'),
      file('/Курс/2.2 Плагины (Настройка).mp4'),
      file('/Курс/Бонус - интервью с автором.mp4'),
    ])

    const last = result.sections.at(-1)
    expect(last?.title).toBe('Настройка')
    expect(last?.lessons.map((lesson) => lesson.title)).toEqual(['Установка', 'Плагины', 'Бонус - интервью с автором'])
    expect(last?.lessons[2].videos[0].path).toBe('/Курс/Бонус - интервью с автором.mp4')
    expect(result.totalVideos).toBe(4)
  })

  it('материалы попадают к уроку своего номера, иначе к первому уроку раздела или курса', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/1.1 Обзор (Введение).mp4'),
      file('/Курс/1.2 Структура (Введение).mp4'),
      file('/Курс/2.1 Установка (Настройка).mp4'),
      file('/Курс/2.2 Плагины (Настройка).mp4'),
      file('/Курс/2.2 Список плагинов.pdf'),
      file('/Курс/2 Чек-лист раздела.pdf'),
      file('/Курс/Конспект курса.pdf'),
      file('/Курс/9.5 Материал удалённого раздела.pdf'),
    ])

    const titles = (sectionIndex: number, lessonIndex: number) =>
      result.sections[sectionIndex].lessons[lessonIndex].materials.map((material) => material.title).sort()
    expect(titles(0, 0)).toEqual(['9.5 Материал удалённого раздела.pdf', 'Конспект курса.pdf'].sort())
    expect(titles(0, 1)).toEqual([])
    expect(titles(1, 0)).toEqual(['2 Чек-лист раздела.pdf'])
    expect(titles(1, 1)).toEqual(['2.2 Список плагинов.pdf'])
  })
})

describe('папки без видео внутри секции', () => {
  it('папка с номером урока уходит материалами к этому уроку, без номера — к первому', () => {
    const result = parseYandexDiskTree([
      dir('/Блок 2'),
      file('/Блок 2/1.mp4'),
      file('/Блок 2/2.mp4'),
      dir('/Блок 2/2 Креативы'),
      file('/Блок 2/2 Креативы/баннер.png'),
      dir('/Блок 2/Исходники'),
      file('/Блок 2/Исходники/app.js'),
    ])

    const [first, second] = result.sections[0].lessons
    expect(first.materials.map((material) => material.path)).toEqual(['/Блок 2/Исходники/app.js'])
    expect(second.materials.map((material) => material.path)).toEqual(['/Блок 2/2 Креативы/баннер.png'])
  })
})

describe('разбивка большой секции по авторской разметке', () => {
  it('уроки до первой метки раздела остаются под названием исходной секции', () => {
    const items = [dir('/Курс')]
    for (let index = 1; index <= 33; index++) {
      const marker = index === 5 ? ' (Компоненты)' : index === 15 ? ' (Хуки)' : index === 25 ? ' (Финал)' : ''
      items.push(file(`/Курс/${index}. Тема ${index}${marker}.mp4`))
    }

    const result = parseYandexDiskTree(items)

    expect(result.sections.map((section) => section.title)).toEqual(['Курс', 'Компоненты', 'Хуки', 'Финал'])
    expect(result.sections.map((section) => section.lessons.length)).toEqual([4, 10, 10, 9])
    expect(result.sections[0].lessons.map((lesson) => lesson.title)).toEqual(['Тема 1', 'Тема 2', 'Тема 3', 'Тема 4'])
    expect(result.totalVideos).toBe(33)
  })
})

describe('папка-наложение без пары в основной структуре', () => {
  it('непривязанный материал не подкладывается наугад, а попадает в предупреждения', () => {
    const result = parseYandexDiskTree([
      dir('/Практикум'),
      dir('/Практикум/Блок 6'),
      file('/Практикум/Блок 6/1.mp4'),
      file('/Практикум/Блок 6/2.mp4'),
      dir('/Практикум (доп)'),
      file('/Практикум (доп)/Общий чат.txt'),
      dir('/Практикум (доп)/Неизвестный блок'),
      file('/Практикум (доп)/Неизвестный блок/схема.png'),
    ])

    expect(result.totalMaterials).toBe(0)
    expect(result.warnings).toEqual(expect.arrayContaining([
      'Материал "Общий чат.txt" из папки "Практикум (доп)" не привязан: нет подходящего урока',
      'Материал "схема.png" из папки "Практикум (доп)" не привязан: нет подходящего урока',
    ]))
  })
})

describe('предел числа материалов урока', () => {
  it('россыпь картинок из разных подпапок сворачивается в ссылку на их ближайшую общую папку', () => {
    const items = [dir('/Блок'), file('/Блок/1.mp4'), file('/Блок/2.mp4'), file('/Блок/Конспект.pdf'), file('/Блок/ссылки.txt')]
    for (let index = 0; index < 7; index++) {
      items.push(file(`/Блок/макеты/экран${index}.png`), file(`/Блок/иконки/иконка${index}.png`))
    }

    const materials = parseYandexDiskTree(items).sections[0].lessons[0].materials

    expect(materials.map((material) => material.title).sort()).toEqual(['Блок - папка на Диске', 'Конспект.pdf', 'ссылки.txt'].sort())
    expect(materials.find((material) => material.title === 'Блок - папка на Диске')).toEqual({
      title: 'Блок - папка на Диске', path: '/Блок', isText: false, size: null,
    })
  })

  it('много документов не сворачивается: каждый открывается по отдельности', () => {
    const items = [dir('/Блок'), file('/Блок/1.mp4'), file('/Блок/2.mp4')]
    for (let index = 1; index <= 13; index++) items.push(file(`/Блок/Лекция ${index}.pdf`))

    const materials = parseYandexDiskTree(items).sections[0].lessons[0].materials

    expect(materials).toHaveLength(13)
    expect(materials.every((material) => material.title.endsWith('.pdf'))).toBe(true)
  })

  it('файлы в корне публикации сворачиваются в ссылку на корень с понятным названием', () => {
    const items = [file('/1.mp4'), file('/2.mp4')]
    for (let index = 0; index < 13; index++) items.push(file(`/скриншот${index}.png`))

    const materials = parseYandexDiskTree(items).sections[0].lessons[0].materials

    expect(materials).toEqual([{ title: 'Исходники - папка на Диске', path: '/', isText: false, size: null }])
  })
})

import { describe, it, expect } from 'vitest'

import { parseYandexDiskTree } from '@/lib/yandex-disk-structure'
import type { YandexDiskItem } from '@/lib/yandex-disk'

function dir(path: string): YandexDiskItem {
  return { name: basename(path), type: 'dir', path }
}

function file(path: string, size = 1024): YandexDiskItem {
  return { name: basename(path), type: 'file', path, size }
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? ''
}

/** Курс из папок-блоков: именно так разложены реальные видеокурсы. */
const BLOCKS: YandexDiskItem[] = [
  dir('/Блок 1 – Личная концепция'),
  file('/Блок 1 – Личная концепция/1.mp4'),
  file('/Блок 1 – Личная концепция/2.mp4'),
  dir('/Блок 2 – Идеи'),
  file('/Блок 2 – Идеи/1.mp4'),
  dir('/Блок 2 – Идеи/3'),
  file('/Блок 2 – Идеи/3/3.mp4'),
]

describe('секции из папок', () => {
  it('папка с несколькими номерами видео становится секцией', () => {
    const result = parseYandexDiskTree(BLOCKS)

    expect(result.sections.map((s) => s.title)).toEqual(['Блок 1 – Личная концепция', 'Блок 2 – Идеи'])
    expect(result.totalVideos).toBe(4)
  })

  it('вложенная папка-урок попадает уроком в свою секцию, а не отдельной секцией', () => {
    const result = parseYandexDiskTree(BLOCKS)
    const block2 = result.sections[1]

    expect(block2.lessons).toHaveLength(2)
    expect(block2.lessons[1].videos[0].path).toBe('/Блок 2 – Идеи/3/3.mp4')
  })

  it('папка-группа сама секцией не становится', () => {
    const result = parseYandexDiskTree([
      dir('/Практикум'),
      dir('/Практикум/Блок 1'),
      file('/Практикум/Блок 1/1.mp4'),
      file('/Практикум/Блок 1/2.mp4'),
      dir('/Практикум/Блок 2'),
      file('/Практикум/Блок 2/1.mp4'),
      file('/Практикум/Блок 2/2.mp4'),
    ])

    expect(result.sections.map((s) => s.title)).toEqual(['Блок 1', 'Блок 2'])
  })

  it('порядок секций и уроков пересчитывается подряд от единицы', () => {
    const result = parseYandexDiskTree([
      dir('/Интро'),
      file('/Интро/0.mp4'),
      file('/Интро/4.mp4'),
      file('/Интро/9.mp4'),
    ])

    expect(result.sections[0].order).toBe(1)
    expect(result.sections[0].lessons.map((l) => l.order)).toEqual([1, 2, 3])
    expect(result.sections[0].lessons.map((l) => l.title)).toEqual(['Урок 1', 'Урок 2', 'Урок 3'])
  })

  it('папка без видео сохраняет материалы, но помечается предупреждением', () => {
    const result = parseYandexDiskTree([dir('/Пустой блок'), file('/Пустой блок/readme.pdf')])

    expect(result.totalVideos).toBe(0)
    expect(result.sections[0].lessons[0].materials.map((m) => m.title)).toEqual(['readme.pdf'])
    expect(result.warnings.join('\n')).toContain('В секции "Пустой блок" нет видео')
  })
})

describe('уроки и части', () => {
  it('файлы "N_M" собираются в один урок частями по порядку', () => {
    const result = parseYandexDiskTree([
      dir('/Блок 6'),
      file('/Блок 6/1.mp4'),
      dir('/Блок 6/5'),
      file('/Блок 6/5/5_2.mp4'),
      file('/Блок 6/5/5_1.mp4'),
      file('/Блок 6/5/5_10.mp4'),
    ])

    const lesson = result.sections[0].lessons[1]
    expect(lesson.videos.map((v) => v.path)).toEqual([
      '/Блок 6/5/5_1.mp4',
      '/Блок 6/5/5_2.mp4',
      '/Блок 6/5/5_10.mp4',
    ])
    expect(lesson.videos.map((v) => v.title)).toEqual(['Часть 1', 'Часть 2', 'Часть 3'])
  })

  it('у урока из одного файла заголовок видео совпадает с названием урока', () => {
    const result = parseYandexDiskTree([dir('/Блок 1'), file('/Блок 1/1.mp4'), file('/Блок 1/2.mp4')])

    expect(result.sections[0].lessons[0].videos[0].title).toBe('Урок 1')
  })

  it('название папки-урока становится названием урока', () => {
    const result = parseYandexDiskTree([
      dir('/Блок 6'),
      file('/Блок 6/1.mp4'),
      dir('/Блок 6/10 Кабинет Google Ads'),
      file('/Блок 6/10 Кабинет Google Ads/10.mp4'),
    ])

    expect(result.sections[0].lessons[1].title).toBe('Кабинет Google Ads')
  })

  it('папка с датой в имени превращается в созвон с читаемой датой', () => {
    const result = parseYandexDiskTree([
      dir('/Созвоны'),
      dir('/Созвоны/20250918'),
      file('/Созвоны/20250918/rec.mp4'),
      dir('/Созвоны/20251104-2'),
      file('/Созвоны/20251104-2/rec.mp4'),
    ])

    expect(result.sections[0].lessons.map((l) => l.title)).toEqual([
      'Созвон 18.09.2025',
      'Созвон 04.11.2025 (2)',
    ])
  })

  it('технические пометки раздач вырезаются из названий', () => {
    const result = parseYandexDiskTree([
      dir('/Блок 6'),
      file('/Блок 6/1.mp4'),
      dir('/Блок 6/2 Разбор ниш [skladchik.org]'),
      file('/Блок 6/2 Разбор ниш [skladchik.org]/2 [skladchik.org].mp4'),
    ])

    expect(result.sections[0].lessons[1].title).toBe('Разбор ниш')
  })

  it('видео без номера в секции пропускается с предупреждением', () => {
    const result = parseYandexDiskTree([
      dir('/Блок 1'),
      file('/Блок 1/1.mp4'),
      file('/Блок 1/2.mp4'),
      file('/Блок 1/финал.mp4'),
    ])

    expect(result.totalVideos).toBe(2)
    expect(result.warnings.join('\n')).toContain('финал.mp4')
  })
})

describe('материалы', () => {
  it('материал с номером привязывается к своему уроку независимо от порядка обхода', () => {
    const result = parseYandexDiskTree([
      dir('/Блок 3'),
      file('/Блок 3/2.Промпты.pdf'),
      file('/Блок 3/1.mp4'),
      file('/Блок 3/2.mp4'),
    ])

    expect(result.sections[0].lessons[0].materials).toHaveLength(0)
    expect(result.sections[0].lessons[1].materials.map((m) => m.title)).toEqual(['2.Промпты.pdf'])
  })

  it('материал без номера относится ко всей секции и попадает в первый урок', () => {
    const result = parseYandexDiskTree([
      dir('/Блок 4'),
      file('/Блок 4/1.mp4'),
      file('/Блок 4/2.mp4'),
      file('/Блок 4/Конспект блока.pdf'),
    ])

    expect(result.sections[0].lessons[0].materials.map((m) => m.title)).toEqual(['Конспект блока.pdf'])
  })

  it('текстовые файлы помечаются отдельно — их содержимое разворачивается при импорте', () => {
    const result = parseYandexDiskTree([
      dir('/Блок 4'),
      file('/Блок 4/1.mp4'),
      file('/Блок 4/1.ссылки.txt'),
    ])

    expect(result.sections[0].lessons[0].materials[0]).toMatchObject({
      title: '1.ссылки.txt',
      isText: true,
    })
  })
})

describe('папка-наложение с дополнительными материалами', () => {
  const WITH_OVERLAY: YandexDiskItem[] = [
    dir('/Практикум'),
    dir('/Практикум/Блок 6'),
    file('/Практикум/Блок 6/1.mp4'),
    dir('/Практикум/Блок 6/8'),
    file('/Практикум/Блок 6/8/8.mp4'),
    dir('/Практикум (доп)'),
    dir('/Практикум (доп)/Блок 6'),
    file('/Практикум (доп)/Блок 6/miro.txt'),
    dir('/Практикум (доп)/Блок 6/8'),
    dir('/Практикум (доп)/Блок 6/8/Креативы'),
    file('/Практикум (доп)/Блок 6/8/Креативы/1_tattoo.mov'),
  ]

  it('папка "(доп)" не создаёт своих секций', () => {
    const result = parseYandexDiskTree(WITH_OVERLAY)

    expect(result.sections.map((s) => s.title)).toEqual(['Блок 6'])
  })

  it('материал из вложенной папки урока привязывается к этому уроку, а не по имени файла', () => {
    const result = parseYandexDiskTree(WITH_OVERLAY)
    const [lesson1, lesson8] = result.sections[0].lessons

    expect(lesson8.materials.map((m) => m.title)).toEqual(['1_tattoo.mov'])
    expect(lesson1.materials.map((m) => m.title)).toEqual(['miro.txt'])
  })

  it('копия материала с тем же именем и размером не дублируется', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      dir('/Курс/Блок 1'),
      file('/Курс/Блок 1/1.mp4'),
      file('/Курс/Блок 1/ссылки.txt', 512),
      file('/Курс/Блок 1/2.mp4'),
      dir('/Курс (доп)'),
      dir('/Курс (доп)/Блок 1'),
      file('/Курс (доп)/Блок 1/ссылки.txt', 512),
    ])

    expect(result.sections[0].lessons[0].materials).toHaveLength(1)
  })

  it('файл того же имени, но другого размера остаётся отдельным материалом', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      dir('/Курс/Блок 1'),
      file('/Курс/Блок 1/1.mp4'),
      file('/Курс/Блок 1/ссылки.txt', 512),
      file('/Курс/Блок 1/2.mp4'),
      dir('/Курс (доп)'),
      dir('/Курс (доп)/Блок 1'),
      file('/Курс (доп)/Блок 1/ссылки.txt', 900),
    ])

    expect(result.sections[0].lessons[0].materials).toHaveLength(2)
  })
})

describe('устойчивость к формату листинга', () => {
  it('пути с префиксом "disk:" разбираются так же', () => {
    const result = parseYandexDiskTree([
      { name: 'Блок 1', type: 'dir', path: 'disk:/Блок 1' },
      { name: '1.mp4', type: 'file', path: 'disk:/Блок 1/1.mp4' },
      { name: '2.mp4', type: 'file', path: 'disk:/Блок 1/2.mp4' },
    ])

    expect(result.sections[0].title).toBe('Блок 1')
    expect(result.totalVideos).toBe(2)
  })

  it('файл без записи о родительской папке не теряется', () => {
    const result = parseYandexDiskTree([
      file('/Блок 1/1.mp4'),
      file('/Блок 1/2.mp4'),
    ])

    expect(result.sections[0].title).toBe('Блок 1')
    expect(result.totalVideos).toBe(2)
  })

  it('видео в корне публикации образуют секцию с названием курса', () => {
    const result = parseYandexDiskTree([file('/1.mp4'), file('/2.mp4')], { rootTitle: 'Мой курс' })

    expect(result.sections[0].title).toBe('Мой курс')
    expect(result.sections[0].lessons).toHaveLength(2)
  })

  it('пустой листинг не падает и сообщает об отсутствии видео', () => {
    const result = parseYandexDiskTree([])

    expect(result.sections).toHaveLength(0)
    expect(result.warnings).toContain('В публичной папке не найдено видео-файлов')
  })
})

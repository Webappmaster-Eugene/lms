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

  it('видео без номера становится отдельным уроком, названным по файлу', () => {
    const result = parseYandexDiskTree([
      dir('/Блок 1'),
      file('/Блок 1/1.mp4'),
      file('/Блок 1/2.mp4'),
      file('/Блок 1/финал.mp4'),
    ])

    expect(result.totalVideos).toBe(3)
    expect(result.sections[0].lessons.map((l) => l.title)).toEqual(['Урок 1', 'Урок 2', 'финал'])
  })

  it('курс без нумерации целиком: каждый файл — свой урок', () => {
    const result = parseYandexDiskTree([
      dir('/Доклады'),
      file('/Доклады/Документация в эпоху AI.mp4'),
      file('/Доклады/AI в SRE.mp4'),
    ])

    expect(result.totalVideos).toBe(2)
    expect(result.sections[0].lessons.map((l) => l.title).sort()).toEqual([
      'AI в SRE',
      'Документация в эпоху AI',
    ])
  })

  it('имена вида lessonN и «Урок №N» разбираются как нумерация', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/[eground.org] lesson1.mp4'),
      file('/Курс/[eground.org] lesson2.mp4'),
      file('/Курс/[eground.org] lesson10.mp4'),
    ])

    expect(result.sections[0].lessons.map((l) => l.title)).toEqual(['Урок 1', 'Урок 2', 'Урок 3'])

    const numbered = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/[eground.org] Урок №1. Введение.mp4'),
      file('/Курс/[eground.org] Урок №2. Метрики.mp4'),
    ])

    expect(numbered.sections[0].lessons.map((l) => l.title)).toEqual(['Введение', 'Метрики'])
  })
})

describe('нумерация «раздел.урок»', () => {
  it('точка разделяет раздел и урок, а не урок и часть', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/1.1. Почему FSD (Введение).mp4'),
      file('/Курс/1.2. Как устроен курс.mp4'),
      file('/Курс/2.1. Настройка VSCode (Настройка).mp4'),
      file('/Курс/2.2. Установка Node.mp4'),
    ])

    expect(result.sections.map((s) => s.title)).toEqual(['Введение', 'Настройка'])
    expect(result.sections[0].lessons.map((l) => l.title)).toEqual(['Почему FSD', 'Как устроен курс'])
    expect(result.totalVideos).toBe(4)
  })

  it('папка-раздел с файлами одного номера: файлы становятся уроками', () => {
    const result = parseYandexDiskTree([
      dir('/11. Типизация Redux'),
      file('/11. Типизация Redux/11.1 О модуле.mp4'),
      file('/11. Типизация Redux/11.2 Типизация слайсов.mp4'),
    ])

    expect(result.sections[0].title).toBe('11. Типизация Redux')
    expect(result.sections[0].lessons.map((l) => l.title)).toEqual(['О модуле', 'Типизация слайсов'])
  })

  it('третий уровень нумерации — части одного урока', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/2.3 Функции.mp4'),
      file('/Курс/2.3.2 Функции.mp4'),
      file('/Курс/3.1 Объекты.mp4'),
    ])

    const lesson = result.sections[0].lessons[0]
    expect(lesson.title).toBe('Функции')
    expect(lesson.videos).toHaveLength(2)
  })

  it('подчёркивание по-прежнему означает части урока', () => {
    const result = parseYandexDiskTree([
      dir('/Блок'),
      file('/Блок/5_1.mp4'),
      file('/Блок/5_2.mp4'),
      file('/Блок/6.mp4'),
    ])

    expect(result.sections[0].lessons).toHaveLength(2)
    expect(result.sections[0].lessons[0].videos).toHaveLength(2)
  })
})

describe('папки без видео', () => {
  it('исходники проекта не становятся секциями, а идут материалами', () => {
    const result = parseYandexDiskTree([
      dir('/Блок 1'),
      file('/Блок 1/1.mp4'),
      dir('/Блок 1/src'),
      dir('/Блок 1/src/shared'),
      file('/Блок 1/src/shared/api.ts'),
      file('/Блок 1/src/index.ts'),
    ])

    expect(result.sections.map((s) => s.title)).toEqual(['Блок 1'])
    expect(result.sections[0].lessons[0].materials.map((m) => m.title).sort()).toEqual([
      'api.ts',
      'index.ts',
    ])
  })

  it('видео папки не теряются, когда рядом лежат вложенные секции', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/1.mp4'),
      file('/Курс/2.mp4'),
      dir('/Курс/Блок A'),
      file('/Курс/Блок A/1.mp4'),
      file('/Курс/Блок A/2.mp4'),
      dir('/Курс/Блок B'),
      file('/Курс/Блок B/1.mp4'),
      file('/Курс/Блок B/2.mp4'),
    ])

    expect(result.totalVideos).toBe(6)
    expect(result.sections.map((s) => s.title)).toEqual(['Курс', 'Блок A', 'Блок B'])
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

  it('basePath делает импортируемую подпапку корнем дерева', () => {
    const result = parseYandexDiskTree(
      [
        dir('/purple/Next.js14'),
        dir('/purple/Next.js14/Блок 1'),
        file('/purple/Next.js14/Блок 1/1.mp4'),
        file('/purple/Next.js14/Блок 1/2.mp4'),
        dir('/purple/React'),
        file('/purple/React/1.mp4'),
      ],
      { basePath: '/purple/Next.js14' },
    )

    expect(result.sections.map((s) => s.title)).toEqual(['Блок 1'])
    expect(result.totalVideos).toBe(2)
  })

  it('пустой листинг не падает и сообщает об отсутствии видео', () => {
    const result = parseYandexDiskTree([])

    expect(result.sections).toHaveLength(0)
    expect(result.warnings).toContain('В публичной папке не найдено видео-файлов')
  })
})

describe('чистка названий и размер секций', () => {
  it('тег раздачи снимается при любом регистре и числе точек', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/[S1.SLIV.ONE] 01.01 Введение.mp4'),
      file('/Курс/[SuperSliv.biz] 01.02 Установка.mp4'),
    ])

    expect(result.sections[0].lessons.map((l) => l.title)).toEqual(['Введение', 'Установка'])
  })

  it('скобки, не похожие на адрес сайта, остаются частью названия', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/1. Babel. Extract plugin [optional].mp4'),
      file('/Курс/2. Финал.mp4'),
    ])

    expect(result.sections[0].lessons[0].title).toBe('Babel. Extract plugin [optional]')
  })

  it('хвостовая служебная «метка» снимается, а «разметка» не страдает', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/1. Sidebar. Layout приложения Метка.mp4'),
      file('/Курс/2. React Testing Library. Тесты на компоненты метка.mp4'),
      file('/Курс/3. Упражнение — Разметка страниц.mp4'),
      file('/Курс/4. Работа с изображениями МЕТКА.mp4'),
    ])

    expect(result.sections[0].lessons.map((l) => l.title)).toEqual([
      'Sidebar. Layout приложения',
      'React Testing Library. Тесты на компоненты',
      'Упражнение — Разметка страниц',
      'Работа с изображениями',
    ])
  })

  it('плоская секция без названий режется на блоки по десять', () => {
    const items = [dir('/Курс')]
    for (let i = 1; i <= 35; i++) items.push(file(`/Курс/lesson${i}.mp4`))

    const result = parseYandexDiskTree(items)

    expect(result.sections.map((s) => s.title)).toEqual([
      'Уроки 1–10', 'Уроки 11–20', 'Уроки 21–30', 'Уроки 31–35',
    ])
    expect(result.sections[3].lessons.map((l) => l.order)).toEqual([1, 2, 3, 4, 5])
    expect(result.totalVideos).toBe(35)
  })

  it('название раздела в скобках у первого урока задаёт границы блоков', () => {
    const items = [dir('/Курс')]
    for (let i = 1; i <= 33; i++) {
      const marker = i === 1 ? ' (Введение)' : i === 12 ? ' (Компоненты)' : i === 24 ? ' (Финал)' : ''
      items.push(file(`/Курс/${i}. Тема ${i}${marker}.mp4`))
    }

    const result = parseYandexDiskTree(items)

    expect(result.sections.map((s) => s.title)).toEqual(['Введение', 'Компоненты', 'Финал'])
    expect(result.sections.map((s) => s.lessons.length)).toEqual([11, 12, 10])
    expect(result.sections[0].lessons[0].title).toBe('Тема 1')
  })

  it('большая секция с авторскими названиями и без разметки остаётся целой', () => {
    const items = [dir('/Курс')]
    for (let i = 1; i <= 40; i++) items.push(file(`/Курс/${i}. Тема ${i}.mp4`))

    const result = parseYandexDiskTree(items)

    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].lessons).toHaveLength(40)
  })
})

describe('тема безымянного раздела берётся из названий уроков', () => {
  /** Второй номер раздела нужен, чтобы папка разбиралась как набор секций. */
  const filler = [file('/Курс/9.1 Прочее один.mp4'), file('/Курс/9.2 Прочее два.mp4')]

  it('тема в хвосте названий становится разделом и снимается с уроков', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/1.1 Почему Golang Введение.mp4'),
      file('/Курс/1.2 Как устроен курс Введение.mp4'),
      file('/Курс/1.3 Обзор курсовВведение.mp4'),
      ...filler,
    ])

    expect(result.sections[0].title).toBe('Введение')
    expect(result.sections[0].lessons.map((l) => l.title)).toEqual([
      'Почему Golang',
      'Как устроен курс',
      'Обзор курсов',
    ])
  })

  it('тема в начале названий тоже подхватывается', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/1.1 Введение - API на Golang.mp4'),
      file('/Курс/1.2 Введение - Как устроен курс.mp4'),
      file('/Курс/1.3 Введение - Обзор проекта.mp4'),
      ...filler,
    ])

    expect(result.sections[0].title).toBe('Введение')
    expect(result.sections[0].lessons.map((l) => l.title)).toEqual([
      'API на Golang',
      'Как устроен курс',
      'Обзор проекта',
    ])
  })

  it('урок, равный теме целиком, сохраняет своё название', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/1.1 Настройка окружения.mp4'),
      file('/Курс/1.2 Настройка окружения - Установка Golang.mp4'),
      file('/Курс/1.3 Настройка окружения - Настройки VSCode.mp4'),
      ...filler,
    ])

    expect(result.sections[0].title).toBe('Настройка окружения')
    expect(result.sections[0].lessons.map((l) => l.title)).toEqual([
      'Настройка окружения',
      'Установка Golang',
      'Настройки VSCode',
    ])
  })

  it('без общей темы раздел остаётся безымянным, названия не трогаются', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/1.1 Адаптация CV.mp4'),
      file('/Курс/1.2 Сопроводительное письмо.mp4'),
      file('/Курс/1.3 Упражнение - Подготовить резюме.mp4'),
      ...filler,
    ])

    expect(result.sections[0].title).toBe('Раздел 1')
    expect(result.sections[0].lessons.map((l) => l.title)).toEqual([
      'Адаптация CV',
      'Сопроводительное письмо',
      'Упражнение - Подготовить резюме',
    ])
  })

  it('раздел из одного урока темы не получает', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/1.1 Введение - Обзор.mp4'),
      file('/Курс/2.1 Практика - Первый шаг.mp4'),
    ])

    expect(result.sections.map((s) => s.title)).toEqual(['Раздел 1', 'Раздел 2'])
    expect(result.sections[0].lessons[0].title).toBe('Введение - Обзор')
  })

  it('название раздела из папки важнее темы из уроков', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      dir('/Курс/01. Основы вёрстки'),
      file('/Курс/01. Основы вёрстки/1. Введение - Теги.mp4'),
      file('/Курс/01. Основы вёрстки/2. Введение - Селекторы.mp4'),
    ])

    expect(result.sections[0].title).toBe('01. Основы вёрстки')
    expect(result.sections[0].lessons.map((l) => l.title)).toEqual([
      'Введение - Теги',
      'Введение - Селекторы',
    ])
  })
})

describe('материалы не превращают урок в файловый менеджер', () => {
  it('распакованный проект сворачивается в ссылку на папку, архивы остаются', () => {
    const items = [dir('/Блок'), file('/Блок/1.mp4'), dir('/Блок/src')]
    for (let i = 0; i < 20; i++) items.push(file(`/Блок/src/file${i}.ts`))
    items.push(file('/Блок/src/проект.zip'))

    const result = parseYandexDiskTree(items)
    const materials = result.sections[0].lessons[0].materials

    // сворачивается папка урока целиком — это и есть «все материалы урока»
    expect(materials.map((m) => m.title)).toEqual(['Блок — папка на Диске', 'проект.zip'])
  })

  it('рекламные ярлыки раздач в материалы не попадают, полезные остаются', () => {
    const result = parseYandexDiskTree([
      dir('/Курс'),
      file('/Курс/1.mp4'),
      file('/Курс/Eground - Скачивай платные курсы, тренинги и другие материалы бесплатно!.url'),
      file('/Курс/Присоединяйся в Telegram - @eground_live.url'),
      file('/Курс/Topkursy.com - Удаленные курсы Skillbox, GeekBrains.url'),
      file('/Курс/1 -NestJS gRPC.url'),
      file('/Курс/Конспект.pdf'),
    ])

    const titles = result.sections[0].lessons[0].materials.map((m) => m.title)

    expect(titles).toContain('1 -NestJS gRPC.url')
    expect(titles).toContain('Конспект.pdf')
    expect(titles.some((t) => /eground|topkursy/i.test(t))).toBe(false)
  })

  it('ссылка на папку ведёт на её полный путь, а не на путь внутри курса', () => {
    // Курс импортируется из подпапки: у ссылки должен остаться путь от корня
    // публикации, иначе на Диске открывается 404 — так было с 11 ссылками.
    const items = [
      dir('/purple/Bash скрипты'),
      file('/purple/Bash скрипты/1.mp4'),
      dir('/purple/Bash скрипты/[eground.org] code'),
    ]
    for (let i = 0; i < 20; i++) {
      items.push(file(`/purple/Bash скрипты/[eground.org] code/file${i}.sh`))
    }

    const result = parseYandexDiskTree(items, { basePath: '/purple/Bash скрипты' })
    const folder = result.sections[0].lessons[0].materials.find((m) =>
      m.title.includes('папка на Диске'),
    )

    expect(folder?.path).toBe('/purple/Bash скрипты/[eground.org] code')
  })

  it('когда ссылок всё равно много, россыпь файлов заменяется их папкой', () => {
    const items = [dir('/Блок'), file('/Блок/1.mp4')]
    for (let i = 0; i < 20; i++) {
      items.push(dir(`/Блок/материалы${i}`), file(`/Блок/материалы${i}/файл${i}.png`))
    }

    const result = parseYandexDiskTree(items)
    const materials = result.sections[0].lessons[0].materials

    expect(materials.length).toBeLessThanOrEqual(13)
    expect(materials[materials.length - 1].title).toContain('папка на Диске')
  })
})

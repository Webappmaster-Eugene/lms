/**
 * Парсер именования видео-файлов из Яндекс.Диска.
 *
 * Конвенция: "X.Y - Название видео.mp4"
 * X = номер секции
 * Y = порядок урока в секции
 *
 * Поддерживаемые форматы:
 * - "1.1 - Введение.mp4"
 * - "01.02 - Название.mp4"
 * - "1.1 Название.mp4" (без тире)
 * - "2.10 — Длинное название урока.mov"
 */

import type { YandexDiskItem } from './yandex-disk'

export type ParsedVideo = {
  sectionNumber: number
  lessonOrder: number
  title: string
  originalName: string
  publicUrl: string
  path: string
}

export type ParsedSection = {
  sectionNumber: number
  title: string
  lessons: ParsedLesson[]
}

export type ParsedLesson = {
  order: number
  title: string
  originalName: string
  publicUrl: string
  path: string
}

/**
 * Парсит имя файла и извлекает номер секции, порядок урока и название.
 * Возвращает null если имя не соответствует конвенции.
 */
export function parseVideoFilename(name: string): ParsedVideo | null {
  // Убираем расширение файла
  const nameWithoutExt = name.replace(/\.\w{2,5}$/, '')

  // Паттерн: "X.Y - Название" или "X.Y Название"
  // Поддерживает различные виды тире: -, –, —
  const match = nameWithoutExt.match(/^(\d+)\.(\d+)\s*[-–—]?\s*(.+)$/)

  if (!match) return null

  const sectionNumber = parseInt(match[1], 10)
  const lessonOrder = parseInt(match[2], 10)
  const title = match[3].trim()

  if (isNaN(sectionNumber) || isNaN(lessonOrder) || !title) return null

  return {
    sectionNumber,
    lessonOrder,
    title,
    originalName: name,
    publicUrl: '',
    path: '',
  }
}

/**
 * Группирует видео-файлы в секции на основе номера секции.
 * Имена секций деривируются из номера: "Раздел N".
 */
export function groupIntoSections(videos: ParsedVideo[]): ParsedSection[] {
  const sectionMap = new Map<number, ParsedVideo[]>()

  for (const video of videos) {
    const existing = sectionMap.get(video.sectionNumber) ?? []
    existing.push(video)
    sectionMap.set(video.sectionNumber, existing)
  }

  const sections: ParsedSection[] = []

  for (const [sectionNumber, sectionVideos] of sectionMap) {
    // Сортируем уроки по порядку
    sectionVideos.sort((a, b) => a.lessonOrder - b.lessonOrder)

    sections.push({
      sectionNumber,
      title: `Раздел ${sectionNumber}`,
      lessons: sectionVideos.map((v) => ({
        order: v.lessonOrder,
        title: v.title,
        originalName: v.originalName,
        publicUrl: v.publicUrl,
        path: v.path,
      })),
    })
  }

  // Сортируем секции по номеру
  sections.sort((a, b) => a.sectionNumber - b.sectionNumber)

  return sections
}

/**
 * Парсит список файлов Яндекс.Диска и группирует в секции с уроками.
 *
 * Обрабатывает два сценария:
 * 1. Flat: все файлы в корне (группировка по первому числу "X.Y")
 * 2. Nested: подпапки с файлами (имена подпапок = названия секций)
 */
export function parseYandexDiskFolder(
  items: YandexDiskItem[],
  publicFolderUrl: string,
): ParseResult {
  const errors: string[] = []
  const parsedVideos: ParsedVideo[] = []

  for (const item of items) {
    if (item.type !== 'file') continue

    const parsed = parseVideoFilename(item.name)

    if (!parsed) {
      errors.push(`Пропущен файл "${item.name}": не соответствует формату "X.Y - Название"`)
      continue
    }

    parsed.publicUrl = item.public_url ?? publicFolderUrl
    parsed.path = item.path

    parsedVideos.push(parsed)
  }

  if (parsedVideos.length === 0) {
    errors.push('Не найдено видео-файлов, соответствующих формату "X.Y - Название"')
    return { sections: [], errors, totalVideos: 0 }
  }

  // Проверяем дубликаты (одинаковые section.lesson)
  const seen = new Set<string>()
  for (const video of parsedVideos) {
    const key = `${video.sectionNumber}.${video.lessonOrder}`
    if (seen.has(key)) {
      errors.push(`Дубликат нумерации: "${video.originalName}" (${key}) — будет пропущен`)
    }
    seen.add(key)
  }

  // Убираем дубликаты (оставляем первый)
  const uniqueVideos = parsedVideos.filter((video) => {
    const key = `${video.sectionNumber}.${video.lessonOrder}`
    const firstIndex = parsedVideos.findIndex(
      (v) => v.sectionNumber === video.sectionNumber && v.lessonOrder === video.lessonOrder,
    )
    return parsedVideos.indexOf(video) === firstIndex
  })

  const sections = groupIntoSections(uniqueVideos)

  return {
    sections,
    errors,
    totalVideos: uniqueVideos.length,
  }
}

export type ParseResult = {
  sections: ParsedSection[]
  errors: string[]
  totalVideos: number
}

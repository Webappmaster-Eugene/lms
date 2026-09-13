import { describe, it, expect } from 'vitest'

import { applyCurriculum, COURSE_CURRICULA } from '@/lib/course-curricula'
import type { ImportedSection } from '@/lib/yandex-disk-structure'

function lesson(order: number, title: string) {
  return { order, title, videos: [], materials: [], hasGeneratedTitle: true }
}

function section(title: string, count: number, from = 1): ImportedSection {
  return {
    order: 1,
    title,
    lessons: Array.from({ length: count }, (_, i) => lesson(from + i, `Урок ${from + i}`)),
  }
}

describe('полная программа курса', () => {
  it('раскладывает уроки по модулям программы и подписывает их', () => {
    const parsed = [section('Уроки 1–161', 161)]

    const { sections, warnings } = applyCurriculum('nextjs-14', parsed)

    expect(warnings).toEqual([])
    expect(sections).toHaveLength(19)
    expect(sections[0].title).toBe('Введение')
    expect(sections[0].lessons[0].title).toBe('Преимушества NextJS')
    expect(sections.reduce((sum, s) => sum + s.lessons.length, 0)).toBe(161)
    expect(sections[1].lessons.map((l) => l.order)).toEqual([1, 2, 3])
  })

  it('при расхождении числа уроков программа не применяется', () => {
    const parsed = [section('Уроки 1–100', 100)]

    const { sections, warnings } = applyCurriculum('nextjs-14', parsed)

    expect(sections).toBe(parsed)
    expect(warnings[0]).toContain('161')
  })

  it('видео и материалы урока сохраняются при переносе в модуль', () => {
    const parsed = [section('Уроки 1–161', 161)]
    parsed[0].lessons[0].videos.push({ title: '', path: '/lesson1.mp4', part: null })

    const { sections } = applyCurriculum('nextjs-14', parsed)

    expect(sections[0].lessons[0].videos[0].path).toBe('/lesson1.mp4')
  })
})

describe('точечные названия', () => {
  it('подставляются по номеру урока внутри секции', () => {
    const parsed = [section('Архитектура Redux', 3)]

    const { sections } = applyCurriculum('frontend-architecture-paromov', parsed)

    expect(sections[0].lessons.map((l) => l.title)).toEqual([
      'О чём будет курс',
      'Что такое Redux',
      'Урок 3',
    ])
  })

  it('секции и курсы без программы остаются нетронутыми', () => {
    const parsed = [section('Неизвестная секция', 2)]

    expect(applyCurriculum('frontend-architecture-paromov', parsed).sections[0].lessons[0].title).toBe('Урок 1')
    expect(applyCurriculum('курс-без-программы', parsed).sections).toBe(parsed)
  })
})

describe('данные программы', () => {
  it('в программе Next.js ровно 161 урок — столько же файлов на диске', () => {
    const nextjs = COURSE_CURRICULA['nextjs-14'].syllabus!
    const total = nextjs.sections.reduce((sum, s) => sum + s.lessons.length, 0)

    expect(total).toBe(161)
    expect(nextjs.sections).toHaveLength(19)
  })

  it('названия не содержат номеров и технических пометок', () => {
    const titles = Object.values(COURSE_CURRICULA)
      .flatMap((c) => [
        ...(c.syllabus?.sections.flatMap((s) => [s.title, ...s.lessons]) ?? []),
        ...Object.values(c.names ?? {}).flatMap((names) => Object.values(names)),
      ])

    expect(titles.filter((t) => /^\d+[.\s]/.test(t))).toEqual([])
    expect(titles.filter((t) => /\[[^\]]*\]/.test(t))).toEqual([])
  })
})

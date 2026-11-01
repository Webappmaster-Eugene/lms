import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { TRAINER_CATALOG } from '@/data/trainer'
import { buildLesson, openExampleRunner, readLessons, readManifest, sqlTaskLinks } from '../../../scripts/lib/sql-course'

/**
 * Курс «SQL и PostgreSQL с нуля» собирается из content/sql-course так же, как при
 * публикации: примеры выполняются, результаты подставляются, практика связывается
 * с тренажёром. Сломанный пример или ссылка не дойдут до учеников.
 */

const manifest = readManifest()
const sections = readLessons(manifest)
const lessons = sections.flatMap((item) => item.lessons)
const links = sqlTaskLinks(TRAINER_CATALOG)
const built = new Map<string, string>()
// Правило владельца: короткий дефис, без эмодзи; блоки кода не проверяются.
const DASH = /[—–]/
const EMOJI = /\p{Extended_Pictographic}/u
const prose = (markdown: string) => markdown.replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm, '').replace(/`[^`]+`/g, '')

let runner: Awaited<ReturnType<typeof openExampleRunner>>

beforeAll(async () => {
  runner = await openExampleRunner()
  for (const lesson of lessons) built.set(lesson.slug, await buildLesson(lesson, runner, links))
}, 600_000)

afterAll(async () => {
  await runner?.close()
})

describe('курс SQL', () => {
  it('курс закрыт по назначению и описан полностью', () => {
    expect(manifest.slug).toMatch(/^[a-z0-9-]+$/)
    expect(manifest.title.length).toBeGreaterThan(5)
    expect(manifest.sections.length).toBeGreaterThan(0)
    expect(manifest.description.join(' ').length).toBeGreaterThan(40)
  })

  it('slug разделов и уроков уникальны и в латинице', () => {
    const slugs = [...manifest.sections.map((item) => item.slug), ...lessons.map((item) => item.slug)]
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) expect(slug).toMatch(/^sql-[a-z0-9-]+$/)
  })

  it('описания укладываются в поля LMS', () => {
    for (const section of manifest.sections) expect(section.description.length, section.slug).toBeLessThanOrEqual(500)
    for (const lesson of lessons) expect(lesson.description.length, lesson.slug).toBeLessThanOrEqual(300)
  })

  it('все уроки собираются: примеры выполняются, ссылки на задачи существуют', () => {
    expect(built.size).toBe(lessons.length)
    for (const markdown of built.values()) expect(markdown).not.toMatch(/```sql run=/)
  })

  it('каждая SQL-задача тренажёра стоит в практике хотя бы одного урока', () => {
    const linked = new Set(lessons.flatMap((lesson) => lesson.tasks))
    expect([...links.keys()].filter((slug) => !linked.has(slug))).toEqual([])
  })

  it('задача не повторяется в практике разных уроков', () => {
    const seen = new Map<string, string>()
    const repeated: string[] = []
    for (const lesson of lessons) for (const slug of lesson.tasks) {
      if (seen.has(slug)) repeated.push(`${slug}: ${seen.get(slug)} и ${lesson.slug}`)
      seen.set(slug, lesson.slug)
    }
    expect(repeated).toEqual([])
  })

  it('в текстах короткий дефис и нет эмодзи', () => {
    const found = lessons.filter((lesson) => [lesson.title, lesson.description, prose(lesson.body)].some((text) => DASH.test(text) || EMOJI.test(text))).map((lesson) => lesson.slug)
    const meta = [manifest.title, ...manifest.description, ...manifest.sections.flatMap((item) => [item.title, item.description])].filter((text) => DASH.test(text) || EMOJI.test(text))
    expect([...found, ...meta]).toEqual([])
  })

  it('урок начинается с текста, а не с заголовка: заголовок урока показывает LMS', () => {
    for (const lesson of lessons) expect(lesson.body.startsWith('#'), lesson.slug).toBe(false)
  })
})

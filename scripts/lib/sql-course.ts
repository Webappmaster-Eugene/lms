/**
 * Сборка курса «SQL и PostgreSQL с нуля» из content/sql-course.
 *
 * Урок - Markdown со строгой шапкой. Примеры в блоках ```sql run=<набор> выполняются
 * настоящим PostgreSQL (PGlite), и под примером появляется фактический результат:
 * таблицы в уроках не пишутся руками и не расходятся с запросами. Блок ```tables <набор>
 * разворачивается в таблицы набора данных. В конце урока добавляется раздел «Практика»
 * со ссылками на задачи тренажёра.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

import { SQL_DATASETS } from '@/data/trainer/sql/datasets'
import { fixtureMarkdown, markdownCellText, setupSql } from '@/data/trainer/sql/fixture'
import type { TrainerTopicSeed } from '@/data/trainer/types'
import { describeError, prepareCase } from '../../trainer-runtime/sql-engine.mjs'
import { normalizeCell, rowsLabel } from '../../trainer-runtime/sql-result.mjs'

export const COURSE_DIR = path.resolve(import.meta.dirname, '../../content/sql-course')
const EXAMPLE_ROWS = 15

export type CourseSection = { slug: string; title: string; description: string; lessons: string[] }
export type CourseManifest = { slug: string; title: string; roadmap: string; roadmapNode?: string; order: number; estimatedHours: number; description: string[]; sections: CourseSection[] }
export type LessonSource = { file: string; title: string; slug: string; minutes: number; description: string; tasks: string[]; body: string }

export function readManifest(dir = COURSE_DIR): CourseManifest {
  return JSON.parse(readFileSync(path.join(dir, 'course.json'), 'utf8')) as CourseManifest
}

const HEADER_KEYS = ['title', 'slug', 'minutes', 'description', 'tasks'] as const

/** Шапка строгая: ключ: значение, задачи через запятую. Опечатка в ключе - ошибка, а не тихо пропущенное поле. */
export function parseLesson(file: string, text: string): LessonSource {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (!match) throw new Error(`${file}: нет шапки --- ... ---`)
  const header: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const pair = /^([a-z]+):\s*(.*)$/.exec(line)
    if (!pair || !(HEADER_KEYS as readonly string[]).includes(pair[1])) throw new Error(`${file}: непонятная строка шапки «${line}»`)
    header[pair[1]] = pair[2].trim()
  }
  for (const key of ['title', 'slug', 'minutes', 'description'] as const) if (!header[key]) throw new Error(`${file}: в шапке нет ${key}`)
  const minutes = Number(header.minutes)
  if (!Number.isInteger(minutes) || minutes < 3 || minutes > 120) throw new Error(`${file}: minutes должно быть целым от 3 до 120`)
  return {
    file,
    title: header.title,
    slug: header.slug,
    minutes,
    description: header.description,
    tasks: header.tasks ? header.tasks.split(',').map((slug) => slug.trim()).filter(Boolean) : [],
    body: text.slice(match[0].length).trim(),
  }
}

export function readLessons(manifest: CourseManifest, dir = COURSE_DIR): Array<{ section: CourseSection; lessons: LessonSource[] }> {
  return manifest.sections.map((section) => ({
    section,
    lessons: section.lessons.map((file) => parseLesson(file, readFileSync(path.join(dir, 'lessons', file), 'utf8'))),
  }))
}

type ExampleResult = { status: 'ok'; columns: string[]; rows: string[][]; affected?: number } | { status: 'empty'; affected?: number } | { status: 'error'; error: string }

/** Один экземпляр на сборку: перед примером схема сбрасывается, как в генераторе ожиданий. */
export async function openExampleRunner() {
  const db = new PGlite()
  await db.waitReady
  const reset = async () => {
    await db.exec('ROLLBACK')
    await db.exec('DISCARD ALL')
    await db.exec(`DO $$ DECLARE item record; BEGIN FOR item IN SELECT nspname FROM pg_namespace WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND nspname NOT LIKE 'pg_temp_%' AND nspname NOT LIKE 'pg_toast_temp_%' LOOP EXECUTE format('DROP SCHEMA %I CASCADE', item.nspname); END LOOP; END $$; CREATE SCHEMA public;`)
  }
  return {
    async run(dataset: string, code: string): Promise<ExampleResult> {
      await reset()
      const fixture = dataset === 'empty' ? null : SQL_DATASETS[dataset as keyof typeof SQL_DATASETS]
      if (dataset !== 'empty' && !fixture) throw new Error(`Неизвестный набор данных «${dataset}»`)
      const parsers = await prepareCase(db, fixture ? setupSql(fixture) : '')
      try {
        const results = await db.exec(code, { parsers, rowMode: 'array' })
        const last = [...results].reverse().find((item) => item.fields.length > 0)
        const affected = results.at(-1)?.affectedRows
        if (!last) return { status: 'empty', ...(affected ? { affected } : {}) }
        return {
          status: 'ok',
          columns: last.fields.map((field) => field.name),
          rows: (last.rows as unknown[][]).map((row) => row.map((value, index) => normalizeCell(value as string | null, last.fields[index].dataTypeID))),
        }
      } catch (error) {
        return { status: 'error', error: describeError(error, code).error }
      }
    },
    close: () => db.close(),
  }
}

type ExampleRunner = Awaited<ReturnType<typeof openExampleRunner>>

function markdownTable(columns: string[], rows: string[][]): string {
  const cell = markdownCellText
  const shown = rows.slice(0, EXAMPLE_ROWS)
  const lines = [`| ${columns.map(cell).join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`, ...shown.map((row) => `| ${row.map(cell).join(' | ')} |`)]
  const rest = rows.length - shown.length
  return `${lines.join('\n')}\n\n${rest > 0 ? `Первые ${shown.length} строк из ${rows.length}.` : `Результат: ${rowsLabel(rows.length)}.`}`
}

const FENCE = /^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm

/** Готовый Markdown урока. Ошибка в примере, который не помечен как ошибочный, останавливает сборку. */
export async function buildLesson(lesson: LessonSource, runner: ExampleRunner, taskLinks: ReadonlyMap<string, { title: string; href: string }>): Promise<string> {
  const parts: string[] = []
  let cursor = 0
  for (const match of lesson.body.matchAll(FENCE)) {
    const [whole, info, code] = match
    parts.push(lesson.body.slice(cursor, match.index))
    cursor = (match.index ?? 0) + whole.length
    const words = info.trim().split(/\s+/)
    if (words[0] === 'tables') {
      const fixture = SQL_DATASETS[words[1] as keyof typeof SQL_DATASETS]
      if (!fixture) throw new Error(`${lesson.file}: неизвестный набор в блоке tables: ${words[1]}`)
      parts.push(fixtureMarkdown(fixture, words.length > 2 ? words.slice(2) : undefined))
      continue
    }
    const run = words.find((word) => word.startsWith('run='))
    if (words[0] !== 'sql' || !run) {
      parts.push(whole)
      continue
    }
    const expectError = words.includes('error')
    const result = await runner.run(run.slice(4), code)
    parts.push(`\`\`\`sql\n${code}\`\`\``)
    if (result.status === 'error') {
      if (!expectError) throw new Error(`${lesson.file}: пример завершился ошибкой: ${result.error}\n${code}`)
      parts.push(`\n\nPostgreSQL ответит ошибкой:\n\n\`\`\`text\n${result.error}\n\`\`\``)
    } else {
      if (expectError) throw new Error(`${lesson.file}: пример помечен error, но выполнился без ошибки\n${code}`)
      parts.push(result.status === 'ok' ? `\n\n${markdownTable(result.columns, result.rows)}` : `\n\nЗапрос выполнен${result.affected ? `, затронуто строк: ${result.affected}` : ''}.`)
    }
  }
  parts.push(lesson.body.slice(cursor))
  let markdown = parts.join('').trim()
  if (lesson.tasks.length) {
    const links = lesson.tasks.map((slug) => {
      const link = taskLinks.get(slug)
      if (!link) throw new Error(`${lesson.file}: задачи ${slug} нет в каталоге тренажёра`)
      return `- [${link.title}](${link.href})`
    })
    markdown += `\n\n## Практика\n\nЗадачи по теме урока в тренажёре. Решение проверяется на этих данных и на скрытых наборах.\n\n${links.join('\n')}`
  }
  return `${markdown}\n`
}

export function sqlTaskLinks(catalog: readonly TrainerTopicSeed[]): Map<string, { title: string; href: string }> {
  return new Map(catalog.filter((topic) => topic.category === 'sql').flatMap((topic) => topic.tasks.map((task) => [task.slug, { title: task.title, href: `/trainer/${topic.slug}/${task.slug}` }] as const)))
}

/** Весь курс в готовом виде: план, исходники уроков и собранный Markdown. */
export async function buildCourse(catalog: readonly TrainerTopicSeed[], dir = COURSE_DIR) {
  const manifest = readManifest(dir)
  const parts = readLessons(manifest, dir)
  const links = sqlTaskLinks(catalog)
  const runner = await openExampleRunner()
  const built = new Map<string, string>()
  try {
    for (const { lessons } of parts) for (const lesson of lessons) built.set(lesson.slug, await buildLesson(lesson, runner, links))
  } finally {
    await runner.close()
  }
  return { manifest, parts, built }
}

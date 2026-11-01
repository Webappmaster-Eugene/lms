/**
 * Проверка части SQL-курса без записи файлов: эталоны задач темы и сборка уроков раздела.
 *
 *   pnpm sql:check --topic sql-where --section sql-where [--out папка]
 *
 * Те же проверки, что в tests/unit/trainer/sqlCatalog.test.ts и tests/unit/content/sqlCourse.test.ts,
 * но только для выбранной темы и раздела. --out сохраняет собранные уроки для вычитки.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import type { TrainerTopicSeed } from '@/data/trainer/types'
import { ROW_PERMUTATIONS, setupSql, type RowPermutation } from '@/data/trainer/sql/fixture'
import { SQL_TASK_SOURCES } from '@/data/trainer/sql/task'
import { computeSqlExpected, openSqlRunner } from './lib/sql-catalog'
import { buildLesson, COURSE_DIR, openExampleRunner, parseLesson, readManifest, sqlTaskLinks } from './lib/sql-course'

const { values } = parseArgs({ options: { topic: { type: 'string', multiple: true }, section: { type: 'string', multiple: true }, out: { type: 'string' } } })
const topics = values.topic ?? []
const sectionSlugs = values.section ?? []
if (!topics.length && !sectionSlugs.length) {
  process.stderr.write('Укажите --topic <slug> и/или --section <slug>\n')
  process.exit(2)
}

const DASH = /[—–]/
const EMOJI = /\p{Extended_Pictographic}/u
const VOLATILE = /\b(now|random|setseed|current_date|current_time|current_timestamp|localtime|localtimestamp|clock_timestamp|statement_timestamp|transaction_timestamp|timeofday|gen_random_uuid|txid_current|pg_backend_pid)\b/i
const prose = (markdown = '') => markdown.replace(/^[ \t]*```[^\n]*\n[\s\S]*?^[ \t]*```[ \t]*$/gm, '').replace(/`[^`]+`/g, '')
const problems: string[] = []

// Загружаются только запрошенные темы: незаконченный файл соседней темы не ломает проверку.
const TOPICS_DIR = path.resolve(import.meta.dirname, '../src/data/trainer/sql/topics')
const selected: TrainerTopicSeed[] = []
for (const slug of topics) {
  const file = readdirSync(TOPICS_DIR).find((name) => readFileSync(path.join(TOPICS_DIR, name), 'utf8').includes(`slug: '${slug}',\n  title:`))
  if (!file) { problems.push(`тема ${slug} не найдена в ${TOPICS_DIR}`); continue }
  const loaded = Object.values(await import(pathToFileURL(path.join(TOPICS_DIR, file)).href) as Record<string, TrainerTopicSeed>)
  const topic = loaded.find((item) => item?.slug === slug)
  if (topic) selected.push(topic)
  else problems.push(`${file}: не экспортирует тему ${slug}`)
}
const tasks = selected.flatMap((topic) => topic.tasks)

const runner = await openSqlRunner()
try {
  const { expected, failures } = await computeSqlExpected(runner, tasks)
  problems.push(...failures.map((item) => `эталон: ${item}`))
  for (const task of tasks) {
    const source = SQL_TASK_SOURCES.get(task.slug)
    if (!source) { problems.push(`${task.slug}: задача объявлена не через sqlTask`); continue }
    const tables = expected[task.slug] ?? []
    if (tables.length > 1 && tables.slice(1).some((table) => table === tables[0])) problems.push(`${task.slug}: скрытый набор даёт тот же ответ, что открытый - поменяйте условие или данные`)
    if (VOLATILE.test(task.solutionCode) || VOLATILE.test(task.sqlCheck ?? '')) problems.push(`${task.slug}: эталон использует текущее время или случайность`)
    const texts = [task.title, prose(task.descriptionMd), prose(task.solutionNotes), ...(task.hints ?? [])]
    if (texts.some((text) => DASH.test(text) || EMOJI.test(text))) problems.push(`${task.slug}: длинное тире или эмодзи в тексте`)
    for (let variant = 0; variant < tables.length; variant += 1) {
      for (const permutation of Object.keys(ROW_PERMUTATIONS) as RowPermutation[]) {
        const outcome = await runner.run({ setup: setupSql(source.fixture, variant, { permutation }), code: task.solutionCode, check: task.sqlCheck, ordered: task.sqlOrdered })
        if (outcome.table !== tables[variant]) {
          problems.push(`${task.slug}: ответ зависит от порядка строк (набор ${variant}, ${permutation}) - добавьте второй ключ сортировки или уточните условие`)
          break
        }
      }
    }
    const starter = await runner.run({ setup: task.runtimeCases?.[0]?.input ?? '', code: task.starterCode, check: task.sqlCheck, ordered: task.sqlOrdered })
    if (starter.table === tables[0]) problems.push(`${task.slug}: стартовый шаблон уже проходит проверку`)
  }
  process.stdout.write(`Задач проверено: ${tasks.length}\n`)
} finally {
  await runner.close()
}

if (sectionSlugs.length) {
  const manifest = readManifest()
  const links = sqlTaskLinks(selected)
  const examples = await openExampleRunner()
  try {
    const sections = manifest.sections.filter((section) => sectionSlugs.includes(section.slug))
    for (const slug of sectionSlugs) if (!sections.some((section) => section.slug === slug)) problems.push(`раздел ${slug} не найден в course.json`)
    const lessons = sections.flatMap((section) => section.lessons.flatMap((file) => {
      try {
        return [parseLesson(file, readFileSync(path.join(COURSE_DIR, 'lessons', file), 'utf8'))]
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
        return []
      }
    }))
    let count = 0
    for (const lesson of lessons) {
      count += 1
      if (lesson.description.length > 300) problems.push(`${lesson.file}: описание длиннее 300 знаков`)
      if ([lesson.title, lesson.description, prose(lesson.body)].some((text) => DASH.test(text) || EMOJI.test(text))) problems.push(`${lesson.file}: длинное тире или эмодзи в тексте`)
      try {
        const markdown = await buildLesson(lesson, examples, links)
        if (values.out) {
          mkdirSync(values.out, { recursive: true })
          writeFileSync(path.join(values.out, `${lesson.slug}.md`), `# ${lesson.title}\n\n${markdown}`)
        }
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
      }
    }
    const linked = new Set(lessons.flatMap((lesson) => lesson.tasks))
    for (const task of tasks) if (!linked.has(task.slug)) problems.push(`${task.slug}: задача не стоит в практике ни одного урока выбранных разделов`)
    process.stdout.write(`Уроков собрано: ${count}\n`)
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error))
  } finally {
    await examples.close()
  }
}

if (problems.length) {
  process.stderr.write(`Найдено проблем: ${problems.length}\n${problems.map((item) => `- ${item}`).join('\n')}\n`)
  process.exitCode = 1
} else process.stdout.write('Всё в порядке\n')

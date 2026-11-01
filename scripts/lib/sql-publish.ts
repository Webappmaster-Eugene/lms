/**
 * Загрузка SQL-тем тренажёра и курса «SQL и PostgreSQL с нуля» в LMS через REST под админом.
 * Записи ищутся по slug: повторный запуск меняет только изменившееся. Темы и курс закрыты по
 * назначению; новое создаётся черновиком и публикуется только флагом publish.
 */
import { buildTaskData } from '@/data/trainer/seed-document'
import type { TrainerTopicSeed } from '@/data/trainer/types'
import { changedKeys, relationId, type LmsClient, type LmsDoc } from './lms-rest'
import type { CourseManifest, CourseSection, LessonSource } from './sql-course'

export type PublishOptions = { dryRun: boolean; publish: boolean; log?: (line: string) => void }
export type PublishCounts = { created: number; updated: number; unchanged: number }

function writer(lms: LmsClient, options: PublishOptions) {
  const log = options.log ?? ((line: string) => process.stdout.write(line))
  const counts: PublishCounts = { created: 0, updated: 0, unchanged: 0 }

  async function findOne(collection: string, slug: string): Promise<LmsDoc | null> {
    const docs = await lms.findAll(collection, `where[slug][equals]=${encodeURIComponent(slug)}`)
    if (docs.length > 1) throw new Error(`${collection}: несколько записей со slug «${slug}»`)
    return docs[0] ?? null
  }

  async function upsert(collection: string, doc: LmsDoc | null, wanted: Record<string, unknown>, label: string, diff: (doc: LmsDoc) => string[] = (current) => changedKeys(current, wanted)): Promise<LmsDoc> {
    if (!doc) {
      counts.created += 1
      log(`  + ${label}\n`)
      return options.dryRun ? { id: -1, ...wanted } : (await lms.api<{ doc: LmsDoc }>('POST', `/${collection}`, wanted)).doc
    }
    const changed = diff(doc)
    if (!changed.length) {
      counts.unchanged += 1
      return doc
    }
    counts.updated += 1
    log(`  ~ ${label}: ${changed.join(', ')}\n`)
    return options.dryRun ? { ...doc, ...wanted } : (await lms.api<{ doc: LmsDoc }>('PATCH', `/${collection}/${doc.id}`, wanted)).doc
  }

  return { log, counts, findOne, upsert }
}

/** Только темы категории sql и их задачи; остальной каталог не трогается. */
export async function publishSqlTrainer(lms: LmsClient, topics: readonly TrainerTopicSeed[], options: PublishOptions): Promise<PublishCounts> {
  if (!topics.length) throw new Error('В каталоге нет SQL-тем')
  for (const topic of topics) {
    if (topic.category !== 'sql') throw new Error(`Тема ${topic.slug} не из категории sql`)
    if (topic.assignedOnly !== true) throw new Error(`Тема ${topic.slug} не закрыта по назначению: публикация остановлена`)
  }
  // Пустое ожидание делает задачу нерешаемой: сервер его не отличит от верного пустого вывода.
  const unsolvable = topics.flatMap((topic) => topic.tasks).filter((task) => !task.runtimeCases?.length || task.runtimeCases.some((item) => !item.expected))
  if (unsolvable.length) throw new Error(`нет ожидаемых таблиц у задач: ${unsolvable.slice(0, 5).map((task) => task.slug).join(', ')}${unsolvable.length > 5 ? ` и ещё ${unsolvable.length - 5}` : ''}. Запустите pnpm trainer:sql-expected`)
  const { log, counts, findOne, upsert } = writer(lms, options)
  log(`${options.dryRun ? 'Проверка без записи' : 'Загрузка'}: ${lms.base}, тем ${topics.length}, задач ${topics.reduce((sum, topic) => sum + topic.tasks.length, 0)}${options.publish ? ', с публикацией' : ''}\n`)
  const planned = new Set(topics.flatMap((topic) => topic.tasks.map((task) => task.slug)))

  for (const topic of topics) {
    const existing = await findOne('trainer-topics', topic.slug)
    // Поиск идёт по slug: чужую тему с тем же адресом не переносим в SQL и не перезаписываем.
    if (existing && existing.category !== 'sql') throw new Error(`тема ${topic.slug} уже есть в LMS, но не из категории sql: публикация остановлена`)
    // Тема публикуется только после проверки флажка и загрузки задач: иначе на время запуска она видна всем или пустая.
    const saved = await upsert('trainer-topics', existing, {
      title: topic.title, slug: topic.slug, description: topic.description, category: topic.category, order: topic.order, assignedOnly: true,
      isPublished: existing?.isPublished === true,
    }, `тема «${topic.title}»`)
    // Код LMS без поля assignedOnly молча отбросил бы его, и тема открылась бы всем.
    if (!options.dryRun && (await lms.api<LmsDoc>('GET', `/trainer-topics/${saved.id}?depth=0`)).assignedOnly !== true) {
      throw new Error(`LMS не сохранила «только по назначению» у темы ${topic.slug}: нужен выкат кода SQL-тренажёра`)
    }
    for (const [index, task] of topic.tasks.entries()) {
      const current = await findOne('trainer-tasks', task.slug)
      if (current && !(Array.isArray(current.languages) && current.languages.includes('sql'))) throw new Error(`задача ${task.slug} уже есть в LMS, но не на SQL: публикация остановлена`)
      const data = buildTaskData(task, saved.id, index + 1) as unknown as Record<string, unknown>
      // Lexical-описание каталог заполняет заголовком: у существующей задачи его не перезаписываем.
      const { description: _description, ...rest } = data
      await upsert('trainer-tasks', current, { ...(current ? rest : data), isPublished: options.publish || current?.isPublished === true }, `${topic.slug} / ${task.slug}`)
    }
    if (options.publish && saved.isPublished !== true) {
      counts.updated += 1
      log(`  ~ тема «${topic.title}»: публикация\n`)
      if (!options.dryRun) await lms.api('PATCH', `/trainer-topics/${saved.id}`, { isPublished: true })
    }
  }

  const sqlTopicIds = new Set((await lms.findAll('trainer-topics', 'where[category][equals]=sql')).map((doc) => doc.id))
  const stale = (await lms.findAll('trainer-tasks', 'where[languages][in]=sql')).filter((doc) => sqlTopicIds.has(Number(relationId(doc.topic))) && !planned.has(String(doc.slug)))
  for (const doc of stale) log(`! задача ${String(doc.slug)} есть в LMS, но не в каталоге - не трогаю\n`)
  log(`Готово${options.dryRun ? ' (без записи)' : ''}: создано ${counts.created}, обновлено ${counts.updated}, без изменений ${counts.unchanged}.\n`)
  return counts
}

function lexical(paragraphs: readonly string[]) {
  return {
    root: {
      type: 'root', direction: 'ltr', format: '', indent: 0, version: 1,
      children: paragraphs.map((text) => ({
        type: 'paragraph', direction: 'ltr', format: '', indent: 0, version: 1, textFormat: 0, textStyle: '',
        children: [{ type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '', version: 1 }],
      })),
    },
  }
}
type LexicalState = { root?: { children?: Array<{ children?: Array<{ text?: string }> }> } }
const plainText = (state: unknown) => ((state as LexicalState)?.root?.children ?? []).map((node) => (node.children ?? []).map((child) => child.text ?? '').join('')).join('\n')

export type BuiltCourse = { manifest: CourseManifest; parts: Array<{ section: CourseSection; lessons: LessonSource[] }>; built: ReadonlyMap<string, string> }

/** Уроки - один markdown-блок; в «Управлении» такие блоки не правятся, обновление только отсюда. */
export async function publishSqlCourse(lms: LmsClient, { manifest, parts, built }: BuiltCourse, options: PublishOptions): Promise<PublishCounts> {
  const { log, counts, findOne, upsert } = writer(lms, options)
  log(`${options.dryRun ? 'Проверка без записи' : 'Публикация'}: ${lms.base}, разделов ${parts.length}, уроков ${built.size}\n`)

  const roadmap = await findOne('roadmaps', manifest.roadmap)
  if (!roadmap) throw new Error(`роадмап «${manifest.roadmap}» не найден`)
  let roadmapNode: number | null = null
  if (manifest.roadmapNode) {
    const nodes = await lms.findAll('roadmap-nodes', `where[roadmap][equals]=${roadmap.id}&where[nodeId][equals]=${encodeURIComponent(manifest.roadmapNode)}`)
    if (nodes.length !== 1) throw new Error(`узел «${manifest.roadmapNode}» в роадмапе «${manifest.roadmap}» не найден`)
    roadmapNode = nodes[0].id
  }

  // Задачи практики должны уже быть в LMS, а для открытого курса и опубликованы: иначе ссылки в уроках поведут на 404.
  const known = new Map((await lms.findAll('trainer-tasks', 'where[languages][in]=sql')).map((doc) => [String(doc.slug), doc.isPublished === true]))
  const linked = [...new Set(parts.flatMap(({ lessons }) => lessons.flatMap((lesson) => lesson.tasks)))]
  const listed = (slugs: string[]) => `${slugs.slice(0, 10).join(', ')}${slugs.length > 10 ? ` и ещё ${slugs.length - 10}` : ''}`
  const missing = linked.filter((slug) => !known.has(slug))
  if (missing.length) throw new Error(`в LMS нет задач тренажёра: ${listed(missing)}. Сначала pnpm sql:publish-trainer`)
  const drafts = linked.filter((slug) => known.get(slug) !== true)
  if (options.publish && drafts.length) throw new Error(`задачи практики ещё черновики: ${listed(drafts)}. Сначала pnpm sql:publish-trainer --publish`)

  let course = await findOne('courses', manifest.slug)
  if (course && course.assignedOnly !== true) throw new Error(`курс «${manifest.slug}» открыт не только по назначению: уроки туда не кладутся`)
  const courseWanted = {
    title: manifest.title, slug: manifest.slug, roadmap: roadmap.id, roadmapNode, order: manifest.order, estimatedHours: manifest.estimatedHours, assignedOnly: true, description: lexical(manifest.description),
  }
  // Описание сравнивается текстом: Lexical из базы приходит с другим порядком ключей.
  course = await upsert('courses', course, course ? courseWanted : { ...courseWanted, isPublished: false }, `курс «${manifest.title}»`, (doc) => [
    ...changedKeys(doc, courseWanted, ['description']),
    ...(plainText(doc.description) === manifest.description.join('\n') ? [] : ['description']),
  ])
  if (!options.dryRun && (await lms.api<LmsDoc>('GET', `/courses/${course.id}?depth=0`)).assignedOnly !== true) {
    throw new Error('LMS не сохранила «только по назначению»: курс не опубликован')
  }

  const sections = course.id > 0 ? await lms.findAll('sections', `where[course][equals]=${course.id}`) : []
  const lessons = course.id > 0 ? await lms.findAll('lessons', `where[course][equals]=${course.id}`) : []
  const sectionBySlug = new Map(sections.map((doc) => [String(doc.slug), doc]))
  const lessonBySlug = new Map(lessons.map((doc) => [String(doc.slug), doc]))
  const planned = new Set<string>()

  for (const [sectionIndex, { section, lessons: sources }] of parts.entries()) {
    log(`${section.title}\n`)
    const savedSection = await upsert('sections', sectionBySlug.get(section.slug) ?? null, {
      title: section.title, slug: section.slug, course: course.id, order: sectionIndex + 1, description: section.description, isPublished: true,
    }, 'раздел')
    for (const [index, source] of sources.entries()) {
      planned.add(source.slug)
      const existing = lessonBySlug.get(source.slug) ?? null
      const content = existing?.content as Array<{ id?: string; blockType?: string; markdown?: string; source?: string }> | undefined
      const block = content?.length === 1 && content[0].blockType === 'markdown' ? content[0] : null
      const markdown = built.get(source.slug)
      if (!markdown) throw new Error(`урок ${source.slug} не собран`)
      const sourceLabel = `sql-course/${source.file}`
      const wanted = {
        title: source.title, slug: source.slug, description: source.description, course: course.id, section: savedSection.id, order: index + 1, estimatedMinutes: source.minutes, isPublished: true,
        content: [{ ...(block?.id ? { id: block.id } : {}), blockType: 'markdown', markdown, source: sourceLabel }],
      }
      await upsert('lessons', existing, wanted, source.title, (doc) => {
        const diff = changedKeys(doc, wanted, ['content'])
        if (!block || block.markdown !== markdown || block.source !== sourceLabel) diff.push('content')
        return diff
      })
    }
  }

  for (const doc of lessons.filter((item) => !planned.has(String(item.slug)))) log(`! урок «${String(doc.title)}» (${String(doc.slug)}) не из content/sql-course - не трогаю\n`)

  if (options.publish && course.isPublished !== true) {
    log('  ~ курс: публикация\n')
    if (!options.dryRun) {
      await lms.api('PATCH', `/courses/${course.id}`, { isPublished: true })
      const check = await lms.api<LmsDoc>('GET', `/courses/${course.id}?depth=0`)
      if (check.isPublished !== true || check.assignedOnly !== true || relationId(check.roadmap) !== roadmap.id) throw new Error('после публикации курс не закрыт или не опубликован')
    }
  }
  log(`Готово${options.dryRun ? ' (без записи)' : ''}: создано ${counts.created}, обновлено ${counts.updated}, без изменений ${counts.unchanged}. Курс: ${lms.base}/courses/${manifest.slug}\n`)
  return counts
}

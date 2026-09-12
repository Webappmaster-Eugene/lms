import { NextResponse } from 'next/server'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import {
  buildPublicFileUrl,
  fetchFolderRecursive,
  fetchPublicTextFile,
  filterVideoFiles,
  parsePublicResourceUrl,
  YandexDiskError,
  type YandexDiskItem,
} from '@/lib/yandex-disk'
import { parseVideoFilename, parseYandexDiskFolder } from '@/lib/yandex-disk-parser'
import {
  parseYandexDiskTree,
  type ImportedLesson,
  type ImportedSection,
} from '@/lib/yandex-disk-structure'
import type { Lesson } from '@/payload-types'
import { withSpan, logger } from '@/lib/telemetry'

type LessonContent = NonNullable<Lesson['content']>
type LinkPlatform = NonNullable<Extract<LessonContent[number], { blockType: 'link' }>['platform']>

type ImportRequest = {
  publicUrl?: unknown
  courseId?: unknown
}

const MAX_SLUG_ATTEMPTS = 50

/**
 * POST /api/yandex-disk/import
 * Admin-only: импортирует структуру курса из публичной папки Яндекс.Диска.
 *
 * Импорт идемпотентен: секции и уроки ищутся по названию внутри курса,
 * повторный запуск обновляет содержимое, а не плодит копии.
 */
export async function POST(request: Request) {
  return withSpan('api.yandexDisk.import', {}, async () => {
    const payload = await getPayload({ config })

    const { user } = await payload.auth({ headers: request.headers })
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })
    }

    let body: ImportRequest
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Невалидный JSON' }, { status: 400 })
    }

    const publicUrl = typeof body.publicUrl === 'string' ? body.publicUrl.trim() : ''
    const courseId = toId(body.courseId)

    if (!publicUrl || courseId === null) {
      return NextResponse.json(
        { error: 'Обязательные поля: publicUrl, courseId' },
        { status: 400 },
      )
    }

    if (!parsePublicResourceUrl(publicUrl)) {
      return NextResponse.json(
        { error: 'Ссылка не похожа на публичную папку Яндекс.Диска' },
        { status: 400 },
      )
    }

    let course
    try {
      course = await payload.findByID({ collection: 'courses', id: courseId })
    } catch {
      return NextResponse.json({ error: 'Курс не найден' }, { status: 404 })
    }

    const importRecord = await payload.create({
      collection: 'yandex-disk-imports',
      data: {
        publicUrl,
        course: courseId,
        status: 'processing',
        importedBy: user.id,
        sectionsCreated: 0,
        lessonsCreated: 0,
      },
    })

    try {
      const token = process.env.YANDEX_DISK_TOKEN || undefined

      logger.info(`YD Import: читаем папку ${publicUrl}`)
      const items = await fetchFolderRecursive(publicUrl, { token })

      const structure = buildStructure(items, course.title)
      const warnings = [...structure.warnings]

      if (structure.sections.length === 0) {
        const reason = warnings.length > 0 ? warnings.join('\n') : 'Не удалось разобрать структуру папки'
        await updateImportStatus(payload, importRecord.id, 'failed', reason)

        return NextResponse.json(
          {
            error: 'В папке не найдено видео, подходящих под структуру курса',
            sectionsCreated: 0,
            lessonsCreated: 0,
            errors: warnings,
          },
          { status: 400 },
        )
      }

      const stats = { sectionsCreated: 0, sectionsUpdated: 0, lessonsCreated: 0, lessonsUpdated: 0 }
      const touchedLessonIds: number[] = []

      for (const section of structure.sections) {
        const sectionResult = await upsertSection(payload, courseId, course.slug, section)
        stats[sectionResult.created ? 'sectionsCreated' : 'sectionsUpdated']++

        for (const lesson of section.lessons) {
          const content = await buildLessonContent(lesson, publicUrl, token, warnings)

          const lessonResult = await upsertLesson(payload, {
            courseId,
            courseSlug: course.slug,
            sectionId: sectionResult.id,
            sectionTitle: section.title,
            lesson,
            content,
          })

          stats[lessonResult.created ? 'lessonsCreated' : 'lessonsUpdated']++
          touchedLessonIds.push(lessonResult.id)
        }
      }

      await warnAboutOrphans(payload, courseId, touchedLessonIds, warnings)

      await payload.update({
        collection: 'yandex-disk-imports',
        id: importRecord.id,
        data: {
          status: 'completed',
          sectionsCreated: stats.sectionsCreated,
          lessonsCreated: stats.lessonsCreated,
          errorLog: warnings.length > 0 ? warnings.join('\n') : undefined,
        },
      })

      logger.info(
        `YD Import завершён для курса "${course.title}": секций +${stats.sectionsCreated}/~${stats.sectionsUpdated}, ` +
          `уроков +${stats.lessonsCreated}/~${stats.lessonsUpdated}`,
      )

      return NextResponse.json({
        ...stats,
        errors: warnings,
        courseName: course.title,
      })
    } catch (err) {
      const message =
        err instanceof YandexDiskError || err instanceof Error ? err.message : 'Неизвестная ошибка'

      await updateImportStatus(payload, importRecord.id, 'failed', message)
      logger.error(`YD Import упал: ${message}`)

      return NextResponse.json({ error: message }, { status: 500 })
    }
  })
}

/**
 * Выбирает стратегию разбора: плоская конвенция "X.Y - Название" используется,
 * только если ей соответствуют все видео в корне публикации.
 */
function buildStructure(
  items: YandexDiskItem[],
  courseTitle: string,
): { sections: ImportedSection[]; warnings: string[] } {
  const rootVideos = filterVideoFiles(items.filter((item) => isRootLevel(item.path)))
  const isLegacyNaming =
    rootVideos.length > 0 && rootVideos.every((item) => parseVideoFilename(item.name) !== null)

  if (isLegacyNaming) {
    const legacy = parseYandexDiskFolder(rootVideos, '')

    return {
      warnings: legacy.errors,
      sections: legacy.sections.map((section, sectionIndex) => ({
        order: sectionIndex + 1,
        title: section.title,
        lessons: section.lessons.map((lesson, lessonIndex) => ({
          order: lessonIndex + 1,
          title: lesson.title,
          hasGeneratedTitle: false,
          materials: [],
          videos: [{ title: lesson.title, path: lesson.path, part: null }],
        })),
      })),
    }
  }

  const tree = parseYandexDiskTree(items, { rootTitle: courseTitle })
  return { sections: tree.sections, warnings: tree.warnings }
}

function isRootLevel(path: string): boolean {
  return path.replace(/^disk:/, '').replace(/^\/+/, '').split('/').length === 1
}

/** Собирает контент урока: сначала видео, затем материалы ссылками. */
async function buildLessonContent(
  lesson: ImportedLesson,
  publicUrl: string,
  token: string | undefined,
  warnings: string[],
): Promise<LessonContent> {
  const content: LessonContent = []

  for (const video of lesson.videos) {
    const url = buildPublicFileUrl(publicUrl, video.path)
    if (!url) {
      warnings.push(`Видео "${video.title}" пропущено: не удалось собрать ссылку`)
      continue
    }

    content.push({
      blockType: 'video',
      title: video.title,
      videoUrl: url,
      displayMode: 'embed',
    })
  }

  const seenUrls = new Set<string>()

  for (const material of lesson.materials) {
    const materialUrl = buildPublicFileUrl(publicUrl, material.path)
    if (!materialUrl) {
      warnings.push(`Материал "${material.title}" пропущен: не удалось собрать ссылку`)
      continue
    }

    // Текстовые файлы курса — это списки ссылок; разворачиваем их в сам урок,
    // чтобы студенту не приходилось качать txt ради одной ссылки.
    const extracted = material.isText
      ? await extractLinksFromTextFile(materialUrl, material.title, token, warnings)
      : []

    const blocks: LessonContent =
      extracted.length > 0
        ? extracted
        : [
            {
              blockType: 'link',
              title: material.title,
              url: materialUrl,
              platform: detectPlatform(materialUrl),
            },
          ]

    for (const block of blocks) {
      if (block.blockType !== 'link' || seenUrls.has(block.url)) continue
      seenUrls.add(block.url)
      content.push(block)
    }
  }

  return content
}

/** Достаёт ссылки из текстового материала; пустой результат — файл остаётся вложением. */
async function extractLinksFromTextFile(
  materialUrl: string,
  materialTitle: string,
  token: string | undefined,
  warnings: string[],
): Promise<LessonContent> {
  const ref = parsePublicResourceUrl(materialUrl)
  if (!ref) return []

  let text: string | null
  try {
    text = await fetchPublicTextFile(ref, { token })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    warnings.push(`Не удалось прочитать "${materialTitle}": ${message}`)
    return []
  }

  if (!text) return []

  const blocks: LessonContent = []
  const lines = text.split(/\r?\n/)

  lines.forEach((line, index) => {
    const match = /https?:\/\/\S+/.exec(line)
    if (!match) return

    const url = match[0].replace(/[),.;]+$/, '')

    blocks.push({
      blockType: 'link',
      title: linkTitle(lines, index, match.index) ?? parseHost(url) ?? materialTitle,
      url,
      platform: detectPlatform(url),
    })
  })

  return blocks
}

/**
 * Подпись к ссылке: текст перед ней в той же строке, а если ссылка стоит
 * отдельной строкой — ближайшая осмысленная строка выше (так их и пишут).
 */
function linkTitle(lines: string[], index: number, urlStart: number): string | null {
  const inline = trimLabel(lines[index].slice(0, urlStart))
  if (inline) return inline

  for (let above = index - 1; above >= 0 && index - above <= 3; above--) {
    if (/https?:\/\//.test(lines[above])) break

    const label = trimLabel(lines[above])
    if (label) return label
  }

  return null
}

function trimLabel(raw: string): string | null {
  const label = raw
    .replace(/[\s\-–—:*•]+$/, '')
    .replace(/^[\s\-–—*•]+/, '')
    .trim()

  // Нумерация списка ("1.", "2)") подписью не является.
  if (label.length === 0 || /^\d+[.)]?$/.test(label)) return null

  return label.slice(0, 120)
}

function detectPlatform(url: string): LinkPlatform {
  const host = parseHost(url) ?? ''

  if (host === 'youtube.com' || host === 'youtu.be') return 'youtube'
  if (host.endsWith('t.me') || host.endsWith('telegram.me')) return 'telegram'
  if (host.endsWith('github.com')) return 'github'
  if (host.endsWith('boosty.to')) return 'boosty'

  return 'other'
}

function parseHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

type UpsertResult = { id: number; created: boolean }

async function upsertSection(
  payload: Payload,
  courseId: number,
  courseSlug: string,
  section: ImportedSection,
): Promise<UpsertResult> {
  const existing = await payload.find({
    collection: 'sections',
    where: { course: { equals: courseId }, title: { equals: section.title } },
    limit: 1,
    depth: 0,
  })

  const data = { order: section.order, isPublished: true }

  const current = existing.docs[0]
  if (current) {
    await payload.update({ collection: 'sections', id: current.id, data })
    return { id: current.id, created: false }
  }

  const created = await payload.create({
    collection: 'sections',
    data: {
      ...data,
      title: section.title,
      course: courseId,
      slug: await uniqueSlug(payload, 'sections', `${courseSlug}-${section.title}`),
    },
  })

  return { id: created.id, created: true }
}

async function upsertLesson(
  payload: Payload,
  params: {
    courseId: number
    courseSlug: string
    sectionId: number
    sectionTitle: string
    lesson: ImportedLesson
    content: LessonContent
  },
): Promise<UpsertResult> {
  const { courseId, courseSlug, sectionId, sectionTitle, lesson, content } = params

  const existing = await payload.find({
    collection: 'lessons',
    where: {
      course: { equals: courseId },
      section: { equals: sectionId },
      title: { equals: lesson.title },
    },
    limit: 1,
    depth: 0,
  })

  const data = { order: lesson.order, isPublished: true, content }

  const current = existing.docs[0]
  if (current) {
    await payload.update({ collection: 'lessons', id: current.id, data })
    return { id: current.id, created: false }
  }

  const created = await payload.create({
    collection: 'lessons',
    data: {
      ...data,
      title: lesson.title,
      course: courseId,
      section: sectionId,
      slug: await uniqueSlug(payload, 'lessons', `${courseSlug}-${sectionTitle}-${lesson.title}`),
    },
  })

  return { id: created.id, created: true }
}

/**
 * Уроки курса, которых больше нет в папке, не удаляем — это данные с прогрессом
 * студентов; сообщаем о них админу, чтобы он разобрался вручную.
 */
async function warnAboutOrphans(
  payload: Payload,
  courseId: number,
  touchedLessonIds: number[],
  warnings: string[],
): Promise<void> {
  const touched = new Set(touchedLessonIds)
  const existing = await payload.find({
    collection: 'lessons',
    where: { course: { equals: courseId } },
    limit: 1000,
    depth: 0,
  })

  const orphans = existing.docs.filter((doc) => !touched.has(doc.id))
  if (orphans.length === 0) return

  const names = orphans.slice(0, 10).map((doc) => `"${doc.title}"`).join(', ')
  const tail = orphans.length > 10 ? ` и ещё ${orphans.length - 10}` : ''

  warnings.push(
    `В курсе остались уроки, которых нет в папке (${orphans.length}): ${names}${tail}. ` +
      'Импорт их не трогает — проверьте вручную.',
  )
}

/** Slug уникален в пределах коллекции, поэтому при конфликте добавляем суффикс. */
async function uniqueSlug(
  payload: Payload,
  collection: 'sections' | 'lessons',
  source: string,
): Promise<string> {
  const base = slugify(source) || 'razdel'

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`
    const taken = await payload.find({
      collection,
      where: { slug: { equals: candidate } },
      limit: 1,
      depth: 0,
    })

    if (taken.docs.length === 0) return candidate
  }

  throw new Error(`Не удалось подобрать уникальный slug для "${source}"`)
}

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo',
  ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map((char) => CYRILLIC[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toId(value: unknown): number | null {
  const id = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  return Number.isInteger(id) && id > 0 ? id : null
}

async function updateImportStatus(
  payload: Payload,
  importId: number | string,
  status: 'completed' | 'failed',
  errorLog?: string,
): Promise<void> {
  await payload.update({
    collection: 'yandex-disk-imports',
    id: importId,
    data: { status, errorLog },
  })
}

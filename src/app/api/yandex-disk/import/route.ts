import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { fetchPublicFolderContents, filterVideoFiles, YandexDiskError } from '@/lib/yandex-disk'
import { parseYandexDiskFolder } from '@/lib/yandex-disk-parser'
import { withSpan, logger } from '@/lib/telemetry'

/** Генерирует slug из заголовка (транслитерация + kebab-case) */
function slugify(text: string): string {
  const CYRILLIC: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  }
  return text
    .toLowerCase()
    .split('')
    .map((c) => CYRILLIC[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

type ImportRequest = {
  publicUrl: string
  courseId: string
}

/**
 * POST /api/yandex-disk/import
 * Admin-only: импортирует структуру курса из публичной папки Яндекс.Диска.
 */
export async function POST(request: Request) {
  return withSpan('api.yandexDisk.import', {}, async () => {
    const payload = await getPayload({ config })

    // Auth check
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

    const { publicUrl, courseId } = body

    if (!publicUrl || !courseId) {
      return NextResponse.json(
        { error: 'Обязательные поля: publicUrl, courseId' },
        { status: 400 },
      )
    }

    // Validate course exists
    let course
    try {
      course = await payload.findByID({ collection: 'courses', id: courseId })
    } catch {
      return NextResponse.json({ error: 'Курс не найден' }, { status: 404 })
    }

    // Create import audit record
    const importRecord = await payload.create({
      collection: 'yandex-disk-imports',
      data: {
        publicUrl,
        course: courseId as unknown as number,
        status: 'processing',
        importedBy: user.id,
        sectionsCreated: 0,
        lessonsCreated: 0,
      },
    })

    try {
      const token = process.env.YANDEX_DISK_TOKEN || undefined

      // 1. Fetch folder contents
      logger.info(`YD Import: fetching folder ${publicUrl}`)
      const allItems = await fetchPublicFolderContents(publicUrl, { token })
      const videoItems = filterVideoFiles(allItems)

      if (videoItems.length === 0) {
        await updateImportStatus(payload, importRecord.id, 'failed', 'Не найдено видео-файлов в папке')
        return NextResponse.json(
          { error: 'Не найдено видео-файлов в указанной папке', sections: 0, lessons: 0, errors: [] },
          { status: 400 },
        )
      }

      // 2. Parse structure
      const parseResult = parseYandexDiskFolder(videoItems, publicUrl)

      if (parseResult.sections.length === 0) {
        await updateImportStatus(payload, importRecord.id, 'failed', parseResult.errors.join('\n'))
        return NextResponse.json(
          { error: 'Не удалось распарсить структуру файлов', sections: 0, lessons: 0, errors: parseResult.errors },
          { status: 400 },
        )
      }

      // 3. Create sections and lessons
      let sectionsCreated = 0
      let lessonsCreated = 0

      for (const section of parseResult.sections) {
        try {
          const sectionSlug = slugify(section.title) + '-' + Date.now()
          const sectionDoc = await payload.create({
            collection: 'sections',
            data: {
              title: section.title,
              slug: sectionSlug,
              course: courseId as unknown as number,
              order: section.sectionNumber,
              isPublished: true,
            },
          })

          sectionsCreated++

          for (const lesson of section.lessons) {
            try {
              // Формируем embed URL для Яндекс.Диска
              const videoUrl = lesson.publicUrl || publicUrl

              const lessonSlug = slugify(lesson.title) + '-' + Date.now() + '-' + lesson.order
              await payload.create({
                collection: 'lessons',
                data: {
                  title: lesson.title,
                  slug: lessonSlug,
                  course: courseId as unknown as number,
                  section: sectionDoc.id as unknown as number,
                  order: lesson.order,
                  isPublished: true,
                  content: [
                    {
                      blockType: 'video',
                      title: lesson.title,
                      videoUrl,
                      displayMode: 'embed' as const,
                    },
                    {
                      blockType: 'link',
                      title: 'Скачать видео с Яндекс.Диска',
                      url: videoUrl,
                      platform: 'other' as const,
                    },
                  ],
                },
                context: { skipHooks: true },
              })

              lessonsCreated++
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              parseResult.errors.push(`Ошибка создания урока "${lesson.title}": ${msg}`)
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          parseResult.errors.push(`Ошибка создания секции "${section.title}": ${msg}`)
        }
      }

      // 4. Update import record
      await payload.update({
        collection: 'yandex-disk-imports',
        id: importRecord.id,
        data: {
          status: 'completed',
          sectionsCreated,
          lessonsCreated,
          errorLog: parseResult.errors.length > 0 ? parseResult.errors.join('\n') : undefined,
        },
      })

      logger.info(`YD Import complete: ${sectionsCreated} sections, ${lessonsCreated} lessons for course "${course.title}"`)

      return NextResponse.json({
        sectionsCreated,
        lessonsCreated,
        errors: parseResult.errors,
        courseName: course.title,
      })
    } catch (err) {
      const message = err instanceof YandexDiskError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Неизвестная ошибка'

      await updateImportStatus(payload, importRecord.id, 'failed', message)

      logger.error(`YD Import failed: ${message}`)

      return NextResponse.json({ error: message }, { status: 500 })
    }
  })
}

async function updateImportStatus(
  payload: Awaited<ReturnType<typeof getPayload>>,
  importId: number | string,
  status: 'completed' | 'failed',
  errorLog?: string,
) {
  await payload.update({
    collection: 'yandex-disk-imports',
    id: importId,
    data: { status, errorLog },
  })
}

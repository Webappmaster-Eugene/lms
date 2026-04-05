import type { Payload } from 'payload'
import type { Course, Roadmap } from '@/payload-types'

/**
 * Общие хелперы для seed-скриптов (seed.ts, seed-roadmaps.ts).
 *
 * Идемпотентны: при повторном вызове возвращают существующие записи, а не
 * создают дубликаты. Это избавляет от проблемы уникальности slug'ов и
 * позволяет запускать сиды в любом порядке.
 */

export type CourseInput = {
  title: string
  slug: string
  roadmapId: number
  order: number
  estimatedHours: number
  prerequisites?: number[]
}

/**
 * Находит роадмап по slug, создаёт если отсутствует. Возвращает всегда
 * свежую запись с `id`.
 */
export async function findOrCreateRoadmap(
  payload: Payload,
  data: { title: string; slug: string; order: number; miroEmbedUrl?: string },
): Promise<Roadmap> {
  const existing = await payload.find({
    collection: 'roadmaps',
    where: { slug: { equals: data.slug } },
    limit: 1,
  })

  if (existing.docs.length > 0) {
    // Обновляем URL, если он изменился в сиде. Это нужно, чтобы старые записи
    // с невалидным `/app/board/...` URL автоматически получили live-embed.
    const current = existing.docs[0]
    if (data.miroEmbedUrl && current.miroEmbedUrl !== data.miroEmbedUrl) {
      return payload.update({
        collection: 'roadmaps',
        id: current.id,
        data: { miroEmbedUrl: data.miroEmbedUrl },
      })
    }
    return current
  }

  return payload.create({
    collection: 'roadmaps',
    data: {
      title: data.title,
      slug: data.slug,
      order: data.order,
      isPublished: true,
      ...(data.miroEmbedUrl ? { miroEmbedUrl: data.miroEmbedUrl } : {}),
    },
  })
}

/**
 * Создаёт курс или возвращает существующий по slug. Сохраняет идемпотентность.
 */
export async function findOrCreateCourse(
  payload: Payload,
  input: CourseInput,
): Promise<Course> {
  const existing = await payload.find({
    collection: 'courses',
    where: { slug: { equals: input.slug } },
    limit: 1,
  })

  if (existing.docs.length > 0) {
    return existing.docs[0]
  }

  return payload.create({
    collection: 'courses',
    data: {
      title: input.title,
      slug: input.slug,
      roadmap: input.roadmapId,
      order: input.order,
      estimatedHours: input.estimatedHours,
      isPublished: true,
      ...(input.prerequisites && input.prerequisites.length > 0
        ? { prerequisites: input.prerequisites }
        : {}),
    },
  })
}

export async function createCourse(payload: Payload, input: CourseInput): Promise<Course> {
  return payload.create({
    collection: 'courses',
    data: {
      title: input.title,
      slug: input.slug,
      roadmap: input.roadmapId,
      order: input.order,
      estimatedHours: input.estimatedHours,
      isPublished: true,
      ...(input.prerequisites && input.prerequisites.length > 0
        ? { prerequisites: input.prerequisites }
        : {}),
    },
  })
}

export async function createSection(
  payload: Payload,
  input: { title: string; courseId: number; order: number },
) {
  const slug =
    input.title
      .toLowerCase()
      .replace(/\d+\.\s*/, '')
      .replace(/[^a-zA-Zа-яА-ЯёЁ0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '') +
    '-' +
    Date.now() +
    '-' +
    Math.floor(Math.random() * 1000)

  return payload.create({
    collection: 'sections',
    data: {
      title: input.title,
      slug,
      course: input.courseId,
      order: input.order,
      isPublished: true,
    },
  })
}

export type LessonInput = {
  title: string
  estimatedMinutes: number
}

export async function createLessonsForSection(
  payload: Payload,
  courseId: number,
  sectionId: number,
  lessons: LessonInput[],
) {
  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i]
    const slug =
      lesson.title
        .toLowerCase()
        .replace(/[^a-zA-Zа-яА-ЯёЁ0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '') +
      '-' +
      Date.now() +
      '-' +
      i

    await payload.create({
      collection: 'lessons',
      data: {
        title: lesson.title,
        slug,
        course: courseId,
        section: sectionId,
        order: i + 1,
        isPublished: true,
        estimatedMinutes: lesson.estimatedMinutes,
        content: [
          {
            blockType: 'text',
            content: {
              root: {
                type: 'root',
                direction: 'ltr' as const,
                format: '' as const,
                indent: 0,
                version: 1,
                children: [
                  {
                    type: 'heading',
                    tag: 'h2',
                    version: 1,
                    children: [{ type: 'text', text: lesson.title, version: 1 }],
                  },
                  {
                    type: 'paragraph',
                    version: 1,
                    children: [
                      {
                        type: 'text',
                        version: 1,
                        text: `Содержимое урока "${lesson.title}". Здесь будет учебный материал, примеры кода и задания.`,
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    })
  }
}

/**
 * Создаёт «заглушечный» курс для узла роадмапа: 1 секция «Введение» + 1 урок «Скоро».
 * Используется в seed-roadmaps.ts чтобы все узлы графа были кликабельны.
 */
export async function createStubCourse(
  payload: Payload,
  params: {
    title: string
    slug: string
    roadmapId: number
    order: number
  },
): Promise<Course> {
  const course = await findOrCreateCourse(payload, {
    title: params.title,
    slug: params.slug,
    roadmapId: params.roadmapId,
    order: params.order,
    estimatedHours: 0,
  })

  // Если курс уже существует с секциями, не пересоздаём.
  const existingSections = await payload.find({
    collection: 'sections',
    where: { course: { equals: course.id } },
    limit: 1,
  })
  if (existingSections.docs.length > 0) {
    return course
  }

  const section = await createSection(payload, {
    title: 'Введение',
    courseId: course.id,
    order: 1,
  })
  await createLessonsForSection(payload, course.id, section.id, [
    { title: 'Обзор темы', estimatedMinutes: 5 },
  ])
  return course
}

import type { Payload } from 'payload'

import type { User } from '@/payload-types'
import { blockVideoId, blockVideoSource, mediaFilePath } from '@/lib/lesson-video-source'
import { parsePublicResourceUrl, type PublicResourceRef } from '@/lib/yandex-disk-url'

export class LessonVideoAccessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export type LessonVideoSource = { kind: 'yandex'; ref: PublicResourceRef } | { kind: 'media'; path: string }

/** Не принимает адрес источника от ученика: только опубликованный блок учебного каталога. */
export async function resolveLessonVideoSource(
  payload: Payload,
  user: Pick<User, 'id' | 'role'>,
  params: URLSearchParams,
): Promise<LessonVideoSource> {
  const lessonId = params.get('lesson')
  const blockId = params.get('block')
  let rawUrl: string

  if (lessonId || blockId) {
    if (!lessonId || !/^[1-9]\d*$/.test(lessonId) || !Number.isSafeInteger(Number(lessonId)) || !blockId || blockId.length > 100) {
      throw new LessonVideoAccessError('Укажите урок и видео', 400)
    }
    let lesson
    try {
      // Серверный overrideAccess нужен для исходника до afterRead redaction.
      // Публикация и принадлежность проверяются ниже до обращения к источнику.
      lesson = await payload.findByID({ collection: 'lessons', id: Number(lessonId), depth: 1, overrideAccess: true })
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 404) {
        throw new LessonVideoAccessError('Видео не найдено', 404)
      }
      throw error
    }
    if (user.role !== 'admin') {
      const course = typeof lesson.course === 'object' ? lesson.course : null
      const section = typeof lesson.section === 'object' ? lesson.section : null
      const sectionCourseId = section && (typeof section.course === 'object' ? section.course.id : section.course)
      if (!lesson.isPublished || !course?.isPublished || (lesson.section && (!section?.isPublished || sectionCourseId !== course.id))) {
        throw new LessonVideoAccessError('Видео не найдено', 404)
      }
    }
    const block = lesson.content?.find((candidate, index) => blockVideoId(candidate, index) === blockId)
    const source = block ? blockVideoSource(block) : null
    if (!source) throw new LessonVideoAccessError('Видео не найдено', 404)
    rawUrl = source
  } else {
    const legacyUrl = params.get('url')
    if (!legacyUrl) throw new LessonVideoAccessError('Укажите урок и видео', 400)
    // Административная диагностика старых ссылок остаётся доступна.
    if (user.role !== 'admin') throw new LessonVideoAccessError('Просмотр доступен только из урока', 403)
    rawUrl = legacyUrl
  }

  const ref = parsePublicResourceUrl(rawUrl)
  if (ref) return { kind: 'yandex', ref }
  const path = mediaFilePath(rawUrl)
  if (path) return { kind: 'media', path }
  throw new LessonVideoAccessError('Источник видео не поддерживается', 400)
}

import type { Payload } from 'payload'

import type { User } from '@/payload-types'
import { blockVideoId, blockVideoSource, mediaFilePath } from '@/lib/lesson-video-source'
import { parsePublicResourceUrl, type PublicResourceRef } from '@/lib/yandex-disk-url'
import { canAccessLesson } from '@/server/learning-access'
import { lessonAssetToken } from '@/lib/lesson-asset-source'

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
  allowMaterial = false,
): Promise<LessonVideoSource> {
  const lessonId = params.get('lesson')
  const blockId = params.get('block')
  const asset = params.get('asset')
  if (allowMaterial && asset !== null && !/^[a-z\d]{1,32}$/.test(asset)) throw new LessonVideoAccessError('Материал не найден', 400)
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
      if (!await canAccessLesson(payload, user, lesson)) throw new LessonVideoAccessError('Видео недоступно', 403)
    }
    const block = lesson.content?.find((candidate, index) => blockVideoId(candidate, index) === blockId)
    const source = allowMaterial
      ? materialSource(blockId === 'description' ? lesson.description : block, asset)
      : block ? blockVideoSource(block) : null
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
  if (ref) {
    if (allowMaterial && !(ref.path && /\.[a-z\d]{1,12}$/i.test(ref.path)) && !new URL(ref.publicKey).pathname.startsWith('/i/')) {
      throw new LessonVideoAccessError('Выдача папки недоступна', 404)
    }
    return { kind: 'yandex', ref }
  }
  const path = mediaFilePath(rawUrl)
  if (path) return { kind: 'media', path }
  throw new LessonVideoAccessError('Источник видео не поддерживается', 400)
}

function materialSource(value: unknown, token: string | null): string | null {
  if (typeof value === 'string') {
    const urls = value.match(/(?:https?:\/\/[^\s<>"'()[\]]+|\/api\/media\/file\/[^\s<>"'()[\]]+)/gi) ?? []
    return urls.find((url) => (parsePublicResourceUrl(url) || mediaFilePath(url)) && (!token || lessonAssetToken(url) === token)) ?? null
  }
  if (Array.isArray(value)) {
    for (const entry of value) { const source = materialSource(entry, token); if (source) return source }
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) { const source = materialSource(child, token); if (source) return source }
  }
  return null
}

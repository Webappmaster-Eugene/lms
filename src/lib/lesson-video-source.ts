import { parsePublicResourceUrl } from '@/lib/yandex-disk-url'
import type { Course, Lesson } from '@/payload-types'

type ContentBlock = NonNullable<Lesson['content']>[number]
const VIDEO_EXTENSION = /\.(?:mp4|m4v|webm|mov|mkv|avi|ts|flv|wmv)$/i
const MATERIALS_NOTICE = 'Материалы курса доступны в уроках LMS'

export function isYandexCatalogUrl(rawUrl: string): boolean {
  const ref = parsePublicResourceUrl(rawUrl)
  return !!ref && new URL(ref.publicKey).pathname.startsWith('/d/') && (!ref.path || !/\.[a-z\d]{1,8}$/i.test(ref.path))
}

function redactResourceText(value: string, replacements: Map<string, string> = new Map()): string {
  return value.replace(/https?:\/\/[^\s<>"'()[\]]+/g, (url) => {
    const replacement = replacements.get(url)
    if (replacement) return replacement
    if (isYandexCatalogUrl(url)) return MATERIALS_NOTICE
    return isLessonVideoUrl(url) ? 'Видео доступно в плеере урока' : url
  })
}

function redactResourceTree(value: unknown, replacements: Map<string, string>, fallbackUrl: string): unknown {
  if (typeof value === 'string') return redactResourceText(value, replacements)
  if (Array.isArray(value)) return value.map((child) => redactResourceTree(child, replacements, fallbackUrl))
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const fields = record.fields && typeof record.fields === 'object' ? record.fields as Record<string, unknown> : null
    const linkUrl = typeof fields?.url === 'string' ? fields.url : record.url
    if (record.type === 'link' && typeof linkUrl === 'string' && (isYandexCatalogUrl(linkUrl) || isLessonVideoUrl(linkUrl))) {
      return {
        ...record,
        fields: { ...fields, url: replacements.get(linkUrl) ?? fallbackUrl, newTab: false },
        url: replacements.get(linkUrl) ?? fallbackUrl,
        children: [{ type: 'text', text: MATERIALS_NOTICE, format: 0, detail: 0, mode: 'normal', style: '', version: 1 }],
      }
    }
    return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, redactResourceTree(child, replacements, fallbackUrl)]))
  }
  return value
}

export function protectCourseSourceLinks<T extends Pick<Course, 'slug' | 'description'>>(course: T): T {
  return { ...course, description: redactResourceTree(course.description, new Map(), `/courses/${course.slug}`) as Course['description'] }
}

export function mediaFilePath(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl, 'https://local.invalid')
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return url.pathname.startsWith('/api/media/file/') ? url.pathname : null
  } catch {
    return null
  }
}

export function isLessonVideoUrl(rawUrl: string): boolean {
  const ref = parsePublicResourceUrl(rawUrl)
  const path = ref?.path ?? mediaFilePath(rawUrl)
  return path !== null && path !== undefined && VIDEO_EXTENSION.test(path)
}

export function blockVideoSource(block: ContentBlock): string | null {
  if (block.blockType === 'video') {
    return parsePublicResourceUrl(block.videoUrl) || mediaFilePath(block.videoUrl) ? block.videoUrl : null
  }
  if (block.blockType === 'link' && isLessonVideoUrl(block.url)) return block.url
  if (block.blockType === 'file' && block.file && typeof block.file === 'object' && block.file.mimeType?.startsWith('video/')) {
    return block.file.url ?? null
  }
  return null
}

export function blockVideoId(block: ContentBlock, index: number): string {
  return block.id ?? `index:${index}`
}

export function lessonVideoUrl(lessonId: number, block: ContentBlock, index: number): string {
  const source = blockVideoSource(block)
  const params = new URLSearchParams({ lesson: String(lessonId), block: blockVideoId(block, index) })
  const path = source ? parsePublicResourceUrl(source)?.path : null
  if (path && /\.ts$/i.test(path)) params.set('format', 'ts')
  if (source && mediaFilePath(source)) params.set('source', 'media')
  return `/api/yandex-disk/stream?${params}`
}

/** Не меняет сохранённые блоки: исходники доступны только серверу и редактору. */
export function protectLessonVideoSources<T extends Pick<Lesson, 'id' | 'content' | 'description'>>(lesson: T): T {
  const replacements = new Map<string, string>()
  const blocks = (lesson.content ?? []).map((block, index): ContentBlock => {
    if (block.blockType === 'link' && isYandexCatalogUrl(block.url)) {
      return {
        id: block.id,
        blockName: block.blockName,
        blockType: 'text',
        content: { root: {
          type: 'root', direction: 'ltr', format: '', indent: 0, version: 1,
          children: [{ type: 'paragraph', version: 1, children: [{ type: 'text', text: MATERIALS_NOTICE, format: 0, detail: 0, mode: 'normal', style: '', version: 1 }] }],
        } },
      }
    }
    const source = blockVideoSource(block)
    if (!source) return block
    const internalUrl = lessonVideoUrl(lesson.id, block, index)
    replacements.set(source, internalUrl)
    if (block.blockType === 'video') return { ...block, videoUrl: internalUrl, displayMode: 'embed' }
    if (block.blockType === 'link' || block.blockType === 'file') {
      return {
        id: block.id,
        blockName: block.blockName,
        blockType: 'video',
        title: block.title,
        description: block.description,
        videoUrl: internalUrl,
        displayMode: 'embed',
      }
    }
    return block
  })

  return {
    ...lesson,
    description: lesson.description ? redactResourceText(lesson.description, replacements) : lesson.description,
    content: redactResourceTree(blocks, replacements, '/courses') as Lesson['content'],
  }
}

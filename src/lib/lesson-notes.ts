export const LESSON_NOTES_SOURCES = ['author', 'transcript', 'outline', 'topic'] as const
export type LessonNotesSource = (typeof LESSON_NOTES_SOURCES)[number]

export const LESSON_NOTES_SOURCE_LABELS: Record<LessonNotesSource, string> = {
  author: 'Конспект автора курса',
  transcript: 'По расшифровке или субтитрам видео',
  outline: 'По плану или слайдам автора',
  topic: 'По теме урока',
}

/** Предел текста конспекта: самые длинные авторские конспекты курсов - десятки тысяч символов. */
export const LESSON_NOTES_MAX_LENGTH = 200_000

export function isLessonNotesSource(value: unknown): value is LessonNotesSource {
  return typeof value === 'string' && (LESSON_NOTES_SOURCES as readonly string[]).includes(value)
}

/** Текст конспекта, если блок - непустой конспект: пустой не показывается и не даёт ссылки на него. */
export function studyNotesText(block: { blockType: string; markdown?: unknown }): string | null {
  return block.blockType === 'lessonNotes' && typeof block.markdown === 'string' && block.markdown.trim() !== '' ? block.markdown : null
}

const READING_WORDS_PER_MINUTE = 180

export function lessonNotesReadingMinutes(markdown: string): number {
  return Math.max(1, Math.round(markdown.trim().split(/\s+/).length / READING_WORDS_PER_MINUTE))
}

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

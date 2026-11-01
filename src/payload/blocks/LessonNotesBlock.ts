import type { Block } from 'payload'

import { LESSON_NOTES_MAX_LENGTH, LESSON_NOTES_SOURCE_LABELS, LESSON_NOTES_SOURCES } from '@/lib/lesson-notes'

/**
 * Текстовый конспект урока: замена видео для тех, кому его не посмотреть.
 * В отличие от блока методички правится здесь же, импорт его не перезаписывает.
 */
export const LessonNotesBlock: Block = {
  slug: 'lessonNotes',
  interfaceName: 'LessonNotesBlock',
  labels: {
    singular: 'Конспект',
    plural: 'Конспекты',
  },
  fields: [
    {
      name: 'markdown',
      type: 'code',
      required: true,
      label: 'Текст конспекта (Markdown)',
      // У поля code «обязательное» пропускает пустую строку: урок остался бы без текста.
      validate: (value: string | null | undefined) => {
        if (typeof value !== 'string' || value.trim() === '') return 'Текст конспекта не может быть пустым'
        if (value.length > LESSON_NOTES_MAX_LENGTH) return `Конспект длиннее ${LESSON_NOTES_MAX_LENGTH} символов`
        return true
      },
      admin: {
        language: 'markdown',
        description: 'Markdown: заголовки ## и ###, таблицы, блоки кода с языком, схемы в блоке ```mermaid.',
      },
    },
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'topic',
      label: 'Источник',
      options: LESSON_NOTES_SOURCES.map((value) => ({ label: LESSON_NOTES_SOURCE_LABELS[value], value })),
    },
    {
      name: 'sourceRef',
      type: 'text',
      label: 'Откуда текст',
      admin: {
        description: 'Файл автора, субтитров или слайдов, по которому написан конспект. Ученикам не показывается.',
      },
    },
  ],
}

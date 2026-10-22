import type { Block } from 'payload'

/**
 * Текст из Markdown-репозитория (методички буткемпа). Правится в Git и приходит
 * импортом: повторный импорт заменяет текст целиком, поэтому правка здесь пропадёт.
 * Сырой HTML в нём не исполняется — рендер без rehype-raw.
 */
export const MarkdownBlock: Block = {
  slug: 'markdown',
  interfaceName: 'MarkdownBlock',
  labels: {
    singular: 'Текст из репозитория',
    plural: 'Тексты из репозитория',
  },
  fields: [
    {
      name: 'markdown',
      type: 'code',
      required: true,
      label: 'Markdown',
      // У поля code «обязательное» пропускает пустую строку: урок остался бы без текста.
      validate: (value: string | null | undefined) => (typeof value === 'string' && value.trim() !== '' ? true : 'Текст не может быть пустым'),
      admin: {
        language: 'markdown',
        description: 'Правится в Git-репозитории и приходит импортом. Правка здесь пропадёт при следующем импорте.',
      },
    },
    {
      name: 'source',
      type: 'text',
      label: 'Источник',
      admin: {
        readOnly: true,
        description: 'Методичка, часть и версия, из которых импортирован текст.',
      },
    },
  ],
}

import type { Block } from 'payload'

import { SLIDES_LIMIT } from '@/lib/slides'

export const SlidesBlock: Block = {
  slug: 'slides',
  interfaceName: 'SlidesBlock',
  labels: {
    singular: 'Презентация',
    plural: 'Презентации',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Название',
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Описание',
    },
    {
      name: 'folderUrl',
      type: 'text',
      label: 'Папка на Яндекс Диске',
      admin: {
        description: 'Если список файлов пуст, при сохранении он заполнится файлами этой папки по порядку имён. Чтобы перечитать папку, очистите список и сохраните.',
      },
    },
    {
      name: 'items',
      type: 'array',
      label: 'Файлы',
      labels: { singular: 'Файл', plural: 'Файлы' },
      maxRows: SLIDES_LIMIT,
      admin: {
        description: 'Картинки листаются как слайды, PDF - постранично, остальные файлы ученик скачивает.',
      },
      fields: [
        {
          name: 'url',
          type: 'text',
          required: true,
          label: 'Ссылка на файл (Яндекс Диск или медиатека)',
        },
        {
          name: 'fileName',
          type: 'text',
          label: 'Имя файла',
          admin: { readOnly: true, description: 'Определяется по ссылке при сохранении.' },
        },
        {
          name: 'caption',
          type: 'text',
          label: 'Подпись',
        },
      ],
    },
  ],
}

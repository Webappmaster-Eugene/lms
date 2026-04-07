import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { generateSlug } from '@/payload/hooks/generateSlug'
import {
  normalizeLexicalAfterRead,
  normalizeLexicalBeforeValidate,
} from '@/payload/hooks/normalizeLexicalField'

export const Roadmaps: CollectionConfig = {
  slug: 'roadmaps',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'order', 'isPublished', 'updatedAt'],
    group: 'Контент',
  },
  access: {
    create: isAdmin,
    read: isAuthenticated,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [generateSlug],
  },
  fields: [
    {
      name: 'visualEditor',
      type: 'ui',
      admin: {
        components: {
          Field: '/components/roadmap-editor/OpenEditorButton#OpenEditorButton',
        },
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Название',
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      required: true,
      label: 'Slug',
      admin: {
        position: 'sidebar',
        description: 'Генерируется автоматически из названия',
      },
    },
    {
      name: 'description',
      type: 'richText',
      label: 'Описание',
      // Защита от "scalar-in-jsonb": если в колонку попадает строка/число/bool
      // (раньше такое случалось из-за ручных SQL-апдейтов), Lexical-редактор
      // админки падает на useMemo. Хуки нормализуют значение на входе и выходе,
      // чтобы страница редактирования всегда оставалась доступной.
      hooks: {
        beforeValidate: [normalizeLexicalBeforeValidate],
        afterRead: [normalizeLexicalAfterRead],
      },
    },
    {
      name: 'coverImage',
      type: 'upload',
      relationTo: 'media',
      label: 'Обложка',
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      label: 'Порядок сортировки',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'isPublished',
      type: 'checkbox',
      defaultValue: false,
      label: 'Опубликован',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'miroEmbedUrl',
      type: 'text',
      label: 'Ссылка для встраивания Miro-доски',
      admin: {
        description:
          'Допустимые форматы: https://miro.com/app/live-embed/<boardId>/ или https://miro.com/app/embed/<boardId>/. Доска должна быть публичной (Share → Anyone with the link). View-URL вида https://miro.com/app/board/... не подойдёт — iframe покажет экран логина Miro.',
      },
      validate: (value: string | null | undefined) => {
        if (value == null || value === '') return true
        try {
          const url = new URL(value)
          if (url.protocol !== 'https:' || url.hostname !== 'miro.com') {
            return 'Ссылка должна вести на https://miro.com'
          }
          if (!url.pathname.startsWith('/app/live-embed/') && !url.pathname.startsWith('/app/embed/')) {
            return 'Используйте URL формата https://miro.com/app/live-embed/<boardId>/ или /app/embed/<boardId>/. Ссылка вида /app/board/... не работает в iframe.'
          }
          return true
        } catch {
          return 'Некорректный URL'
        }
      },
    },
  ],
}

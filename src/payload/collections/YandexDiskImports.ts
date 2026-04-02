import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'

export const YandexDiskImports: CollectionConfig = {
  slug: 'yandex-disk-imports',
  admin: {
    defaultColumns: ['publicUrl', 'status', 'sectionsCreated', 'lessonsCreated', 'createdAt'],
    group: 'Контент',
  },
  access: {
    create: isAdmin,
    read: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'publicUrl',
      type: 'text',
      required: true,
      label: 'Публичная ссылка Яндекс.Диска',
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      label: 'Статус',
      options: [
        { label: 'Ожидание', value: 'pending' },
        { label: 'Обработка', value: 'processing' },
        { label: 'Завершено', value: 'completed' },
        { label: 'Ошибка', value: 'failed' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'course',
      type: 'relationship',
      relationTo: 'courses',
      required: true,
      label: 'Целевой курс',
    },
    {
      name: 'sectionsCreated',
      type: 'number',
      defaultValue: 0,
      label: 'Секций создано',
    },
    {
      name: 'lessonsCreated',
      type: 'number',
      defaultValue: 0,
      label: 'Уроков создано',
    },
    {
      name: 'errorLog',
      type: 'textarea',
      label: 'Лог ошибок',
    },
    {
      name: 'importedBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      label: 'Импортировал',
    },
  ],
}

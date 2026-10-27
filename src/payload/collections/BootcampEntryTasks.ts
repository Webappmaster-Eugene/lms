import type { CollectionConfig } from 'payload'

import { BOOTCAMP_PROGRAMS } from '@/lib/bootcamp-leads'
import { isAdmin } from '@/payload/access/isAdmin'

/**
 * Архив входного задания и его описание. Репозиторий LMS публичный, поэтому
 * задание живёт здесь, а не в коде. Кандидат получает его только по личной
 * ссылке из письма (/entry-task/<токен>); файл через REST Payload отдаётся
 * лишь администратору.
 */
export const BootcampEntryTasks: CollectionConfig = {
  slug: 'bootcamp-entry-tasks',
  labels: { singular: 'Входное задание', plural: 'Входные задания' },
  admin: {
    group: 'Буткемпы',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'program', 'active', 'updatedAt'],
    description: 'Кандидат видит последнее активное задание своей программы: описание на странице и архив для скачивания.',
  },
  access: {
    create: isAdmin,
    read: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  upload: {
    staticDir: 'media/bootcamp-entry-tasks',
    mimeTypes: ['application/zip'],
    modifyResponseHeaders: ({ headers }) => {
      headers.set('Cache-Control', 'private, no-store')
      headers.set('X-Content-Type-Options', 'nosniff')
      return headers
    },
  },
  fields: [
    { name: 'program', type: 'select', required: true, defaultValue: 'nodejs', label: 'Программа', options: BOOTCAMP_PROGRAMS.map(({ value, label }) => ({ value, label })) },
    { name: 'active', type: 'checkbox', defaultValue: true, label: 'Выдавать кандидатам', admin: { position: 'sidebar' } },
    {
      name: 'readme',
      type: 'textarea',
      required: true,
      maxLength: 50_000,
      label: 'Описание задания (Markdown)',
      admin: { description: 'README из архива: кандидат читает его на странице задания.', rows: 20 },
    },
  ],
}

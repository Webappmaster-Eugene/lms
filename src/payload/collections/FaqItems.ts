import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'

export const FaqItems: CollectionConfig = {
  slug: 'faq-items',
  admin: {
    useAsTitle: 'question',
    defaultColumns: ['question', 'order', 'isPublished', 'updatedAt'],
    group: 'Коммуникация',
  },
  access: {
    create: isAdmin,
    read: () => true,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'question',
      type: 'text',
      required: true,
      label: 'Вопрос',
    },
    {
      name: 'answer',
      type: 'richText',
      required: true,
      label: 'Ответ',
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      label: 'Порядок',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'isPublished',
      type: 'checkbox',
      defaultValue: true,
      label: 'Опубликован',
      admin: {
        position: 'sidebar',
      },
    },
  ],
}

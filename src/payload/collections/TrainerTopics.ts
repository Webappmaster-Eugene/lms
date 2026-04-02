import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { generateSlug } from '@/payload/hooks/generateSlug'

export const TrainerTopics: CollectionConfig = {
  slug: 'trainer-topics',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'order', 'isPublished', 'updatedAt'],
    group: 'Тренажёр',
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
      name: 'title',
      type: 'text',
      required: true,
      label: 'Название темы',
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
      type: 'textarea',
      label: 'Описание темы',
      maxLength: 500,
    },
    {
      name: 'icon',
      type: 'text',
      label: 'Иконка',
      admin: {
        description: 'Emoji или имя иконки lucide (например: "code", "braces", "terminal")',
      },
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
      defaultValue: false,
      label: 'Опубликована',
      admin: {
        position: 'sidebar',
      },
    },
  ],
}

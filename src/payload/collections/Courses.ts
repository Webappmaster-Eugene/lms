import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { generateSlug } from '@/payload/hooks/generateSlug'

export const Courses: CollectionConfig = {
  slug: 'courses',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'roadmap', 'order', 'isPublished', 'updatedAt'],
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
    },
    {
      name: 'coverImage',
      type: 'upload',
      relationTo: 'media',
      label: 'Обложка',
    },
    {
      name: 'roadmap',
      type: 'relationship',
      relationTo: 'roadmaps',
      required: true,
      label: 'Роадмап',
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      label: 'Порядок в роадмапе',
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
      name: 'estimatedHours',
      type: 'number',
      label: 'Ожидаемое время (часов)',
      min: 0,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'prerequisites',
      type: 'relationship',
      relationTo: 'courses',
      hasMany: true,
      label: 'Пререквизиты (необходимо пройти до этого курса)',
      admin: {
        description: 'Курсы, которые нужно завершить перед началом этого курса',
      },
    },
  ],
}

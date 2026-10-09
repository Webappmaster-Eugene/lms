import type { CollectionConfig } from 'payload'

import { protectSectionMetadata } from '@/payload/hooks/protectCourseSources'
import { isAdmin } from '@/payload/access/isAdmin'
import { learningSectionRead } from '@/payload/access/learningCatalogRead'
import { generateSlug } from '@/payload/hooks/generateSlug'
import { cleanupLearningTargetGrants } from '@/payload/hooks/learningAccessCleanup'

export const Sections: CollectionConfig = {
  slug: 'sections',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'course', 'order', 'isPublished', 'updatedAt'],
    group: 'Контент',
  },
  access: {
    create: isAdmin,
    read: learningSectionRead,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterRead: [protectSectionMetadata],
    beforeDelete: [cleanupLearningTargetGrants('sections')],
    beforeValidate: [generateSlug],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Название секции',
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
      name: 'course',
      type: 'relationship',
      relationTo: 'courses',
      required: true,
      label: 'Курс',
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      label: 'Порядок в курсе',
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
    {
      name: 'description',
      type: 'textarea',
      label: 'Описание секции',
      maxLength: 500,
    },
  ],
}

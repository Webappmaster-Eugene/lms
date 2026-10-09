import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { getTrainerAccess, trainerTopicReadAccess } from '@/server/trainer-access'
import { cleanupLearningTargetGrants } from '@/payload/hooks/learningAccessCleanup'
import { generateSlug } from '@/payload/hooks/generateSlug'
import { TOPIC_CATEGORY_OPTIONS } from '@/lib/trainer/constants'

export const TrainerTopics: CollectionConfig = {
  slug: 'trainer-topics',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'order', 'isPublished', 'updatedAt'],
    group: 'Тренажёр',
  },
  access: {
    create: isAdmin,
    read: trainerTopicReadAccess,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterRead: [async ({ doc, req, overrideAccess }) => {
      if (overrideAccess || !req.user || !Object.hasOwn(doc, 'description')) return doc
      const scope = await getTrainerAccess(req.payload, req.user, req)
      return !scope.admin && scope.catalogVisibility === 'assigned' ? { ...doc, description: null } : doc
    }],
    beforeValidate: [generateSlug],
    beforeDelete: [cleanupLearningTargetGrants('trainer-topics')],
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
      name: 'category',
      type: 'select',
      required: true,
      defaultValue: 'javascript',
      label: 'Категория',
      options: [...TOPIC_CATEGORY_OPTIONS],
      admin: {
        position: 'sidebar',
        description: 'Используется для группировки и фильтров в каталоге задач.',
      },
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

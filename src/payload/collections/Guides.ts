import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { generateSlug } from '@/payload/hooks/generateSlug'
import { cleanupLearningTargetGrants } from '@/payload/hooks/learningAccessCleanup'
import { guideReadAccess } from '@/server/guide-access'

/**
 * Самостоятельные инструкции вне программы курсов, баллов не дают. Доступ к обучению их
 * не открывает: ученик видит гайд только по отдельному назначению или режиму «все гайды».
 */
export const Guides: CollectionConfig = {
  slug: 'guides',
  labels: {
    singular: 'Гайд',
    plural: 'Гайды',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'order', 'isPublished', 'updatedAt'],
    group: 'Контент',
  },
  access: {
    create: isAdmin,
    read: guideReadAccess,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [generateSlug],
    beforeDelete: [cleanupLearningTargetGrants('guides')],
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
      name: 'summary',
      type: 'textarea',
      required: true,
      maxLength: 300,
      label: 'Кратко',
      admin: {
        description: 'Одна-две фразы о том, чему научит гайд. Видны в списке гайдов и в описании страницы',
      },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
      label: 'Текст гайда',
      admin: {
        description: 'Заголовки второго уровня попадают в оглавление гайда',
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
      label: 'Опубликован',
      admin: {
        position: 'sidebar',
      },
    },
  ],
}

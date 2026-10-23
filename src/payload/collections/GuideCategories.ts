import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { generateSlug } from '@/payload/hooks/generateSlug'

/**
 * Категории гайдов — отдельный справочник, чтобы их можно было заводить прямо из формы гайда
 * и переименовывать в одном месте. По slug строится фильтр списка `/guides?category=<slug>`.
 */
export const GuideCategories: CollectionConfig = {
  slug: 'guide-categories',
  labels: {
    singular: 'Категория гайдов',
    plural: 'Категории гайдов',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'order'],
    group: 'Контент',
  },
  access: {
    // Названия категорий не секрет: их видят все вошедшие (список и страница гайда).
    read: isAuthenticated,
    create: isAdmin,
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
        description: 'Адрес фильтра: /guides?category=<slug>. Подставляется из названия',
        components: { Field: '/components/admin/AutoSlugField#AutoSlugField' },
      },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      label: 'Порядок',
      admin: { description: 'Чем меньше, тем левее в фильтре списка гайдов' },
    },
  ],
}

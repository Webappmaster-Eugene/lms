import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { learningCourseRead } from '@/payload/access/learningCatalogRead'
import { generateSlug } from '@/payload/hooks/generateSlug'
import { protectCourseSources } from '@/payload/hooks/protectCourseSources'
import { cleanupLearningTargetGrants } from '@/payload/hooks/learningAccessCleanup'
import { learningCourseDescriptionRead } from '@/payload/access/learningCourseDescription'

/** Буткемп без назначения открыл бы режим «все опубликованные курсы» и доступ ко всей карте. */
const bootcampAssignedOnly: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  if (data && (data.isBootcamp ?? originalDoc?.isBootcamp) === true) data.assignedOnly = true
  return data
}

export const Courses: CollectionConfig = {
  slug: 'courses',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'roadmap', 'order', 'isPublished', 'updatedAt'],
    group: 'Контент',
  },
  access: {
    create: isAdmin,
    read: learningCourseRead,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeDelete: [cleanupLearningTargetGrants('courses')],
    afterRead: [protectCourseSources],
    beforeValidate: [generateSlug, bootcampAssignedOnly],
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
      access: { read: learningCourseDescriptionRead },
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
      name: 'roadmapNode',
      type: 'relationship',
      relationTo: 'roadmap-nodes',
      label: 'Узел роадмапа',
      admin: {
        description:
          'Тема на карте, к которой относится курс. По одной теме может быть несколько курсов - узел покажет их списком',
      },
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
      name: 'assignedOnly',
      type: 'checkbox',
      defaultValue: false,
      label: 'Только по назначению',
      admin: {
        position: 'sidebar',
        description: 'Открывается только назначением на курс, его тему, раздел или урок. Режим «все опубликованные курсы» и доступ ко всей карте его не открывают, каталог не показывает.',
      },
    },
    {
      name: 'isBootcamp',
      type: 'checkbox',
      defaultValue: false,
      label: 'Буткемп',
      admin: {
        position: 'sidebar',
        description: 'Показывается в разделе «Буткемп», а не в «Курсах» и роадмапах. Назначается только целиком, поэтому всегда «Только по назначению»; если снять флажок, «Только по назначению» останется - снимите его отдельно.',
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

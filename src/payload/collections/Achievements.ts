import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'

export const Achievements: CollectionConfig = {
  slug: 'achievements',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'criteriaType', 'criteriaValue', 'pointsReward', 'isActive'],
    group: 'Геймификация',
  },
  access: {
    create: isAdmin,
    read: isAuthenticated,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Название',
    },
    {
      name: 'description',
      type: 'textarea',
      required: true,
      label: 'Описание',
      maxLength: 300,
    },
    {
      name: 'icon',
      type: 'upload',
      relationTo: 'media',
      label: 'Иконка',
    },
    {
      name: 'pointsReward',
      type: 'number',
      defaultValue: 0,
      label: 'Награда (баллы)',
      min: 0,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'criteriaType',
      type: 'select',
      required: true,
      label: 'Тип критерия',
      options: [
        { label: 'Количество пройденных уроков', value: 'lesson_count' },
        { label: 'Завершение курса', value: 'course_completion' },
        { label: 'Завершение роадмапа', value: 'roadmap_completion' },
        { label: 'Общее количество баллов', value: 'total_points' },
      ],
    },
    {
      name: 'criteriaValue',
      type: 'number',
      required: true,
      label: 'Значение критерия',
      admin: {
        description: 'Для lesson_count: кол-во уроков. Для total_points: кол-во баллов. Для completion: 1.',
      },
    },
    {
      name: 'criteriaEntityId',
      type: 'text',
      label: 'ID сущности (для course_completion / roadmap_completion)',
      admin: {
        description: 'Оставьте пустым для любого курса/роадмапа, или укажите конкретный ID',
        condition: (_, siblingData) =>
          siblingData?.criteriaType === 'course_completion' ||
          siblingData?.criteriaType === 'roadmap_completion',
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      label: 'Активно',
      admin: {
        position: 'sidebar',
      },
    },
  ],
}

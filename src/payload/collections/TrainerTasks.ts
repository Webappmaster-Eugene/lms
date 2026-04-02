import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { generateSlug } from '@/payload/hooks/generateSlug'

export const TrainerTasks: CollectionConfig = {
  slug: 'trainer-tasks',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'topic', 'difficulty', 'order', 'isPublished'],
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
      label: 'Название задачи',
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
      name: 'topic',
      type: 'relationship',
      relationTo: 'trainer-topics',
      required: true,
      label: 'Тема',
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      label: 'Порядок в теме',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'difficulty',
      type: 'select',
      required: true,
      defaultValue: 'easy',
      label: 'Сложность',
      options: [
        { label: 'Лёгкая', value: 'easy' },
        { label: 'Средняя', value: 'medium' },
        { label: 'Сложная', value: 'hard' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'description',
      type: 'richText',
      required: true,
      label: 'Условие задачи',
    },
    {
      name: 'starterCode',
      type: 'textarea',
      required: true,
      label: 'Стартовый код',
      admin: {
        description: 'Шаблон кода, который увидит пользователь. Используйте комментарии для подсказок.',
      },
    },
    {
      name: 'expectedOutput',
      type: 'textarea',
      required: true,
      label: 'Ожидаемый вывод',
      admin: {
        description: 'Ожидаемый вывод console.log. Каждая строка — один вызов console.log.',
      },
    },
    {
      name: 'hints',
      type: 'array',
      label: 'Подсказки',
      fields: [
        {
          name: 'hint',
          type: 'textarea',
          required: true,
          label: 'Подсказка',
        },
      ],
    },
    {
      name: 'solutionCode',
      type: 'textarea',
      label: 'Эталонное решение',
      access: {
        read: ({ req }) => req.user?.role === 'admin',
      },
      admin: {
        description: 'Только для администратора. Не показывается пользователям.',
      },
    },
    {
      name: 'pointsReward',
      type: 'number',
      defaultValue: 10,
      min: 0,
      label: 'Баллы за решение',
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

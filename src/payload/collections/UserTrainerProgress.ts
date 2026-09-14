import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'
import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { awardTrainerPoints } from '@/payload/hooks/awardTrainerPoints'
import { LANGUAGE_OPTIONS, TRAINER_LIMITS } from '@/lib/trainer/constants'

export const UserTrainerProgress: CollectionConfig = {
  slug: 'user-trainer-progress',
  admin: {
    defaultColumns: ['user', 'task', 'isCompleted', 'attempts', 'completedAt'],
    group: 'Тренажёр',
  },
  access: {
    create: isAuthenticated,
    read: isAdminOrSelf,
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        if (!data) return data
        // Auto-set user for students on create
        if (operation === 'create' && req.user && req.user.role !== 'admin') {
          data.user = req.user.id
        }
        return data
      },
    ],
    afterChange: [awardTrainerPoints],
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      label: 'Пользователь',
    },
    {
      name: 'task',
      type: 'relationship',
      relationTo: 'trainer-tasks',
      required: true,
      label: 'Задача',
    },
    {
      name: 'isCompleted',
      type: 'checkbox',
      defaultValue: false,
      label: 'Решена',
    },
    {
      name: 'userCode',
      type: 'textarea',
      label: 'Код пользователя',
      maxLength: TRAINER_LIMITS.maxCodeLength,
    },
    {
      name: 'language',
      type: 'select',
      defaultValue: 'js',
      label: 'Язык решения',
      options: [...LANGUAGE_OPTIONS],
    },
    {
      name: 'failedAttempts',
      type: 'number',
      defaultValue: 0,
      label: 'Неудачных попыток',
      admin: {
        description: 'Считаются все отправки, не прошедшие тесты.',
      },
    },
    {
      name: 'verifiedBy',
      type: 'select',
      defaultValue: 'client',
      label: 'Чем подтверждено',
      options: [
        { label: 'Сервер (изолированная песочница)', value: 'server' },
        { label: 'Браузер (устаревший путь)', value: 'client' },
      ],
      admin: {
        description: 'Баллы начисляются только за решения, подтверждённые сервером.',
      },
    },
    {
      name: 'lastResult',
      type: 'json',
      label: 'Последний результат прогона',
      admin: {
        description: 'Краткая сводка: статус, счёт по тестам, имена упавших тестов.',
      },
    },
    {
      name: 'completedAt',
      type: 'date',
      label: 'Дата решения',
    },
    {
      name: 'attempts',
      type: 'number',
      defaultValue: 0,
      label: 'Количество попыток',
    },
  ],
}

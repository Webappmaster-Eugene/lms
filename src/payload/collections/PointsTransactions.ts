import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'
import { sendCompletionEmail } from '@/payload/hooks/sendNotification'
import { createCertificate } from '@/payload/hooks/createCertificate'
import { createPointsNotification } from '@/payload/hooks/createNotification'

export const PointsTransactions: CollectionConfig = {
  slug: 'points-transactions',
  admin: {
    defaultColumns: ['user', 'amount', 'reason', 'createdAt'],
    group: 'Геймификация',
  },
  hooks: {
    afterChange: [sendCompletionEmail, createCertificate, createPointsNotification],
  },
  access: {
    create: isAdmin,
    read: isAdminOrSelf,
    update: () => false, // Транзакции нельзя менять
    delete: isAdmin,
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
      name: 'amount',
      type: 'number',
      required: true,
      label: 'Количество баллов',
    },
    {
      name: 'reason',
      type: 'select',
      required: true,
      label: 'Причина',
      options: [
        { label: 'Урок пройден', value: 'lesson_completed' },
        { label: 'Курс завершён', value: 'course_completed' },
        { label: 'Роадмап завершён', value: 'roadmap_completed' },
        { label: 'Достижение получено', value: 'achievement_unlocked' },
        { label: 'Корректировка администратором', value: 'admin_adjustment' },
        { label: 'Задача тренажёра решена', value: 'trainer_task_completed' },
      ],
    },
    {
      name: 'relatedEntity',
      type: 'text',
      label: 'ID связанной сущности',
      admin: {
        description: 'ID урока, курса, роадмапа или достижения',
      },
    },
    {
      name: 'description',
      type: 'text',
      label: 'Описание',
    },
  ],
}

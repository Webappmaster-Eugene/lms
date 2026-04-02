import type { CollectionConfig } from 'payload'

import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'
import { isAdmin } from '@/payload/access/isAdmin'

export const Notifications: CollectionConfig = {
  slug: 'notifications',
  admin: {
    defaultColumns: ['user', 'title', 'isRead', 'createdAt'],
    group: 'Коммуникация',
  },
  access: {
    create: isAdmin,
    read: isAdminOrSelf,
    update: isAdminOrSelf,
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
      name: 'title',
      type: 'text',
      required: true,
      label: 'Заголовок',
    },
    {
      name: 'message',
      type: 'textarea',
      required: true,
      label: 'Текст',
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      label: 'Тип',
      defaultValue: 'info',
      options: [
        { label: 'Информация', value: 'info' },
        { label: 'Достижение', value: 'achievement' },
        { label: 'Курс завершён', value: 'course_completed' },
        { label: 'Роадмап завершён', value: 'roadmap_completed' },
        { label: 'Комментарий', value: 'comment' },
        { label: 'Задача тренажёра', value: 'trainer_task' },
        { label: 'Обращение в поддержку', value: 'support_message' },
      ],
    },
    {
      name: 'link',
      type: 'text',
      label: 'Ссылка (куда вести при клике)',
    },
    {
      name: 'isRead',
      type: 'checkbox',
      defaultValue: false,
      label: 'Прочитано',
    },
  ],
}

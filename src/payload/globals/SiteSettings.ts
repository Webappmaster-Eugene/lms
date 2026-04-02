import type { GlobalConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Настройки сайта',
  access: {
    read: isAuthenticated,
    update: isAdmin,
  },
  fields: [
    {
      name: 'platformName',
      type: 'text',
      defaultValue: 'MentorCareer LMS',
      required: true,
      label: 'Название платформы',
    },
    {
      name: 'platformDescription',
      type: 'textarea',
      label: 'Описание платформы',
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      label: 'Логотип',
    },
    {
      type: 'group',
      name: 'points',
      label: 'Настройки баллов',
      fields: [
        {
          name: 'lessonCompleted',
          type: 'number',
          defaultValue: 10,
          required: true,
          label: 'Баллы за урок',
        },
        {
          name: 'courseCompleted',
          type: 'number',
          defaultValue: 50,
          required: true,
          label: 'Бонус за курс',
        },
        {
          name: 'roadmapCompleted',
          type: 'number',
          defaultValue: 200,
          required: true,
          label: 'Бонус за роадмап',
        },
        {
          name: 'trainerTaskCompleted',
          type: 'number',
          defaultValue: 10,
          required: true,
          label: 'Баллы за задачу тренажёра',
        },
      ],
    },
    {
      type: 'group',
      name: 'contacts',
      label: 'Контактная информация',
      fields: [
        {
          name: 'telegramChannel',
          type: 'text',
          label: 'Telegram-канал',
          admin: {
            description: 'Ссылка на Telegram-канал (например: https://t.me/your_channel)',
          },
        },
        {
          name: 'telegramGroup',
          type: 'text',
          label: 'Telegram-группа',
          admin: {
            description: 'Ссылка на Telegram-группу для учеников',
          },
        },
        {
          name: 'website',
          type: 'text',
          label: 'Веб-сайт',
        },
        {
          name: 'email',
          type: 'text',
          label: 'Email для связи',
        },
      ],
    },
  ],
}

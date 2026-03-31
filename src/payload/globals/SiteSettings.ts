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
      ],
    },
  ],
}

import type { CollectionConfig } from 'payload'

import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'
import { isAdmin } from '@/payload/access/isAdmin'

export const Certificates: CollectionConfig = {
  slug: 'certificates',
  admin: {
    defaultColumns: ['user', 'type', 'title', 'issuedAt'],
    group: 'Прогресс',
  },
  access: {
    create: isAdmin,
    read: isAdminOrSelf,
    update: isAdmin,
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
      name: 'type',
      type: 'select',
      required: true,
      label: 'Тип',
      options: [
        { label: 'Курс', value: 'course' },
        { label: 'Роадмап', value: 'roadmap' },
      ],
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Название (курса/роадмапа)',
    },
    {
      name: 'relatedEntity',
      type: 'text',
      required: true,
      label: 'ID сущности',
    },
    {
      name: 'issuedAt',
      type: 'date',
      required: true,
      label: 'Дата выдачи',
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'certificateNumber',
      type: 'text',
      required: true,
      unique: true,
      label: 'Номер сертификата',
    },
  ],
}

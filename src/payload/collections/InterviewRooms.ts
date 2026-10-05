import type { CollectionConfig } from 'payload'

import { TRAINER_LIMITS } from '@/lib/trainer/constants'

export const InterviewRooms: CollectionConfig = {
  slug: 'interview-rooms',
  labels: { singular: 'Собеседование', plural: 'Собеседования' },
  admin: { useAsTitle: 'title', group: 'Тренажёр' },
  // Membership and version checks belong to the dedicated transactional API.
  access: {
    create: () => false,
    update: () => false,
    delete: () => false,
    read: ({ req }) => req.user?.isActive === true
      ? { members: { contains: req.user.id } }
      : false,
  },
  fields: [
    { name: 'token', type: 'text', required: true, unique: true, index: true },
    { name: 'owner', type: 'relationship', relationTo: 'users', required: true },
    { name: 'members', type: 'relationship', relationTo: 'users', hasMany: true, required: true },
    { name: 'presence', type: 'json' },
    { name: 'title', type: 'text', required: true },
    { name: 'descriptionMd', type: 'textarea' },
    { name: 'setupCode', type: 'textarea' },
    { name: 'setupTypes', type: 'textarea' },
    { name: 'code', type: 'textarea', maxLength: TRAINER_LIMITS.maxCodeLength },
    { name: 'language', type: 'select', required: true, options: ['js', 'ts'], defaultValue: 'js' },
    { name: 'version', type: 'number', required: true, defaultValue: 1, min: 1 },
    { name: 'endedAt', type: 'date' },
  ],
}

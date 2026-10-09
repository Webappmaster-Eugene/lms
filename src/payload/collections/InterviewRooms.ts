import { APIError, type CollectionConfig, type Where } from 'payload'

import { getTrainerAccess } from '@/server/trainer-access'

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
    read: async ({ req }) => {
      if (!req.user || req.user.isActive !== true) return false
      const scope = await getTrainerAccess(req.payload, req.user, req)
      if (!scope.hasAccess) return false
      const origin: Where = { and: [
        { or: [
          { sourceTaskKnown: { equals: true } },
          ...(scope.mode === 'all' ? [{ sourceTaskKnown: { equals: false } }, { sourceTaskKnown: { exists: false } }] : []),
        ] },
        { or: [{ sourceTaskId: { exists: false } }, { sourceTaskId: { in: scope.accessibleTaskIds.length ? scope.accessibleTaskIds : [-1] } }] },
      ] }
      const where: Where = { and: [{ members: { contains: req.user.id } }, ...(scope.admin ? [] : [origin])] }
      return where
    },
  },
  hooks: {
    beforeChange: [({ data, originalDoc, operation }) => {
      if (operation !== 'update' || !originalDoc) return data
      if ((Object.hasOwn(data, 'sourceTaskId') && (data.sourceTaskId ?? null) !== (originalDoc.sourceTaskId ?? null))
        || (Object.hasOwn(data, 'sourceTaskKnown') && (data.sourceTaskKnown === true) !== (originalDoc.sourceTaskKnown === true))) {
        throw new APIError('Источник комнаты нельзя изменить', 403)
      }
      return data
    }],
  },
  fields: [
    { name: 'token', type: 'text', required: true, unique: true, index: true },
    { name: 'sourceTaskId', type: 'number', min: 1, index: true, admin: { readOnly: true, description: 'Неизменяемый ID задачи сохраняется после её удаления.' } },
    { name: 'sourceTaskKnown', type: 'checkbox', defaultValue: () => false, admin: { readOnly: true } },
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

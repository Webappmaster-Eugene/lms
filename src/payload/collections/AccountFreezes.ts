import { Forbidden, type CollectionConfig } from 'payload'

import { FREEZE_REASONS, freezeReasons } from '@/lib/account-freeze'
import { isAdmin } from '@/payload/access/isAdmin'

const nobody = () => false
const readOnly = { readOnly: true }
const time = { ...readOnly, date: { pickerAppearance: 'dayAndTime' as const } }
const capability = (context: Record<string, unknown> | undefined) => context?.syncAccountFreezes === true

/**
 * Периоды заморозки ученика. Не поля users: SDK входа переписывает строку users целиком и
 * откатил бы заморозку, а плановая и ручная заморозки живут одновременно.
 * Пишет только src/server/account-freeze.ts; начавшиеся периоды остаются историей.
 */
export const AccountFreezes: CollectionConfig = {
  slug: 'account-freezes',
  lockDocuments: false,
  labels: { singular: 'Заморозка аккаунта', plural: 'Заморозки аккаунтов' },
  admin: {
    group: 'Доступ к обучению',
    useAsTitle: 'id',
    defaultColumns: ['id', 'user', 'startsAt', 'endsAt', 'reason', 'automatic'],
    description: 'Замораживают и размораживают на экране «Ученики и доступы». Здесь только история.',
  },
  defaultSort: '-startsAt',
  access: { create: nobody, read: isAdmin, update: nobody, delete: nobody },
  hooks: {
    beforeChange: [({ data, req }) => { if (!capability(req.context)) throw new Forbidden(req.t); return data }],
    beforeDelete: [({ req }) => { if (!capability(req.context)) throw new Forbidden(req.t) }],
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true, label: 'Ученик', admin: readOnly },
    { name: 'startsAt', type: 'date', required: true, index: true, label: 'Начало', admin: time },
    { name: 'endsAt', type: 'date', index: true, label: 'Конец', admin: { ...time, description: 'Пусто - бессрочно, до разморозки.' } },
    { name: 'reason', type: 'select', required: true, label: 'Причина', options: freezeReasons.map((value) => ({ value, label: FREEZE_REASONS[value] })), admin: readOnly },
    { name: 'automatic', type: 'checkbox', defaultValue: false, label: 'Автоматическая', admin: { ...readOnly, description: 'Плановая заморозка по сроку доступа: правило «через 6 месяцев после создания учётки» или дата с экрана учеников. Флажок «Тестовый ученик» её снимает.' } },
    { name: 'note', type: 'textarea', maxLength: 500, label: 'Заметка', admin: readOnly },
    { name: 'createdBy', type: 'relationship', relationTo: 'users', label: 'Заморозил', admin: readOnly },
    { name: 'endedBy', type: 'relationship', relationTo: 'users', label: 'Разморозил', admin: readOnly },
  ],
}

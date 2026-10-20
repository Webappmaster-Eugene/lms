import type { CollectionConfig } from 'payload'

import { broadcastCtaUrlError } from '@/lib/broadcast-markup'
import { cleanupBroadcastRelations } from '@/payload/hooks/cleanupOwnedRelations'

// Рассылки меняются только серверными маршрутами /api/manage/broadcasts: там проверки
// администратора, same-origin и переходов статуса, которых у REST Payload нет.
const closed = { create: () => false, read: () => false, update: () => false, delete: () => false }
const infrastructure = { hidden: true, group: 'Коммуникация' }

export const EmailBroadcasts: CollectionConfig = {
  slug: 'email-broadcasts', lockDocuments: false, admin: infrastructure, access: closed,
  hooks: { beforeDelete: [cleanupBroadcastRelations] },
  fields: [
    { name: 'subject', type: 'text', required: true, maxLength: 200 },
    { name: 'body', type: 'textarea', required: true, maxLength: 20_000 },
    { name: 'ctaLabel', type: 'text', maxLength: 60 },
    {
      name: 'ctaUrl', type: 'text', maxLength: 2000,
      validate: (value: unknown) => broadcastCtaUrlError(value) ?? true,
    },
    { name: 'audience', type: 'select', required: true, defaultValue: 'all', options: ['all', 'selected'] },
    { name: 'recipients', type: 'relationship', relationTo: 'users', hasMany: true },
    { name: 'status', type: 'select', required: true, defaultValue: 'draft', index: true, options: ['draft', 'sending', 'sent', 'cancelled', 'failed'] },
    { name: 'createdBy', type: 'relationship', relationTo: 'users' },
    { name: 'queuedAt', type: 'date' },
    { name: 'completedAt', type: 'date' },
    { name: 'recipientsTotal', type: 'number', defaultValue: 0, min: 0 },
    { name: 'excludedCount', type: 'number', defaultValue: 0, min: 0 },
  ],
}

export const EmailBroadcastDeliveries: CollectionConfig = {
  slug: 'email-broadcast-deliveries', lockDocuments: false, admin: infrastructure, access: closed,
  indexes: [{ fields: ['broadcast', 'user'], unique: true }],
  fields: [
    { name: 'broadcast', type: 'relationship', relationTo: 'email-broadcasts', required: true, index: true },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'status', type: 'select', required: true, defaultValue: 'pending', index: true, options: ['pending', 'processing', 'sent', 'failed', 'cancelled', 'skipped'] },
    { name: 'attempts', type: 'number', required: true, defaultValue: 0, min: 0, max: 5 },
    { name: 'nextAttemptAt', type: 'date', required: true, index: true },
    { name: 'claimToken', type: 'text', maxLength: 36 },
    { name: 'lastError', type: 'text', maxLength: 200 },
    { name: 'sentAt', type: 'date' },
  ],
}

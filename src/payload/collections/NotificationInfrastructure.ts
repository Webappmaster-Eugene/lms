import type { CollectionConfig } from 'payload'

const closed = { create: () => false, read: () => false, update: () => false, delete: () => false }
const infrastructure = { hidden: true, group: 'Коммуникация' }

export const NotificationPreferences: CollectionConfig = {
  slug: 'notification-preferences', lockDocuments: false, admin: infrastructure, access: closed,
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, unique: true },
    { name: 'pushEnabled', type: 'checkbox', defaultValue: false },
    { name: 'remindersEnabled', type: 'checkbox', defaultValue: true },
    { name: 'timezone', type: 'text', required: true, defaultValue: 'Europe/Moscow', maxLength: 80 },
    { name: 'reminderHour', type: 'number', required: true, defaultValue: 18, min: 8, max: 21 },
    { name: 'lastLearningAt', type: 'date', index: true },
    { name: 'reminderStage', type: 'number', defaultValue: 0, min: 0, max: 3 },
    { name: 'lastReminderAt', type: 'date' },
  ],
}

export const PushSubscriptions: CollectionConfig = {
  slug: 'push-subscriptions', lockDocuments: false, admin: infrastructure, access: closed,
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'endpointHash', type: 'text', required: true, unique: true, maxLength: 64 },
    { name: 'endpoint', type: 'text', required: true, maxLength: 2048 },
    { name: 'p256dh', type: 'text', required: true, maxLength: 100 },
    { name: 'auth', type: 'text', required: true, maxLength: 40 },
    { name: 'sessionHash', type: 'text', required: true, maxLength: 64 },
    { name: 'enabled', type: 'checkbox', defaultValue: true, index: true },
  ],
}

export const NotificationDeliveries: CollectionConfig = {
  slug: 'notification-deliveries', lockDocuments: false, admin: infrastructure, access: closed,
  indexes: [{ fields: ['notification', 'subscription'], unique: true }],
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'notification', type: 'relationship', relationTo: 'notifications', required: true },
    { name: 'subscription', type: 'relationship', relationTo: 'push-subscriptions', required: true },
    { name: 'status', type: 'select', required: true, defaultValue: 'pending', index: true, options: ['pending', 'processing', 'sent', 'failed', 'cancelled'] },
    { name: 'attempts', type: 'number', required: true, defaultValue: 0, min: 0, max: 5 },
    { name: 'nextAttemptAt', type: 'date', required: true, index: true },
    { name: 'claimToken', type: 'text', maxLength: 36 },
    { name: 'lastStatusCode', type: 'number' },
  ],
}

export const NotificationJobState: CollectionConfig = {
  slug: 'notification-job-state', lockDocuments: false, admin: infrastructure, access: closed,
  fields: [
    { name: 'key', type: 'text', required: true, unique: true },
    { name: 'leaseUntil', type: 'date', required: true },
    { name: 'claimToken', type: 'text', required: true },
    { name: 'userCursor', type: 'number', defaultValue: 0 },
  ],
}

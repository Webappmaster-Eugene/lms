import type { CollectionConfig } from 'payload'

export const TutoringCalendars: CollectionConfig = {
  slug: 'tutoring-calendars',
  lockDocuments: false,
  admin: { hidden: true },
  access: { read: () => false, create: () => false, update: () => false, delete: () => false },
  fields: [
    // A server still running the previous schema can delete a user during rollout.
    { name: 'owner', type: 'relationship', relationTo: 'users', unique: true },
    { name: 'googleSubject', type: 'text', required: true },
    { name: 'googleEmail', type: 'email', required: true },
    { name: 'calendarId', type: 'text' },
    { name: 'encryptedRefreshToken', type: 'text' },
    { name: 'status', type: 'select', required: true, options: ['connected', 'reconnect', 'disconnected'] },
    { name: 'streams', type: 'array', fields: [{ name: 'streamId', type: 'number', required: true, min: 1 }] },
    { name: 'nextSyncAt', type: 'date', index: true },
    { name: 'lastSyncedAt', type: 'date' },
    { name: 'lastError', type: 'select', options: ['temporary', 'calendar', 'authorization'] },
    { name: 'failures', type: 'number', required: true, defaultValue: 0, min: 0 },
    { name: 'scheduleDigest', type: 'text' },
  ],
}

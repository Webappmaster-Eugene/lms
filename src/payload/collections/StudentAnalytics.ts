import { Forbidden, type CollectionConfig } from 'payload'
import { studentEventTypes } from '@/lib/student-analytics'

const closed = { create: () => false, read: () => false, update: () => false, delete: () => false }
const infrastructure = { hidden: true, group: 'Пользователи' }
const guards: NonNullable<CollectionConfig['hooks']> = {
  beforeChange: [({ data, req }) => { if (req.context.syncStudentAnalytics !== true) throw new Forbidden(req.t); return data }],
  beforeDelete: [({ req }) => { if (req.context.syncStudentAnalytics !== true) throw new Forbidden(req.t) }],
}

export const StudentSessionTelemetry: CollectionConfig = {
  slug: 'student-session-telemetry', lockDocuments: false, admin: infrastructure, access: closed, hooks: guards,
  indexes: [{ fields: ['user', 'lastSeenAt'] }],
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'sessionHash', type: 'text', required: true, unique: true, maxLength: 64 },
    { name: 'firstSeenAt', type: 'date', required: true },
    { name: 'lastSeenAt', type: 'date', required: true, index: true },
    { name: 'expiresAt', type: 'date', required: true, index: true },
    { name: 'endedAt', type: 'date' },
    { name: 'device', type: 'text', required: true, maxLength: 40 },
    { name: 'browser', type: 'text', required: true, maxLength: 40 },
    { name: 'os', type: 'text', required: true, maxLength: 40 },
    { name: 'ip', type: 'text', maxLength: 45 },
    { name: 'ipExpiresAt', type: 'date', index: true },
    { name: 'countryCode', type: 'text', maxLength: 3 },
    { name: 'country', type: 'text', maxLength: 100 },
    { name: 'region', type: 'text', maxLength: 100 },
    { name: 'city', type: 'text', maxLength: 100 },
    { name: 'geoSource', type: 'select', required: true, defaultValue: 'unknown', options: ['local-mmdb', 'unknown'] },
    { name: 'timezone', type: 'text', maxLength: 80 },
    { name: 'standalone', type: 'checkbox' },
    { name: 'path', type: 'text', maxLength: 240 },
    { name: 'course', type: 'relationship', relationTo: 'courses' },
    { name: 'lesson', type: 'relationship', relationTo: 'lessons' },
    { name: 'lastEventAt', type: 'date' },
  ],
}

export const StudentLearningEvents: CollectionConfig = {
  slug: 'student-learning-events', lockDocuments: false, admin: infrastructure, access: closed,
  hooks: { ...guards, beforeChange: [({ data, req, operation }) => { if (req.context.syncStudentAnalytics !== true || operation !== 'create') throw new Forbidden(req.t); return data }] },
  indexes: [{ fields: ['user', 'at'] }],
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'eventKey', type: 'text', required: true, unique: true, maxLength: 180 },
    { name: 'type', type: 'select', required: true, options: [...studentEventTypes] },
    { name: 'source', type: 'select', required: true, options: ['server', 'observed'] },
    { name: 'at', type: 'date', required: true, index: true },
    { name: 'session', type: 'relationship', relationTo: 'student-session-telemetry' },
    { name: 'course', type: 'relationship', relationTo: 'courses' },
    { name: 'lesson', type: 'relationship', relationTo: 'lessons' },
    { name: 'taskId', type: 'number' },
    { name: 'achievementId', type: 'number' },
    { name: 'certificateId', type: 'number' },
    { name: 'path', type: 'text', maxLength: 240 },
  ],
}

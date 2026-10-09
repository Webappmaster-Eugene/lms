import { Forbidden, type CollectionConfig } from 'payload'

/** Browser observations never award points or change learning/reminder activity. */
export const WebVitalsReports: CollectionConfig = {
  slug: 'web-vitals-reports',
  lockDocuments: false,
  admin: { hidden: true, group: 'Пользователи' },
  access: { read: () => false, create: () => false, update: () => false, delete: () => false },
  hooks: {
    beforeChange: [({ data, req }) => { if (req.context.syncWebVitals !== true) throw new Forbidden(req.t); return data }],
    beforeDelete: [({ req }) => { if (req.context.syncWebVitals !== true) throw new Forbidden(req.t) }],
  },
  indexes: [{ fields: ['user', 'reportedAt'] }, { fields: ['sessionHash', 'createdAt'] }],
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'reportKey', type: 'text', required: true, unique: true, maxLength: 64 },
    { name: 'sessionHash', type: 'text', required: true, maxLength: 64 },
    { name: 'name', type: 'select', required: true, options: ['LCP', 'INP', 'CLS'] },
    { name: 'value', type: 'number', required: true, min: 0, max: 600000 },
    { name: 'routeTemplate', type: 'text', required: true, maxLength: 100 },
    { name: 'navigationType', type: 'select', options: ['navigate', 'reload', 'back-forward', 'back-forward-cache', 'prerender', 'restore', 'soft-navigation'] },
    { name: 'reportedAt', type: 'date', required: true, index: true },
    // First report in a session holds the shared, transactionally updated request quota.
    { name: 'quotaWindowStartedAt', type: 'date' },
    { name: 'quotaReportCount', type: 'number', min: 0, max: 120 },
  ],
}

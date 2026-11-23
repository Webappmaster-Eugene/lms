import type { CollectionConfig } from 'payload'

import { cleanupTutoringProject } from '@/payload/hooks/cleanupOwnedRelations'
import { isAdmin } from '@/payload/access/isAdmin'
import { tutoringPrograms } from '@/lib/tutoring'

const denied = () => false
const admin = { group: 'Менторство' }

export const TutoringCharges: CollectionConfig = {
  slug: 'tutoring-charges',
  admin,
  access: { read: isAdmin, create: denied, update: denied, delete: denied },
  labels: { singular: 'Оплата встречи', plural: 'Оплаты встреч' },
  indexes: [{ fields: ['participant', 'meeting'], unique: true }],
  fields: [
    { name: 'participant', type: 'relationship', relationTo: 'tutoring-participants', required: true },
    { name: 'meeting', type: 'number', min: 1, max: 32, required: true },
    { name: 'minutes', type: 'number', min: 0, max: 1440, required: true },
    { name: 'hourlyKopecks', type: 'number', min: 0, max: 100000000, required: true },
    { name: 'amountKopecks', type: 'number', min: 0, required: true },
    { name: 'status', type: 'select', options: ['due', 'paid', 'cancelled'], required: true },
    { name: 'paidAt', type: 'date' },
    { name: 'updatedBy', type: 'relationship', relationTo: 'users', required: true },
  ],
}

export const TutoringProjects: CollectionConfig = {
  slug: 'tutoring-projects',
  hooks: { beforeDelete: [cleanupTutoringProject] },
  admin,
  access: { read: isAdmin, create: denied, update: denied, delete: denied },
  labels: { singular: 'Проект менторства', plural: 'Проекты менторства' },
  indexes: [{ fields: ['student', 'program'], unique: true }, { fields: ['group', 'username'], unique: true }],
  fields: [
    { name: 'student', type: 'relationship', relationTo: 'users', required: true },
    { name: 'program', type: 'select', options: Object.keys(tutoringPrograms), required: true },
    { name: 'username', type: 'text', required: true, maxLength: 60 },
    { name: 'group', type: 'text', required: true, maxLength: 100 },
    { name: 'courseProject', type: 'text', required: true, maxLength: 200 },
    { name: 'gradingProject', type: 'text', required: true, maxLength: 200 },
    { name: 'projectId', type: 'number', unique: true },
    { name: 'projectUrl', type: 'text', maxLength: 500 },
    { name: 'gitlabUserId', type: 'number' },
    { name: 'state', type: 'select', options: ['queued', 'running', 'ready', 'failed', 'revoking', 'revoked', 'revoke_failed'], required: true, defaultValue: 'queued', index: true },
    { name: 'lease', type: 'text', maxLength: 36 },
    { name: 'leasedAt', type: 'date' },
    { name: 'attempts', type: 'number', min: 0, required: true, defaultValue: 0 },
    { name: 'error', type: 'text', maxLength: 1500 },
  ],
}

export const TutoringChecks: CollectionConfig = {
  slug: 'tutoring-checks',
  admin,
  access: { read: isAdmin, create: denied, update: denied, delete: denied },
  labels: { singular: 'Автопроверка менторства', plural: 'Автопроверки менторства' },
  indexes: [{ fields: ['project', 'mrIid'], unique: true }],
  fields: [
    { name: 'project', type: 'relationship', relationTo: 'tutoring-projects', required: true },
    { name: 'mrIid', type: 'number', min: 1, required: true },
    { name: 'stage', type: 'number', min: 0, max: 20, required: true },
    { name: 'verdict', type: 'text', required: true, maxLength: 30 },
    { name: 'passed', type: 'number', min: 0 },
    { name: 'total', type: 'number', min: 0 },
    { name: 'reportedAt', type: 'date', required: true },
  ],
}

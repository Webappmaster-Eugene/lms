import type { Access, CollectionConfig, FieldAccess, Where } from 'payload'
import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'

const recordingRead: Access = async ({ req }): Promise<boolean | Where> => {
  if (!req.user) return false
  return { or: [
    { and: [{ category: { in: ['mentor', 'community'] } }, { status: { equals: 'ready' } }] },
    { and: [{ category: { equals: 'personal' } }, { owner: { equals: req.user.id } }] },
  ] }
}
const sharedAdminWrite: Access = async ({ req, data }): Promise<boolean | Where> => {
  if (!await isAdmin({ req }) || data?.category === 'personal') return false
  return { category: { in: ['mentor', 'community'] } }
}
const sharedAdminCreate: Access = async ({ req, data }) => Boolean(await isAdmin({ req })) && (data?.category === 'mentor' || data?.category === 'community')
const sourceRead: FieldAccess = async ({ req }) => Boolean(await isAdmin({ req }))
const hiddenSource = { read: sourceRead }

export const InterviewDirections: CollectionConfig = {
  slug: 'interview-directions',
  labels: { singular: 'Направление собеседований', plural: 'Направления собеседований' },
  admin: { group: 'Собеседования', useAsTitle: 'title' },
  access: { read: isAuthenticated, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 100, label: 'Название' },
    { name: 'slug', type: 'text', required: true, unique: true, maxLength: 50, validate: (value: unknown) => typeof value === 'string' && /^[a-z][a-z0-9-]{0,49}$/.test(value) || 'Используйте латинские буквы, цифры и дефис', label: 'Адрес' },
    { name: 'description', type: 'textarea', maxLength: 1000, label: 'Описание' },
    { name: 'order', type: 'number', defaultValue: 0, label: 'Порядок' },
    { name: 'criteria', type: 'json', label: 'Критерии анализа' },
  ],
}

export const InterviewRecordings: CollectionConfig = {
  slug: 'interview-recordings', lockDocuments: false,
  labels: { singular: 'Запись собеседования', plural: 'Записи собеседований' },
  admin: { group: 'Собеседования', useAsTitle: 'title', defaultColumns: ['title', 'direction', 'category', 'status'] },
  access: { read: recordingRead, create: sharedAdminCreate, update: sharedAdminWrite, delete: sharedAdminWrite },
  indexes: [{ fields: ['direction', 'category', 'status'] }, { fields: ['owner', 'category'] }],
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 200, label: 'Название' },
    { name: 'description', type: 'textarea', maxLength: 2000, label: 'Описание' },
    { name: 'direction', type: 'relationship', relationTo: 'interview-directions', required: true, label: 'Направление' },
    { name: 'category', type: 'select', required: true, options: [{ label: 'Собесы ментора', value: 'mentor' }, { label: 'Чужие собесы', value: 'community' }, { label: 'Мои собесы', value: 'personal' }], label: 'Категория' },
    { name: 'owner', type: 'relationship', relationTo: 'users', index: true, label: 'Владелец', access: hiddenSource },
    { name: 'status', type: 'select', required: true, defaultValue: 'uploading', options: ['uploading', 'ready', 'failed'], index: true },
    { name: 'size', type: 'number', required: true, min: 0 },
    { name: 'mimeType', type: 'text', maxLength: 100 },
    { name: 'publicKey', type: 'text', maxLength: 1000, access: hiddenSource },
    { name: 'publicPath', type: 'text', maxLength: 2000, access: hiddenSource },
    { name: 'sourceKey', type: 'text', maxLength: 64, unique: true, access: hiddenSource },
    { name: 'diskPath', type: 'text', maxLength: 2000, access: hiddenSource },
    { name: 'uploadClaim', type: 'text', access: hiddenSource },
    { name: 'uploadLeaseUntil', type: 'date', access: hiddenSource },
    { name: 'analysisStatus', type: 'select', required: true, defaultValue: 'idle', index: true, options: ['idle', 'queued', 'processing', 'completed', 'failed'] },
    { name: 'analysisProgress', type: 'text', maxLength: 200 },
    { name: 'analysisError', type: 'text', maxLength: 500 },
    { name: 'analysisInput', type: 'json', access: hiddenSource },
    { name: 'analysisReport', type: 'json', access: hiddenSource },
    { name: 'analysisScore', type: 'json', access: hiddenSource },
    { name: 'analysisCriteria', type: 'json', access: hiddenSource },
    { name: 'analysisTranscript', type: 'textarea', access: hiddenSource },
    { name: 'analysisModel', type: 'text', maxLength: 100, access: hiddenSource },
    { name: 'analysisClaim', type: 'text', access: hiddenSource },
    { name: 'analysisLeaseUntil', type: 'date', index: true, access: hiddenSource },
    { name: 'analysisAttempts', type: 'number', defaultValue: 0, min: 0, access: hiddenSource },
    { name: 'analysisRequestedAt', type: 'date', access: hiddenSource },
  ],
}

export const InterviewAnalysisUsage: CollectionConfig = {
  slug: 'interview-analysis-usage', lockDocuments: false,
  admin: { hidden: true },
  access: { read: () => false, create: () => false, update: () => false, delete: () => false },
  fields: [
    { name: 'owner', type: 'relationship', relationTo: 'users', required: true, unique: true },
    { name: 'day', type: 'text', required: true, maxLength: 10 },
    { name: 'requests', type: 'number', required: true, min: 0, max: 3 },
  ],
}

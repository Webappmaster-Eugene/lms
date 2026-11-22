import { ValidationError, type CollectionConfig } from 'payload'

import { PPTX_MIME, TUTORING_DECK_DIRECTORY } from '@/lib/tutoring-file-types'

import { isMoscowTuesday, isTutoringMeeting, isTutoringProgram, tutoringHttpsUrl, tutoringPrograms, tutoringStatuses } from '@/lib/tutoring'
import { isAdmin, isAdminField } from '@/payload/access/isAdmin'
import { cleanupTutoringParticipant, cleanupTutoringStream } from '@/payload/hooks/cleanupOwnedRelations'
import { tutoringDeckAccess, tutoringPresentationAccess } from '@/server/tutoring-access'

const group = 'Репетиторство'

export const TutoringDeckFiles: CollectionConfig = {
  slug: 'tutoring-deck-files',
  labels: { singular: 'Файл презентации', plural: 'Файлы презентаций' },
  admin: { group, useAsTitle: 'filename' },
  access: { read: tutoringDeckAccess, create: () => false, update: () => false, delete: () => false },
  upload: {
    staticDir: TUTORING_DECK_DIRECTORY,
    mimeTypes: ['application/pdf', PPTX_MIME],
    modifyResponseHeaders: ({ headers }) => {
      headers.set('Cache-Control', 'private, no-store')
      headers.set('Content-Disposition', headers.get('Content-Type') === 'application/pdf' ? 'inline' : 'attachment')
      headers.set('X-Content-Type-Options', 'nosniff')
      return headers
    },
  },
  fields: [],
}
const programs = Object.entries(tutoringPrograms).map(([value, { label }]) => ({ value, label }))
const statuses = Object.entries(tutoringStatuses).map(([value, label]) => ({ value, label }))
const urlField = (value: unknown) => !value || (typeof value === 'string' && tutoringHttpsUrl(value)) || 'Нужна ссылка HTTPS без логина и пароля'
const bad = (path: string, message: string): never => { throw new ValidationError({ errors: [{ path, message }] }) }
const relId = (value: unknown): unknown => value && typeof value === 'object' && 'id' in value ? value.id : value

export const TutoringMeetings: CollectionConfig = {
  slug: 'tutoring-meetings',
  admin: { group, useAsTitle: 'title', defaultColumns: ['program', 'number', 'title'] },
  labels: { singular: 'Материалы встречи', plural: 'Материалы встреч' },
  access: { read: tutoringPresentationAccess, create: isAdmin, update: isAdmin, delete: isAdmin },
  indexes: [{ fields: ['program', 'number'], unique: true }],
  upload: {
    staticDir: 'media/tutoring',
    filesRequiredOnCreate: false,
    mimeTypes: ['application/pdf'],
    modifyResponseHeaders: ({ headers }) => {
      headers.set('Cache-Control', 'private, no-store')
      headers.set('Content-Disposition', 'inline')
      headers.set('X-Content-Type-Options', 'nosniff')
      return headers
    },
  },
  hooks: { beforeValidate: [({ data, originalDoc, operation, req }) => {
    const program: unknown = data?.program ?? originalDoc?.program
    const number: unknown = data?.number ?? originalDoc?.number
    if (!isTutoringProgram(program) || !isTutoringMeeting(number, program)) bad('number', 'Укажите номер встречи из программы')
    if (operation === 'create' && !req.file && (!data?.deckPdf || !data.deckPptx)) bad('deckPdf', 'Загрузите презентацию лекции')
    if (operation === 'update' && originalDoc && (program !== originalDoc.program || number !== originalDoc.number)) bad('number', 'Номер и программа встречи задаются при создании')
    return data
  }] },
  fields: [
    { name: 'program', type: 'select', required: true, options: programs, label: 'Программа' },
    { name: 'number', type: 'number', required: true, min: 1, max: 32, label: 'Порядковый номер' },
    { name: 'title', type: 'text', required: true, maxLength: 240, label: 'Тема' },
    { name: 'homework', type: 'array', required: true, minRows: 1, maxRows: 2, label: 'Домашняя работа', fields: [
      { name: 'stage', type: 'number', required: true, min: 0, max: 20, label: 'Этап программы' },
      { name: 'description', type: 'textarea', required: true, maxLength: 1200, label: 'Задание на встречу' },
      { name: 'assignment', type: 'textarea', maxLength: 50000, label: 'Условия и проверка проекта' },
      { name: 'practice', type: 'text', maxLength: 200, label: 'Путь к практикуму' },
    ] },
    { name: 'instructorNotes', type: 'textarea', maxLength: 80000, label: 'Заметки ведущего', access: { read: isAdminField } },
    { name: 'deckPdf', type: 'upload', relationTo: 'tutoring-deck-files', label: 'PDF слайдов', admin: { readOnly: true }, access: { create: () => false, update: () => false } },
    { name: 'deckPptx', type: 'upload', relationTo: 'tutoring-deck-files', label: 'Редактируемый PPTX', admin: { readOnly: true }, access: { read: isAdminField, create: () => false, update: () => false } },
    { name: 'deckOrigin', type: 'select', options: ['import', 'manual'], label: 'Источник презентации', admin: { readOnly: true },
      access: { read: isAdminField, create: () => false, update: () => false } },
    { name: 'sourceDigest', type: 'text', maxLength: 64, admin: { readOnly: true }, access: { read: isAdminField } },
  ],
}

export const TutoringStreams: CollectionConfig = {
  slug: 'tutoring-streams',
  labels: { singular: 'Поток репетиторства', plural: 'Потоки репетиторства' },
  admin: { group, useAsTitle: 'title', defaultColumns: ['title', 'program', 'status', 'startsAt'] },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: { beforeDelete: [cleanupTutoringStream], beforeValidate: [({ data, originalDoc, operation }) => {
    const program: unknown = data?.program ?? originalDoc?.program
    if (operation === 'update' && originalDoc && originalDoc.program !== program) bad('program', 'Программа потока задаётся при создании')
    if (!isTutoringProgram(program) || !isTutoringMeeting(data?.currentMeeting ?? originalDoc?.currentMeeting ?? 1, program)) {
      bad('currentMeeting', 'Укажите встречу из программы потока')
    }
    if (!isMoscowTuesday(data?.startsAt ?? originalDoc?.startsAt)) bad('startsAt', 'Первая встреча должна быть во вторник по Москве')
    for (const field of ['scheduleDates', 'scheduleOverrides'] as const) {
      const rows = data?.[field]
      if (rows == null) continue
      if (!Array.isArray(rows)) bad(field, 'Укажите список дат встреч')
      const numbers = new Set<number>()
      for (const row of rows) {
        if (!row || !isTutoringProgram(program) || !isTutoringMeeting(row.meeting, program) || numbers.has(row.meeting) ||
          typeof row.startsAt !== 'string' || !Number.isFinite(Date.parse(row.startsAt))) {
          bad(field, 'Укажите уникальный номер и дату встречи потока')
        }
        numbers.add(row.meeting)
      }
    }
    return data
  }] },
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 120, label: 'Название потока' },
    { name: 'program', type: 'select', required: true, options: programs, label: 'Программа' },
    { name: 'startsAt', type: 'date', required: true, label: 'Первая встреча', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    {
      name: 'scheduleDates', type: 'array', maxRows: 32, admin: { hidden: true },
      access: { create: () => false, update: () => false },
      fields: [
        { name: 'meeting', type: 'number', required: true, min: 1, max: 32 },
        { name: 'startsAt', type: 'date', required: true },
      ],
    },
    {
      name: 'scheduleOverrides', type: 'array', maxRows: 32, admin: { hidden: true },
      access: { create: () => false, update: () => false },
      fields: [
        { name: 'meeting', type: 'number', required: true, min: 1, max: 32 },
        { name: 'startsAt', type: 'date', required: true },
      ],
    },
    { name: 'status', type: 'select', defaultValue: 'draft', required: true, label: 'Доступ', options: [
      { label: 'Черновик', value: 'draft' }, { label: 'Открыт', value: 'active' }, { label: 'Архив', value: 'archived' },
    ] },
    { name: 'currentMeeting', type: 'number', defaultValue: 1, required: true, min: 1, max: 32, label: 'Открыто до встречи включительно' },
    { name: 'meetingUrl', type: 'text', maxLength: 1000, validate: urlField, label: 'Ссылка на созвон' },
  ],
}

export const TutoringParticipants: CollectionConfig = {
  slug: 'tutoring-participants',
  labels: { singular: 'Участник репетиторства', plural: 'Участники репетиторства' },
  admin: { group, defaultColumns: ['student', 'stream', 'currentMeeting', 'active'] },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  indexes: [{ fields: ['stream', 'student'], unique: true }, { fields: ['student', 'active'] }],
  hooks: { beforeDelete: [cleanupTutoringParticipant], beforeValidate: [async ({ data, originalDoc, operation, req }) => {
    const stream = relId(data?.stream ?? originalDoc?.stream)
    const student = relId(data?.student ?? originalDoc?.student)
    if (operation === 'update' && originalDoc && (stream !== relId(originalDoc.stream) || student !== relId(originalDoc.student))) {
      bad('student', 'Участник закреплён за учеником и потоком')
    }
    if (typeof stream !== 'number') return data
    const doc = await req.payload.findByID({ collection: 'tutoring-streams', id: stream, depth: 0, req, overrideAccess: true })
    if (!isTutoringMeeting(data?.currentMeeting ?? originalDoc?.currentMeeting ?? 1, doc.program)) bad('currentMeeting', 'Укажите встречу из программы потока')
    return data
  }] },
  fields: [
    { name: 'stream', type: 'relationship', relationTo: 'tutoring-streams', required: true, label: 'Поток', index: true },
    { name: 'student', type: 'relationship', relationTo: 'users', required: true, label: 'Ученик', index: true },
    { name: 'paidAt', type: 'date', required: true, label: 'Оплата подтверждена' },
    { name: 'active', type: 'checkbox', defaultValue: true, required: true, label: 'Доступ открыт' },
    { name: 'currentMeeting', type: 'number', defaultValue: 1, required: true, min: 1, max: 32, label: 'Текущая встреча ученика' },
  ],
}

export const TutoringReviews: CollectionConfig = {
  slug: 'tutoring-reviews',
  labels: { singular: 'Сдача репетиторства', plural: 'Сдачи репетиторства' },
  admin: { group, defaultColumns: ['participant', 'meeting', 'status'] },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  indexes: [{ fields: ['participant', 'meeting'], unique: true }],
  hooks: { beforeValidate: [async ({ data, originalDoc, operation, req }) => {
    const participant = relId(data?.participant ?? originalDoc?.participant)
    const meeting = data?.meeting ?? originalDoc?.meeting
    if (operation === 'update' && originalDoc && (participant !== relId(originalDoc.participant) || meeting !== originalDoc.meeting)) {
      bad('meeting', 'Сдача закреплена за встречей и участником')
    }
    if (typeof participant !== 'number') return data
    const member = await req.payload.findByID({ collection: 'tutoring-participants', id: participant, depth: 1, req, overrideAccess: true })
    const stream = member.stream
    if (typeof stream === 'number' || !stream || !isTutoringMeeting(meeting, stream.program)) bad('meeting', 'Укажите встречу из программы ученика')
    return data
  }] },
  fields: [
    { name: 'participant', type: 'relationship', relationTo: 'tutoring-participants', required: true, index: true, label: 'Участник' },
    { name: 'meeting', type: 'number', required: true, min: 1, max: 32, label: 'Встреча' },
    { name: 'status', type: 'select', required: true, defaultValue: 'assigned', options: statuses, label: 'Статус' },
    { name: 'submissionUrl', type: 'text', maxLength: 1000, validate: urlField, label: 'Ссылка на работу' },
    { name: 'feedback', type: 'textarea', maxLength: 3000, label: 'Комментарий наставника' },
  ],
}

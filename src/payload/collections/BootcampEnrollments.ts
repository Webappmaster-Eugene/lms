import type { CollectionConfig } from 'payload'

import { ENROLLMENT_STATUSES } from '@/lib/bootcamp-enrollment'
import { isAdmin } from '@/payload/access/isAdmin'

const readOnly = { readOnly: true }
const nobody = () => false

/**
 * Зачисление кандидата по заявке: учётка и курс в LMS, учётка и проект в GitLab.
 * Создаётся кнопкой «Зачислить» в заявке, дальше его ведёт исполнитель в VM GitLab.
 * Руками документ не создают и не меняют: переходы делает только сервер, иначе
 * исполнитель и CMS писали бы одно и то же поле наперегонки. Удалить можно: так
 * снимают ошибочное зачисление, чтобы начать заново (учётки при этом остаются).
 */
export const BootcampEnrollments: CollectionConfig = {
  slug: 'bootcamp-enrollments',
  labels: { singular: 'Зачисление', plural: 'Зачисления' },
  admin: {
    group: 'Буткемпы',
    useAsTitle: 'email',
    defaultColumns: ['email', 'gitlabUsername', 'streamGroup', 'status', 'createdAt', 'finishedAt'],
    description: 'Зачисляют из заявки кнопкой «Зачислить». LMS сразу заводит учётку и открывает курс методичек, учётку и проект в GitLab создаёт исполнитель в VM GitLab, обычно за полминуты.',
  },
  access: {
    create: nobody,
    read: isAdmin,
    update: nobody,
    delete: isAdmin,
  },
  fields: [
    { name: 'progress', type: 'ui', admin: { components: { Field: '/components/bootcamp/EnrollmentProgressField#EnrollmentProgressField' } } },
    { name: 'lead', type: 'relationship', relationTo: 'bootcamp-leads', required: true, unique: true, label: 'Заявка', admin: readOnly },
    { name: 'email', type: 'email', required: true, label: 'Email', admin: readOnly },
    { name: 'firstName', type: 'text', required: true, maxLength: 100, label: 'Имя', admin: readOnly },
    { name: 'lastName', type: 'text', required: true, maxLength: 100, label: 'Фамилия', admin: readOnly },
    { name: 'gitlabUsername', type: 'text', required: true, unique: true, maxLength: 60, label: 'Логин GitLab', admin: readOnly },
    { name: 'streamGroup', type: 'text', required: true, maxLength: 100, label: 'Группа потока в GitLab', admin: readOnly },
    { name: 'accessUntil', type: 'date', label: 'Курс методичек открыт до', admin: { ...readOnly, description: 'Пусто - без срока.' } },
    { name: 'status', type: 'select', required: true, defaultValue: 'queued', label: 'Состояние', options: ENROLLMENT_STATUSES.map(({ value, label }) => ({ value, label })), admin: { ...readOnly, position: 'sidebar' } },
    { name: 'steps', type: 'json', admin: { hidden: true } },
    { name: 'error', type: 'textarea', maxLength: 2000, label: 'Ошибка', admin: readOnly },
    { name: 'attempts', type: 'number', defaultValue: 0, label: 'Попыток исполнителя', admin: { ...readOnly, position: 'sidebar' } },
    { name: 'lmsUser', type: 'relationship', relationTo: 'users', label: 'Учётка LMS', admin: { ...readOnly, position: 'sidebar' } },
    { name: 'gitlabUserId', type: 'number', label: 'id учётки GitLab', admin: { ...readOnly, position: 'sidebar' } },
    { name: 'gitlabProjectId', type: 'number', index: true, label: 'id проекта GitLab', admin: { ...readOnly, position: 'sidebar' } },
    { name: 'gitlabProjectUrl', type: 'text', maxLength: 300, label: 'Проект в GitLab', admin: readOnly },
    { name: 'requestedBy', type: 'relationship', relationTo: 'users', label: 'Зачислил', admin: { ...readOnly, position: 'sidebar' } },
    { name: 'queuedAt', type: 'date', label: 'Поставлено в очередь', admin: { ...readOnly, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'startedAt', type: 'date', label: 'Исполнитель взял', admin: { ...readOnly, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'finishedAt', type: 'date', label: 'Закончено', admin: { ...readOnly, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'lmsSignedInAt', type: 'date', label: 'Первый вход в LMS', admin: { ...readOnly, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'gitlabSignedInAt', type: 'date', label: 'Первый вход в GitLab', admin: { ...readOnly, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } },
  ],
}

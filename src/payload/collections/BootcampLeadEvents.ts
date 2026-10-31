import type { CollectionConfig } from 'payload'

import { LEAD_EVENT_TYPES } from '@/lib/bootcamp-admission'
import { isAdmin } from '@/payload/access/isAdmin'

const readOnly = { readOnly: true }
const nobody = () => false

/**
 * Журнал заявки на буткемп: каждое действие наставника и событие системы, от заявки до
 * первого MR. Его показывает панель «Путь заявки», по нему считается воронка. Пишет только
 * сервер, в той же транзакции, что и само действие.
 */
export const BootcampLeadEvents: CollectionConfig = {
  slug: 'bootcamp-lead-events',
  labels: { singular: 'Событие заявки', plural: 'Журнал заявок' },
  admin: {
    group: 'Буткемпы',
    useAsTitle: 'message',
    defaultColumns: ['createdAt', 'lead', 'type', 'message', 'actor'],
    description: 'Что происходило с заявками: решения, письма, оплата, зачисление, первые входы и работа в GitLab.',
  },
  defaultSort: '-createdAt',
  access: {
    create: nobody,
    read: isAdmin,
    update: nobody,
    delete: nobody,
  },
  fields: [
    { name: 'lead', type: 'relationship', relationTo: 'bootcamp-leads', index: true, label: 'Заявка', admin: readOnly },
    { name: 'type', type: 'select', required: true, index: true, label: 'Событие', options: LEAD_EVENT_TYPES.map(({ value, label }) => ({ value, label })), admin: readOnly },
    { name: 'message', type: 'text', required: true, maxLength: 500, label: 'Что произошло', admin: readOnly },
    { name: 'actor', type: 'relationship', relationTo: 'users', label: 'Кто', admin: { ...readOnly, description: 'Пусто - событие системы или кандидата.' } },
    { name: 'data', type: 'json', label: 'Подробности', admin: readOnly },
  ],
}

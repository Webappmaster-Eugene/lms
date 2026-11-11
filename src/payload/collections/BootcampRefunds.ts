import type { CollectionConfig } from 'payload'

import { REFUND_METHODS, REFUND_STATUSES } from '@/lib/bootcamp-refunds'
import { isAdmin } from '@/payload/access/isAdmin'

const readOnly = { readOnly: true }
const nobody = () => false
const time = { ...readOnly, date: { pickerAppearance: 'dayAndTime' as const } }

/**
 * Возврат денег за буткемп. Пишет только сервер: кнопки «Вернуть деньги» и «Отметить возврат
 * вручную» в заявке и проверка состояния заявки Робокассы планировщиком. Удалять нельзя: это учёт денег.
 */
export const BootcampRefunds: CollectionConfig = {
  slug: 'bootcamp-refunds',
  labels: { singular: 'Возврат за буткемп', plural: 'Возвраты за буткемп' },
  admin: {
    group: 'Буткемпы',
    useAsTitle: 'id',
    defaultColumns: ['id', 'lead', 'amountKopecks', 'status', 'method', 'createdAt', 'finishedAt'],
    description: 'Возвраты через API Робокассы и отмеченные вручную. Выполненный возврат закрывает ученику курс методичек и GitLab.',
  },
  defaultSort: '-createdAt',
  access: {
    create: nobody,
    read: isAdmin,
    update: nobody,
    delete: nobody,
  },
  fields: [
    { name: 'lead', type: 'relationship', relationTo: 'bootcamp-leads', required: true, index: true, label: 'Заявка', admin: readOnly },
    { name: 'payment', type: 'relationship', relationTo: 'bootcamp-payments', required: true, index: true, label: 'Оплата', admin: readOnly },
    { name: 'amountKopecks', type: 'number', required: true, min: 1, label: 'Сумма, копеек', admin: readOnly },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'processing',
      label: 'Состояние',
      options: REFUND_STATUSES.map(({ value, label }) => ({ value, label })),
      admin: { ...readOnly, position: 'sidebar' },
    },
    {
      name: 'method',
      type: 'select',
      required: true,
      label: 'Как оформлен',
      options: REFUND_METHODS.map(({ value, label }) => ({ value, label })),
      admin: { ...readOnly, position: 'sidebar' },
    },
    { name: 'reason', type: 'textarea', required: true, maxLength: 1000, label: 'Причина', admin: readOnly },
    { name: 'requestId', type: 'text', maxLength: 64, index: true, label: 'Номер заявки в Робокассе', admin: { ...readOnly, description: 'GUID из API возвратов. У отмеченного вручную пусто.' } },
    { name: 'robokassaLabel', type: 'text', maxLength: 40, label: 'Состояние в Робокассе', admin: readOnly },
    { name: 'requestedBy', type: 'relationship', relationTo: 'users', label: 'Оформил', admin: { ...readOnly, position: 'sidebar' } },
    { name: 'checkedAt', type: 'date', label: 'Последняя проверка в Робокассе', admin: time },
    { name: 'finishedAt', type: 'date', label: 'Выполнен', admin: time },
  ],
}

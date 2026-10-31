import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'

const readOnly = { readOnly: true }
const nobody = () => false
const time = { ...readOnly, date: { pickerAppearance: 'dayAndTime' as const } }

/**
 * Попытка оплаты буткемпа. id записи - номер счёта (InvId) в Робокассе: каждая попытка
 * получает свой. Пишет только сервер: страница оплаты, уведомление Робокассы и кнопка
 * «Отметить оплату вручную». Удалять нельзя: это учёт денег.
 */
export const BootcampPayments: CollectionConfig = {
  slug: 'bootcamp-payments',
  labels: { singular: 'Оплата буткемпа', plural: 'Оплаты буткемпа' },
  admin: {
    group: 'Буткемпы',
    useAsTitle: 'id',
    defaultColumns: ['id', 'lead', 'amountKopecks', 'status', 'method', 'isTest', 'paidAt', 'createdAt'],
    description: 'Номер записи - номер счёта в Робокассе. Каждый переход к оплате создаёт новую запись, оплачена из них обычно одна.',
  },
  access: {
    create: nobody,
    read: isAdmin,
    update: nobody,
    delete: nobody,
  },
  fields: [
    { name: 'lead', type: 'relationship', relationTo: 'bootcamp-leads', required: true, index: true, label: 'Заявка', admin: readOnly },
    { name: 'amountKopecks', type: 'number', required: true, min: 1, label: 'Сумма, копеек', admin: readOnly },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      label: 'Состояние',
      options: [
        { value: 'pending', label: 'Ждёт оплаты' },
        { value: 'paid', label: 'Оплачено' },
        { value: 'cancelled', label: 'Отменено' },
      ],
      admin: { ...readOnly, position: 'sidebar' },
    },
    {
      name: 'method',
      type: 'select',
      required: true,
      defaultValue: 'robokassa',
      label: 'Как оплачено',
      options: [{ value: 'robokassa', label: 'Робокасса' }, { value: 'manual', label: 'Отмечено вручную' }],
      admin: { ...readOnly, position: 'sidebar' },
    },
    { name: 'isTest', type: 'checkbox', defaultValue: false, label: 'Тестовый режим Робокассы', admin: { ...readOnly, position: 'sidebar' } },
    { name: 'offerVersion', type: 'text', maxLength: 40, label: 'Редакция принятой оферты', admin: readOnly },
    { name: 'offerAcceptedAt', type: 'date', label: 'Оферта принята', admin: time },
    { name: 'paidAt', type: 'date', label: 'Оплачено', admin: time },
    { name: 'processedAt', type: 'date', label: 'Уведомление обработано', admin: { ...time, description: 'Повторное уведомление Робокассы с этой отметкой ничего не меняет.' } },
    { name: 'paymentMethod', type: 'text', maxLength: 100, label: 'Способ оплаты', admin: readOnly },
    { name: 'incCurrLabel', type: 'text', maxLength: 100, label: 'Валюта платежа в Робокассе', admin: readOnly },
    { name: 'fee', type: 'text', maxLength: 40, label: 'Комиссия Робокассы', admin: readOnly },
    { name: 'opKey', type: 'text', maxLength: 200, label: 'Ключ операции Робокассы', admin: { ...readOnly, description: 'Нужен для возврата через API. В уведомлении об оплате его нет, приходит при сверке.' } },
    { name: 'checkedAt', type: 'date', label: 'Последняя сверка с Робокассой', admin: time },
    { name: 'failReturnAt', type: 'date', label: 'Вернулся со страницы ошибки', admin: time },
    { name: 'comment', type: 'textarea', maxLength: 2000, label: 'Комментарий', admin: readOnly },
    { name: 'markedBy', type: 'relationship', relationTo: 'users', label: 'Отметил вручную', admin: { ...readOnly, position: 'sidebar' } },
  ],
}

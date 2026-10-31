import type { CollectionConfig } from 'payload'

import { ENTRY_TASK_MAX_SUBMISSIONS } from '@/lib/bootcamp-entry-task'
import { BOOTCAMP_LEAD_STATUSES, BOOTCAMP_PROGRAMS } from '@/lib/bootcamp-leads'
import { isAdmin } from '@/payload/access/isAdmin'
import { notifyLeadStatusChange } from '@/payload/hooks/bootcampLeadNotices'

const readOnly = { readOnly: true }
const time = { ...readOnly, date: { pickerAppearance: 'dayAndTime' as const } }
const sourceField = (name: string, label: string) => ({ name, type: 'text' as const, maxLength: 100, label, admin: readOnly })

/**
 * Предзапись с лендинга. Публичная форма пишет сюда только через
 * POST /api/bootcamp/leads; REST Payload и чтение — только администратору:
 * в заявках персональные данные.
 */
export const BootcampLeads: CollectionConfig = {
  slug: 'bootcamp-leads',
  labels: { singular: 'Заявка на буткемп', plural: 'Заявки на буткемп' },
  admin: {
    group: 'Буткемпы',
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'status', 'nextActionAt', 'createdAt', 'entrySubmittedAt', 'entryPassed', 'paidAt'],
    description: 'Предзапись с info.mentorcareer.ru/bootcamp/nodejs. Повторная отправка того же адреса не создаёт новую заявку, а увеличивает счётчик отправок.',
  },
  access: {
    create: isAdmin,
    read: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: { afterChange: [notifyLeadStatusChange] },
  // Одна заявка на адрес в программе: параллельные отправки не плодят дубли.
  indexes: [{ fields: ['program', 'email'], unique: true }],
  fields: [
    { name: 'leadPath', type: 'ui', admin: { components: { Field: '/components/bootcamp/LeadPathPanel#LeadPathPanel' } } },
    { name: 'email', type: 'email', required: true, label: 'Email', admin: readOnly },
    { name: 'name', type: 'text', maxLength: 100, label: 'Имя' },
    { name: 'program', type: 'select', required: true, defaultValue: 'nodejs', label: 'Программа', options: BOOTCAMP_PROGRAMS.map(({ value, label }) => ({ value, label })), admin: readOnly },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      label: 'Этап',
      options: BOOTCAMP_LEAD_STATUSES.map(({ value, label }) => ({ value, label })),
      // Этап меняют только кнопки «Пути заявки» и события системы: у каждого перехода свои письма и проверки.
      access: { update: () => false },
      admin: { ...readOnly, position: 'sidebar', description: 'Меняется кнопками в блоке «Путь заявки» вверху карточки.' },
    },
    { name: 'assignee', type: 'relationship', relationTo: 'users', label: 'Ответственный', filterOptions: { role: { equals: 'admin' } }, admin: { position: 'sidebar' } },
    { name: 'nextActionAt', type: 'date', label: 'Следующее действие', admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'note', type: 'textarea', maxLength: 5000, label: 'Заметки команды' },
    {
      name: 'source',
      type: 'group',
      label: 'Откуда пришла',
      admin: { description: 'Метки рекламы из адреса страницы и сайт, с которого перешли. Полный адрес не хранится.' },
      fields: [
        sourceField('utmSource', 'utm_source'),
        sourceField('utmMedium', 'utm_medium'),
        sourceField('utmCampaign', 'utm_campaign'),
        sourceField('utmContent', 'utm_content'),
        sourceField('utmTerm', 'utm_term'),
        { name: 'referrerHost', type: 'text', maxLength: 255, label: 'Сайт перехода', admin: readOnly },
      ],
    },
    { name: 'consentVersion', type: 'text', required: true, maxLength: 40, label: 'Версия согласия и политики', admin: readOnly },
    { name: 'consentAt', type: 'date', required: true, label: 'Согласие дано', admin: readOnly },
    { name: 'submissionCount', type: 'number', required: true, defaultValue: 1, min: 1, label: 'Отправок формы', admin: readOnly },
    { name: 'lastSubmittedAt', type: 'date', label: 'Последняя отправка', admin: readOnly },
    { name: 'notifiedAt', type: 'date', label: 'Письмо команде', admin: { ...readOnly, description: 'Пусто - письмо администраторам не ушло: заявка видна только в этом списке.' } },
    {
      name: 'entryTaskToken',
      type: 'text',
      unique: true,
      label: 'Личная ссылка на входное задание',
      admin: { ...readOnly, description: 'Страница задания на платформе: /entry-task/<эта строка>. Кто знает ссылку, тот видит задание, поэтому её не пересылают.' },
    },
    { name: 'entryTaskSentAt', type: 'date', label: 'Письмо с заданием', admin: { ...readOnly, description: 'Пусто - письмо кандидату не ушло. Повторная заявка с того же адреса отправит его снова.' } },
    { name: 'entryTaskDueAt', type: 'date', label: 'Срок входного задания', admin: readOnly },
    {
      type: 'collapsible',
      label: 'Решение входного задания',
      admin: { description: 'Кандидат решает задачи на странице задания и нажимает «Отправить решение». Тесты прогоняет сервер, здесь последняя отправка.' },
      fields: [
        { name: 'entrySubmittedAt', type: 'date', label: 'Решение отправлено', admin: { ...readOnly, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'entrySubmissionCount', type: 'number', label: 'Отправок решения', admin: { ...readOnly, description: `Не больше ${ENTRY_TASK_MAX_SUBMISSIONS}: после этого страница задания решение не принимает.` } },
        { name: 'entryPassed', type: 'number', label: 'Тестов пройдено', admin: readOnly },
        { name: 'entryTotal', type: 'number', label: 'Тестов всего', admin: readOnly },
        { name: 'entryResult', type: 'textarea', label: 'Итог по задачам', admin: readOnly },
        { name: 'entrySolution', type: 'code', label: 'Код кандидата', admin: { readOnly: true, language: 'javascript' } },
        // Тот же код по задачам: страница задания подставляет его в редакторы при повторном визите.
        { name: 'entrySolutions', type: 'json', admin: { hidden: true } },
      ],
    },
    {
      type: 'collapsible',
      label: 'Допуск и оплата',
      admin: { description: 'Заполняется кнопками «Пути заявки», страницей оплаты и уведомлениями Робокассы.' },
      fields: [
        { name: 'admittedAt', type: 'date', label: 'Допущен', admin: time },
        { name: 'admittedBy', type: 'relationship', relationTo: 'users', label: 'Допустил', admin: readOnly },
        { name: 'paymentAmountKopecks', type: 'number', min: 1, label: 'Сумма к оплате, копеек', admin: readOnly },
        { name: 'paymentDueAt', type: 'date', label: 'Оплатить до', admin: time },
        {
          name: 'paymentToken',
          type: 'text',
          unique: true,
          label: 'Личная ссылка на оплату',
          admin: { ...readOnly, description: 'Страница оплаты на платформе: /pay/<эта строка>.' },
        },
        { name: 'paymentLinkSentAt', type: 'date', label: 'Письмо со ссылкой на оплату', admin: time },
        { name: 'paymentPageOpenedAt', type: 'date', label: 'Страница оплаты открыта', admin: time },
        { name: 'paymentStartedAt', type: 'date', label: 'Первый переход к оплате', admin: time },
        { name: 'paymentReminderSentAt', type: 'date', label: 'Напоминание об оплате', admin: time },
        { name: 'paymentExpiredNoticeAt', type: 'date', label: 'Срок оплаты истёк', admin: time },
        { name: 'paidAt', type: 'date', label: 'Оплачено', admin: time },
        { name: 'decisionMessage', type: 'textarea', maxLength: 4000, label: 'Текст последнего решения в письме', admin: readOnly },
        { name: 'reviewAlertAt', type: 'date', label: 'Тревога: решение ждёт ответа', admin: time },
        // Данные для зачисления, введённые при допуске: после оплаты зачисление запускается с ними само.
        { name: 'admission', type: 'json', admin: { hidden: true } },
      ],
    },
  ],
}

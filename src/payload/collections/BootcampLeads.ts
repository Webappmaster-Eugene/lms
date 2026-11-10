import { APIError, type CollectionAfterDeleteHook, type CollectionBeforeDeleteHook, type CollectionConfig } from 'payload'

import { ENTRY_TASK_MAX_SUBMISSIONS } from '@/lib/bootcamp-entry-task'
import { BOOTCAMP_LEAD_HOURS, BOOTCAMP_LEAD_REASONS, BOOTCAMP_LEAD_STATUSES, BOOTCAMP_LEAD_URGENCIES, LEAD_ANSWER_LIMITS } from '@/lib/bootcamp-leads'
import { validateProgramKey } from '@/payload/fields/bootcampProgramKey'
import { isAdmin } from '@/payload/access/isAdmin'
import { notifyLeadStatusChange } from '@/payload/hooks/bootcampLeadNotices'

const readOnly = { readOnly: true }
const time = { ...readOnly, date: { pickerAppearance: 'dayAndTime' as const } }
// Форма карточки отправляет при сохранении все поля в том виде, в каком они были при открытии.
// Поля, которые пишут сервер, кнопки «Пути заявки» и кандидат, закрыты для изменения через Payload,
// иначе сохранение заметки затёрло бы ссылку на оплату, отметку оплаты или решение кандидата.
const serverOnly = { update: () => false }
const sourceField = (name: string, label: string) => ({ name, type: 'text' as const, maxLength: 100, label, access: serverOnly, admin: readOnly })

/** Счета - учёт денег: заявку с ними не удаляют, иначе платежи остались бы без владельца. */
const keepPaidLeads: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const payments = await req.payload.count({ collection: 'bootcamp-payments', where: { lead: { equals: id } }, overrideAccess: true, req })
  if (payments.totalDocs > 0) throw new APIError('По заявке есть счета оплаты, удалить её нельзя. Закройте заявку кнопками «Пути заявки».', 409, null, true)
}

/** Резюме живёт, пока живёт заявка: удаление заявки по отзыву согласия должно убрать и файл. */
const removeResume: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const resume = doc.resume && typeof doc.resume === 'object' ? doc.resume.id : doc.resume
  if (resume) await req.payload.delete({ collection: 'bootcamp-lead-resumes', id: resume, overrideAccess: true, req })
}

const options = (items: readonly { value: string, label: string }[]) => items.map(({ value, label }) => ({ value, label }))

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
    defaultColumns: ['email', 'name', 'telegram', 'wroteTelegram', 'urgency', 'program', 'status', 'createdAt', 'entryPassed'],
    description: 'Предзапись со страниц буткемпов на info.mentorcareer.ru. Повторная отправка того же адреса в той же программе не создаёт новую заявку, а увеличивает счётчик отправок.',
  },
  access: {
    create: isAdmin,
    read: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: { afterChange: [notifyLeadStatusChange], beforeDelete: [keepPaidLeads], afterDelete: [removeResume] },
  // Одна заявка на адрес в программе: параллельные отправки не плодят дубли.
  indexes: [{ fields: ['program', 'email'], unique: true }],
  fields: [
    { name: 'leadPath', type: 'ui', admin: { components: { Field: '/components/bootcamp/LeadPathPanel#LeadPathPanel' } } },
    { name: 'email', type: 'email', required: true, label: 'Email', admin: readOnly },
    { name: 'name', type: 'text', maxLength: 100, label: 'Имя' },
    {
      type: 'collapsible',
      label: 'Анкета кандидата',
      admin: { className: 'lead-answers' },
      fields: [
        { name: 'telegram', type: 'text', maxLength: 100, label: 'Telegram', access: serverOnly, admin: readOnly },
        { name: 'reason', type: 'select', options: options(BOOTCAMP_LEAD_REASONS), label: 'Тема', access: serverOnly, admin: readOnly },
        { name: 'problem', type: 'textarea', maxLength: LEAD_ANSWER_LIMITS.problem.max, label: 'В чём проблема', access: serverOnly, admin: { ...readOnly, rows: 6 } },
        { name: 'story', type: 'textarea', maxLength: LEAD_ANSWER_LIMITS.story.max, label: 'История', access: serverOnly, admin: { ...readOnly, rows: 6 } },
        { name: 'goal', type: 'textarea', maxLength: LEAD_ANSWER_LIMITS.goal.max, label: 'Какой результат будет успехом и к какому сроку', access: serverOnly, admin: { ...readOnly, rows: 3 } },
        { name: 'urgency', type: 'select', options: options(BOOTCAMP_LEAD_URGENCIES), label: 'Насколько срочно', access: serverOnly, admin: readOnly },
        { name: 'hoursPerWeek', type: 'select', options: options(BOOTCAMP_LEAD_HOURS), label: 'Часов в неделю', access: serverOnly, admin: readOnly },
        { name: 'links', type: 'textarea', maxLength: 2000, label: 'Ссылки', access: serverOnly, admin: readOnly },
        { name: 'resume', type: 'upload', relationTo: 'bootcamp-lead-resumes', label: 'Резюме', access: serverOnly, admin: readOnly },
        { name: 'fillSeconds', type: 'number', label: 'Время заполнения, секунд', access: serverOnly, admin: { ...readOnly, description: 'С первого касания формы до отправки. Меньше минуты при длинных ответах - повод присмотреться.' } },
      ],
    },
    // Ключ программы буткемпа (bootcamp-programs.key): от неё цена, оферта, курс и входное задание.
    { name: 'program', type: 'text', required: true, maxLength: 40, label: 'Программа', validate: validateProgramKey, admin: readOnly },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      label: 'Этап',
      options: BOOTCAMP_LEAD_STATUSES.map(({ value, label }) => ({ value, label })),
      // Этап меняют только кнопки «Пути заявки» и события системы: у каждого перехода свои письма и проверки.
      access: serverOnly,
      admin: { ...readOnly, position: 'sidebar', description: 'Меняется кнопками в блоке «Путь заявки» вверху карточки.' },
    },
    {
      name: 'wroteTelegram',
      type: 'checkbox',
      defaultValue: false,
      label: 'Написал в Telegram',
      admin: { position: 'sidebar', description: 'Отмечается вручную: после отправки формы кандидату предлагают написать в личку.' },
    },
    { name: 'assignee', type: 'relationship', relationTo: 'users', label: 'Ответственный', filterOptions: { role: { equals: 'admin' } }, admin: { position: 'sidebar' } },
    { name: 'nextActionAt', type: 'date', label: 'Следующее действие', admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } },
    {
      name: 'isTest',
      type: 'checkbox',
      defaultValue: false,
      label: 'Тестовая заявка',
      admin: { position: 'sidebar', description: 'Проверка команды: заявка не попадает в воронку, деньги за период и итоги недели. Письма, оплата и зачисление работают как обычно.' },
    },
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
        { name: 'referrerHost', type: 'text', maxLength: 255, label: 'Сайт перехода', access: serverOnly, admin: readOnly },
        {
          name: 'ymClientId', type: 'text', maxLength: 30, label: 'ClientID Яндекс Метрики', access: serverOnly,
          admin: { ...readOnly, description: 'По нему в Метрике (счётчик 114161391) можно найти визиты автора заявки. Пусто, если счётчик заблокирован или не успел загрузиться.' },
        },
      ],
    },
    { name: 'consentVersion', type: 'text', required: true, maxLength: 40, label: 'Версия согласия и политики', access: serverOnly, admin: readOnly },
    { name: 'consentAt', type: 'date', required: true, label: 'Согласие дано', access: serverOnly, admin: readOnly },
    { name: 'submissionCount', type: 'number', required: true, defaultValue: 1, min: 1, label: 'Отправок формы', access: serverOnly, admin: readOnly },
    { name: 'lastSubmittedAt', type: 'date', label: 'Последняя отправка', access: serverOnly, admin: readOnly },
    { name: 'notifiedAt', type: 'date', label: 'Письмо команде', access: serverOnly, admin: { ...readOnly, description: 'Пусто - письмо администраторам не ушло: заявка видна только в этом списке.' } },
    {
      name: 'entryTaskToken',
      type: 'text',
      unique: true,
      label: 'Личная ссылка на входное задание',
      access: serverOnly,
      admin: { ...readOnly, description: 'Страница задания на платформе: /entry-task/<эта строка>. Кто знает ссылку, тот видит задание, поэтому её не пересылают.' },
    },
    { name: 'entryTaskSentAt', type: 'date', label: 'Письмо с заданием', access: serverOnly, admin: { ...readOnly, description: 'Пусто - задание ещё не отправлено: оно уходит кнопкой в блоке «Путь заявки».' } },
    { name: 'entryTaskDueAt', type: 'date', label: 'Срок входного задания', access: serverOnly, admin: readOnly },
    {
      type: 'collapsible',
      label: 'Решение входного задания',
      admin: { description: 'Кандидат решает задачи на странице задания и нажимает «Отправить решение». Тесты прогоняет сервер, здесь последняя отправка.' },
      fields: [
        { name: 'entrySubmittedAt', type: 'date', label: 'Решение отправлено', access: serverOnly, admin: { ...readOnly, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'entrySubmissionCount', type: 'number', label: 'Отправок решения', access: serverOnly, admin: { ...readOnly, description: `Не больше ${ENTRY_TASK_MAX_SUBMISSIONS}: после этого страница задания решение не принимает.` } },
        { name: 'entryPassed', type: 'number', label: 'Тестов пройдено', access: serverOnly, admin: readOnly },
        { name: 'entryTotal', type: 'number', label: 'Тестов всего', access: serverOnly, admin: readOnly },
        { name: 'entryResult', type: 'textarea', label: 'Итог по задачам', access: serverOnly, admin: readOnly },
        { name: 'entrySolution', type: 'code', label: 'Код кандидата', access: serverOnly, admin: { readOnly: true, language: 'javascript' } },
        // Тот же код по задачам: страница задания подставляет его в редакторы при повторном визите.
        { name: 'entrySolutions', type: 'json', access: serverOnly, admin: { hidden: true } },
      ],
    },
    {
      type: 'collapsible',
      label: 'Допуск и оплата',
      admin: { description: 'Заполняется кнопками «Пути заявки», страницей оплаты и уведомлениями Робокассы.' },
      fields: [
        { name: 'admittedAt', type: 'date', label: 'Допущен', access: serverOnly, admin: time },
        { name: 'admittedBy', type: 'relationship', relationTo: 'users', label: 'Допустил', access: serverOnly, admin: readOnly },
        { name: 'paymentAmountKopecks', type: 'number', min: 1, label: 'Сумма к оплате, копеек', access: serverOnly, admin: readOnly },
        { name: 'paymentDueAt', type: 'date', label: 'Оплатить до', access: serverOnly, admin: time },
        {
          name: 'paymentToken',
          type: 'text',
          unique: true,
          label: 'Личная ссылка на оплату',
          access: serverOnly,
          admin: { ...readOnly, description: 'Страница оплаты на платформе: /pay/<эта строка>.' },
        },
        { name: 'paymentLinkSentAt', type: 'date', label: 'Письмо со ссылкой на оплату', access: serverOnly, admin: time },
        { name: 'paymentPageOpenedAt', type: 'date', label: 'Страница оплаты открыта', access: serverOnly, admin: time },
        { name: 'paymentStartedAt', type: 'date', label: 'Первый переход к оплате', access: serverOnly, admin: time },
        { name: 'paymentReminderSentAt', type: 'date', label: 'Напоминание об оплате', access: serverOnly, admin: time },
        { name: 'paymentExpiredNoticeAt', type: 'date', label: 'Срок оплаты истёк', access: serverOnly, admin: time },
        { name: 'paidAt', type: 'date', label: 'Оплачено', access: serverOnly, admin: time },
        { name: 'decisionMessage', type: 'textarea', maxLength: 4000, label: 'Текст последнего решения в письме', access: serverOnly, admin: readOnly },
        { name: 'reviewAlertAt', type: 'date', label: 'Тревога: решение ждёт ответа', access: serverOnly, admin: time },
        // Данные для зачисления, введённые при допуске: после оплаты зачисление запускается с ними само.
        { name: 'admission', type: 'json', access: serverOnly, admin: { hidden: true } },
      ],
    },
  ],
}

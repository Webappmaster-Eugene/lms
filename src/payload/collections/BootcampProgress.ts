import { Forbidden, ValidationError, type CollectionConfig } from 'payload'

import { BOOTCAMP_PROGRAM_WEEKS, submissionVerdicts } from '@/lib/bootcamp-progress'
import { isAdmin } from '@/payload/access/isAdmin'

const nobody = () => false
const dateTime = { date: { pickerAppearance: 'dayAndTime' as const } }

/**
 * Поток - группа учеников с общим календарём. Учеников к нему привязывает группа GitLab из
 * зачисления, сами зачисления не меняются. Сроки недель - план, по которому считается отставание.
 */
export const BootcampStreams: CollectionConfig = {
  slug: 'bootcamp-streams',
  labels: { singular: 'Поток буткемпа', plural: 'Потоки буткемпа' },
  admin: {
    group: 'Буткемпы',
    useAsTitle: 'title',
    defaultColumns: ['title', 'program', 'gitlabGroup', 'startsAt'],
    description: 'Календарь потока для экрана «Учёба буткемпа»: неделя считается просроченной, если к её сроку наставник не слил MR недели.',
  },
  access: { create: isAdmin, read: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: {
    beforeValidate: [({ data }) => {
      const weeks = (data?.weeks ?? []) as { week?: number | null }[]
      const numbers = weeks.map((item) => item.week).filter((week): week is number => typeof week === 'number')
      if (new Set(numbers).size !== numbers.length) throw new ValidationError({ errors: [{ path: 'weeks', message: 'У каждой учебной недели один срок: номер недели повторяется' }] })
      return data
    }],
  },
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 120, label: 'Название', admin: { description: 'Например, «Поток 1, февраль 2027».' } },
    { name: 'program', type: 'text', required: true, maxLength: 40, label: 'Программа', admin: { description: 'Ключ программы буткемпа, например nodejs.' } },
    { name: 'gitlabGroup', type: 'text', required: true, unique: true, maxLength: 100, label: 'Группа потока в GitLab', admin: { description: 'Та же, что «Группа потока в GitLab» в зачислении: по ней ученики попадают в поток.' } },
    { name: 'startsAt', type: 'date', required: true, label: 'Первая встреча', admin: dateTime },
    {
      name: 'weeks',
      type: 'array',
      label: 'Сроки учебных недель',
      labels: { singular: 'Неделя', plural: 'Недели' },
      admin: { description: 'Срок - к началу следующей пары встреч. Неделя без срока в план не входит.' },
      fields: [
        { name: 'week', type: 'number', required: true, min: 1, max: BOOTCAMP_PROGRAM_WEEKS, label: 'Учебная неделя' },
        { name: 'dueAt', type: 'date', required: true, label: 'Сдать до', admin: dateTime },
      ],
    },
  ],
}

/**
 * Сдача недели - один MR ученика из ветки week-NN. Строку ведёт обработчик вебхука GitLab:
 * MR открыт, новые коммиты, CI, вердикт бота проверки, слияние наставником или закрытие.
 */
export const BootcampWeekSubmissions: CollectionConfig = {
  slug: 'bootcamp-week-submissions',
  lockDocuments: false,
  labels: { singular: 'Сдача недели', plural: 'Сдачи недель' },
  admin: {
    group: 'Буткемпы',
    useAsTitle: 'title',
    defaultColumns: ['enrollment', 'week', 'title', 'verdict', 'mergedAt'],
    description: 'Заполняется само по событиям GitLab. Неделя принята, когда наставник слил MR.',
  },
  access: { create: nobody, read: isAdmin, update: nobody, delete: nobody },
  hooks: {
    beforeChange: [({ data, req }) => { if (req.context.syncBootcampSubmissions !== true) throw new Forbidden(req.t); return data }],
    beforeDelete: [({ req }) => { if (req.context.syncBootcampSubmissions !== true) throw new Forbidden(req.t) }],
  },
  indexes: [{ fields: ['enrollment', 'mrIid'], unique: true }, { fields: ['enrollment', 'week'] }],
  fields: [
    { name: 'enrollment', type: 'relationship', relationTo: 'bootcamp-enrollments', required: true, index: true, label: 'Зачисление' },
    { name: 'week', type: 'number', required: true, min: 1, max: BOOTCAMP_PROGRAM_WEEKS, label: 'Учебная неделя' },
    { name: 'mrIid', type: 'number', required: true, label: 'Номер MR' },
    { name: 'title', type: 'text', maxLength: 300, label: 'Название MR' },
    { name: 'mrUrl', type: 'text', maxLength: 500, label: 'Ссылка на MR' },
    { name: 'branch', type: 'text', maxLength: 100, label: 'Ветка' },
    { name: 'openedAt', type: 'date', label: 'Открыт', admin: { ...dateTime, description: 'Последнее открытие: после переоткрытия - его время.' } },
    { name: 'lastCommitAt', type: 'date', label: 'Последние коммиты', admin: dateTime },
    { name: 'pipelineStatus', type: 'select', options: ['success', 'failed'], label: 'CI' },
    { name: 'pipelineAt', type: 'date', label: 'CI закончился', admin: dateTime },
    { name: 'verdict', type: 'select', options: [...submissionVerdicts], label: 'Вердикт проверки' },
    { name: 'checksPassed', type: 'number', label: 'Проверок прошло' },
    { name: 'checksTotal', type: 'number', label: 'Проверок всего' },
    { name: 'attempt', type: 'number', label: 'Попытка' },
    { name: 'verdictAt', type: 'date', label: 'Вердикт получен', admin: dateTime },
    { name: 'mergedAt', type: 'date', label: 'Слит наставником', admin: dateTime },
    { name: 'closedAt', type: 'date', label: 'Закрыт без слияния', admin: dateTime },
    { name: 'reviewAlertAt', type: 'date', label: 'Напоминание о ревью', admin: dateTime },
  ],
}

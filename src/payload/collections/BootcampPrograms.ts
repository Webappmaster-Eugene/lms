import { APIError, type CollectionBeforeDeleteHook, type CollectionConfig } from 'payload'

import { DEFAULT_ENTRY_TASK_SET, ENTRY_TASK_SETS, findEntryTaskSet } from '@/data/bootcamp-entry/sets'
import { PROGRAM_KEY_PATTERN } from '@/lib/bootcamp-programs'
import { isAdmin } from '@/payload/access/isAdmin'

// Свой validate заменяет встроенную проверку required, поэтому пустое значение отвергается здесь.
const httpsUrl = (value: unknown) => {
  try {
    return typeof value === 'string' && new URL(value).protocol === 'https:' ? true : 'Нужен адрес https://…'
  } catch {
    return 'Нужен адрес https://…'
  }
}
// Путь GitLab: группа/проект латиницей, как его принимает API.
const gitlabPath = (value: unknown) => (typeof value === 'string' && /^[a-z0-9][a-z0-9_.-]*(\/[a-z0-9][a-z0-9_.-]*)*$/.test(value) ? true : 'Путь GitLab: латиница, цифры, . _ -, части через /')

/** По программе есть заявки: её не удаляют, иначе заявки и оплаты остались бы без условий. */
const keepUsedPrograms: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const program = await req.payload.findByID({ collection: 'bootcamp-programs', id, depth: 0, overrideAccess: true, req })
  const leads = await req.payload.count({ collection: 'bootcamp-leads', where: { program: { equals: program.key } }, overrideAccess: true, req })
  if (leads.totalDocs > 0) throw new APIError(`По программе «${program.shortTitle}» есть заявки (${leads.totalDocs}), удалить её нельзя. Снимите флажок «Принимает заявки».`, 409, null, true)
}

/**
 * Программа буткемпа: всё, что раньше было константами одного буткемпа Node.js, -
 * цена, оферта, строка чека, курс методичек, проект и группа GitLab, входное задание.
 * Заявка ссылается на программу ключом (`program`), поэтому ключ после создания не меняется.
 */
export const BootcampPrograms: CollectionConfig = {
  slug: 'bootcamp-programs',
  labels: { singular: 'Программа буткемпа', plural: 'Программы буткемпов' },
  admin: {
    group: 'Буткемпы',
    useAsTitle: 'title',
    defaultColumns: ['title', 'key', 'isActive', 'priceKopecks', 'manualsCourse'],
    description: 'Условия каждого буткемпа. Новая заявка, допуск, оплата и зачисление берут их из программы заявки.',
  },
  access: {
    create: isAdmin,
    read: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: { beforeDelete: [keepUsedPrograms] },
  fields: [
    {
      name: 'key',
      type: 'text',
      required: true,
      unique: true,
      maxLength: 40,
      label: 'Ключ программы',
      // Ключ хранится в заявках и уходит формой лендинга: смена отвязала бы их от программы.
      access: { update: () => false },
      validate: (value: unknown) => (typeof value === 'string' && PROGRAM_KEY_PATTERN.test(value) ? true : 'Латинские буквы, цифры и дефис, с буквы, до 40 знаков'),
      admin: { description: 'Как в форме лендинга, например nodejs. После создания не меняется.' },
    },
    { name: 'title', type: 'text', required: true, maxLength: 120, label: 'Название', admin: { description: 'Полностью, для команды: «Node.js: backend сервиса проката».' } },
    { name: 'shortTitle', type: 'text', required: true, maxLength: 40, label: 'Короткое название', admin: { description: 'Подставляется в тексты писем и страниц после слова «буткемп»: для «буткемп Node.js» здесь Node.js.' } },
    { name: 'isActive', type: 'checkbox', defaultValue: true, label: 'Принимает заявки', admin: { position: 'sidebar', description: 'Снятый флажок закрывает форму лендинга для этой программы. Начатые заявки идут дальше.' } },
    { name: 'landingUrl', type: 'text', required: true, maxLength: 300, label: 'Страница на лендинге', validate: httpsUrl, admin: { description: 'Ссылка «О буткемпе» на страницах задания и оплаты.' } },
    {
      type: 'collapsible',
      label: 'Оплата',
      fields: [
        { name: 'priceKopecks', type: 'number', required: true, min: 100, label: 'Цена потока, копеек', admin: { description: 'Сумма в форме «Допустить» по умолчанию. Та же цена должна стоять на лендинге.' } },
        { name: 'paymentDueDays', type: 'number', required: true, defaultValue: 7, min: 1, max: 60, label: 'Срок оплаты, дней' },
        { name: 'offerUrl', type: 'text', required: true, maxLength: 300, label: 'Договор-оферта', validate: httpsUrl },
        { name: 'offerVersion', type: 'text', required: true, maxLength: 40, label: 'Редакция оферты', admin: { description: 'Пишется в каждую оплату. Менять вместе с текстом оферты на лендинге.' } },
        { name: 'receiptItemName', type: 'text', required: true, maxLength: 128, label: 'Строка чека', admin: { description: 'Наименование услуги в чеке Робокассы, до 128 знаков.' } },
      ],
    },
    {
      type: 'collapsible',
      label: 'Зачисление',
      fields: [
        { name: 'manualsCourse', type: 'relationship', relationTo: 'courses', label: 'Курс методичек', admin: { description: 'Назначается каждому зачисленному. Без него допустить на программу нельзя.' } },
        { name: 'gitlabCourseProject', type: 'text', required: true, defaultValue: 'bootcamp/course', maxLength: 200, label: 'Репозиторий курса в GitLab', validate: gitlabPath, admin: { description: 'Из него создаётся проект ученика.' } },
        { name: 'gitlabStreamGroup', type: 'text', required: true, maxLength: 100, label: 'Группа потока по умолчанию', validate: gitlabPath, admin: { description: 'Подставляется в форму допуска. Группа должна быть в GitLab и в GRADER_GROUPS проекта проверки.' } },
        { name: 'gradingProject', type: 'text', required: true, defaultValue: 'bootcamp-staff/grading', maxLength: 200, label: 'Проект автоматической проверки', validate: gitlabPath },
      ],
    },
    {
      name: 'entryTaskSet',
      // Текст, а не select: select в Postgres - enum, и каждый набор из кода требовал бы миграции.
      type: 'text',
      required: true,
      defaultValue: DEFAULT_ENTRY_TASK_SET,
      maxLength: 40,
      label: 'Входное задание',
      validate: (value: unknown) => (findEntryTaskSet(typeof value === 'string' ? value : null) ? true : `Такого набора нет. Есть: ${ENTRY_TASK_SETS.map((set) => set.key).join(', ')}`),
      admin: { description: `Ключ набора задач из кода (src/data/bootcamp-entry). Сейчас есть: ${ENTRY_TASK_SETS.map((set) => `${set.key} (${set.label})`).join('; ')}. Смена набора меняет задачи и у тех, кто ещё решает.` },
    },
  ],
}

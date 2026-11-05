import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'

export const LEAD_RESUMES_DIR = 'media/bootcamp-lead-resumes'

/**
 * Резюме из заявки на буткемп. Файл с персональными данными: читает его только администратор,
 * а создаёт только маршрут формы после проверки содержимого, поэтому create через REST закрыт.
 */
export const BootcampLeadResumes: CollectionConfig = {
  slug: 'bootcamp-lead-resumes',
  labels: { singular: 'Резюме кандидата', plural: 'Резюме кандидатов' },
  admin: {
    group: 'Буткемпы',
    useAsTitle: 'originalName',
    defaultColumns: ['originalName', 'filesize', 'createdAt'],
    description: 'Файлы из заявок на буткемп. Удаляются вместе с заявкой.',
  },
  access: {
    create: () => false,
    read: isAdmin,
    update: () => false,
    delete: isAdmin,
  },
  upload: {
    staticDir: LEAD_RESUMES_DIR,
    // DOCX - это ZIP, и определитель типа в Payload не у всех редакторов отличает его от архива. Состав файла
    // уже проверен в leadResumeKind, а другого пути сюда нет: create закрыт.
    mimeTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'],
    modifyResponseHeaders: ({ headers }) => {
      headers.set('Cache-Control', 'private, no-store')
      headers.set('X-Content-Type-Options', 'nosniff')
      // Файл прислал посторонний человек: браузер администратора его сохраняет, а не открывает в кабинете.
      headers.set('Content-Disposition', 'attachment')
      return headers
    },
  },
  fields: [
    { name: 'originalName', type: 'text', maxLength: 200, label: 'Имя файла у кандидата', admin: { readOnly: true } },
  ],
}

import { Forbidden, type CollectionConfig } from 'payload'

export const adminDigestKinds = ['inactive-students', 'bootcamp-lagging'] as const
export type AdminDigestKind = (typeof adminDigestKinds)[number]

/**
 * Отметки еженедельных сводок наставнику в Telegram: строка пишется в той же транзакции, что
 * и решение отправить, поэтому второй процесс приложения во время выката сводку не повторит.
 */
export const AdminDigests: CollectionConfig = {
  slug: 'admin-digests',
  lockDocuments: false,
  labels: { singular: 'Сводка наставнику', plural: 'Сводки наставнику' },
  admin: { hidden: true, group: 'Пользователи', useAsTitle: 'period' },
  access: { create: () => false, read: () => false, update: () => false, delete: () => false },
  hooks: {
    beforeChange: [({ data, req }) => { if (req.context.syncAdminDigests !== true) throw new Forbidden(req.t); return data }],
    beforeDelete: [({ req }) => { if (req.context.syncAdminDigests !== true) throw new Forbidden(req.t) }],
  },
  indexes: [{ fields: ['kind', 'period'], unique: true }],
  fields: [
    { name: 'kind', type: 'select', required: true, options: [...adminDigestKinds] },
    { name: 'period', type: 'text', required: true, maxLength: 40 },
    { name: 'summary', type: 'textarea', maxLength: 4000 },
  ],
}

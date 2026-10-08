import { Forbidden, type CollectionConfig } from 'payload'

/** No raw SID or JWT is stored; records exist until every signed token for that SID expires. */
export const AuthSessionRevocations: CollectionConfig = {
  slug: 'auth-session-revocations', lockDocuments: false,
  admin: { hidden: true, group: 'Пользователи' },
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  hooks: {
    beforeChange: [({ data, req }) => { if (req.context?.syncAuthSessionRevocations !== true) throw new Forbidden(req.t); return data }],
    beforeDelete: [({ req }) => { if (req.context?.syncAuthSessionRevocations !== true) throw new Forbidden(req.t) }],
  },
  indexes: [{ fields: ['user', 'sessionHash'], unique: true }],
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'sessionHash', type: 'text', required: true, maxLength: 64, validate: (value: string | null | undefined) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? true : 'Ожидается SHA-256 идентификатора сессии' },
    { name: 'expiresAt', type: 'date', required: true, index: true },
  ],
}

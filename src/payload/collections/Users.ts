import { APIError, type CollectionConfig, type PayloadRequest } from 'payload'
import { normalizeTelegram } from '@/lib/profile'
import { captureProfileCredentials, protectProfileCredentials } from '@/payload/hooks/protectProfileCredentials'
import { validateStudentAvatar } from '@/payload/hooks/validateStudentAvatar'
import { rejectForeignLoginOrigin } from '@/payload/hooks/rejectForeignLoginOrigin'

import { isAdmin } from '@/payload/access/isAdmin'
import { auditLearningAccessMode } from '@/payload/hooks/learningAccessMode'
import { lockLearningModeChange, lockLearningUserDelete } from '@/payload/hooks/learningAccessLock'
import { captureRawCollectionPatch } from '@/payload/hooks/rawCollectionPatch'
import { createLearningAccessPolicy, normalizeLearningLoginIdentity, reflectLearningAccessPolicy } from '@/payload/hooks/learningAccessPolicy'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { filterRevokedAuthSessions, revokeAuthenticatedSessions } from '@/payload/hooks/authSessionRevocations'
import { lockSdkAuthOperation } from '@/payload/hooks/lockSdkAuthOperation'
import { resetPasswordEmail } from '@/payload/emails/templates'
import { sendInviteEmail } from '@/payload/hooks/sendNotification'
import { cleanupUserRelations } from '@/payload/hooks/cleanupOwnedRelations'
import { recordStudentLogin, recordStudentLogout } from '@/server/student-analytics'

type ForgotPasswordArgs = {
  token?: string
  user?: { firstName?: string | null }
}

async function canAdministerUsers({ req }: { req: PayloadRequest }): Promise<boolean> {
  return Boolean(req.user && (await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role === 'admin')
}

/** Дефолт Payload ведёт на `{serverURL}/admin/reset/{token}` — в админку, а не на нашу `/reset-password`. */
function buildResetPasswordEmail(args: ForgotPasswordArgs | undefined) {
  const token = args?.token

  if (!token) {
    throw new Error('Cannot build reset-password email: Payload did not provide a token')
  }

  return resetPasswordEmail(args?.user?.firstName ?? '', token)
}

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    tokenExpiration: 60 * 60 * 24 * 30, // 30 дней для JWT, cookie и серверной сессии
    cookies: {
      secure: new URL(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000').protocol === 'https:',
    },
    forgotPassword: {
      // `expiration` не задаём намеренно — см. INVITE_TOKEN_TTL_MS в sendNotification.ts.
      generateEmailSubject: (args) => buildResetPasswordEmail(args).subject,
      generateEmailHTML: (args) => buildResetPasswordEmail(args).html,
    },
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'firstName', 'lastName', 'role', 'isActive'],
    group: 'Пользователи',
  },
  hooks: {
    beforeOperation: [rejectForeignLoginOrigin, captureRawCollectionPatch, captureProfileCredentials, lockSdkAuthOperation],
    beforeLogin: [normalizeLearningLoginIdentity],
    afterLogin: [recordStudentLogin],
    beforeChange: [lockLearningModeChange, protectProfileCredentials, validateStudentAvatar],
    afterChange: [createLearningAccessPolicy, sendInviteEmail, auditLearningAccessMode],
    afterRead: [reflectLearningAccessPolicy, filterRevokedAuthSessions],
    afterLogout: [revokeAuthenticatedSessions, recordStudentLogout],
    beforeDelete: [lockLearningUserDelete, cleanupUserRelations],
  },
  access: {
    create: isAdmin,
    read: async ({ req }) => {
      if (!req.user) return false
      if ((await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role === 'admin') return true
      return { id: { equals: req.user.id } }
    },
    update: async ({ req }) => {
      const user = req.user
      if (!user) return false
      if ((await getAuthoritativeLearningPolicy(req.payload, user.id, req)).role === 'admin') return true
      // Студент может редактировать только свой профиль
      return { id: { equals: user.id } }
    },
    delete: isAdmin,
    admin: canAdministerUsers,
  },
  fields: [
    { name: 'learningAccessAssignments', type: 'ui', admin: { components: { Field: '/components/learning-access/UserLearningAccessLink#UserLearningAccessLink' } } },
    { name: 'studentAnalytics', type: 'ui', admin: { components: { Field: '/components/student-analytics/UserStudentAnalyticsLink#UserStudentAnalyticsLink' } } },
    {
      name: 'learningAccessMode', type: 'select', defaultValue: 'assigned', label: 'Доступ к обучению',
      options: [{ label: 'Все опубликованные курсы', value: 'all' }, { label: 'Только назначенные материалы', value: 'assigned' }],
      access: { create: canAdministerUsers, update: canAdministerUsers },
      admin: { position: 'sidebar', description: 'Назначения и исключения задаются в разделе «Доступ к обучению». Видимость каталога настраивается отдельно.' },
    },
    {
      name: 'learningCatalogVisibility', type: 'select', defaultValue: () => 'assigned', label: 'Видимость каталога',
      options: [{ label: 'Показывать только назначенное', value: 'assigned' }, { label: 'Показывать опубликованный каталог', value: 'catalog' }],
      access: { create: canAdministerUsers, update: canAdministerUsers },
      admin: { position: 'sidebar', description: 'Скрывает неназначенные материалы, в том числе из поиска и прямых ссылок.' },
    },
    {
      name: 'trainerAccessMode', type: 'select', defaultValue: () => 'assigned', label: 'Доступ к тренажёру',
      options: [{ label: 'Только назначенные темы и задачи', value: 'assigned' }, { label: 'Все опубликованные задачи', value: 'all' }, { label: 'Полностью закрыт', value: 'disabled' }],
      access: { create: canAdministerUsers, update: canAdministerUsers },
      admin: { position: 'sidebar', description: 'Точечные назначения задаются в разделе «Доступ к обучению».' },
    },
    {
      name: 'firstName',
      type: 'text',
      required: true,
      label: 'Имя',
      maxLength: 100,
    },
    {
      name: 'lastName',
      type: 'text',
      required: true,
      label: 'Фамилия',
      maxLength: 100,
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'student',
      label: 'Роль',
      options: [
        { label: 'Администратор', value: 'admin' },
        { label: 'Студент', value: 'student' },
      ],
      access: {
        update: canAdministerUsers,
      },
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
      label: 'Аватар',
    },
    {
      name: 'telegram',
      type: 'text',
      label: 'Telegram',
      maxLength: 64,
      hooks: { beforeValidate: [({ value }) => {
        try { return normalizeTelegram(value === undefined ? null : value) }
        catch (error) { throw new APIError(error instanceof Error ? error.message : 'Некорректный Telegram', 400) }
      }] },
      validate: (value: unknown) => { try { normalizeTelegram(value); return true } catch (error) { return error instanceof Error ? error.message : 'Некорректный Telegram' } },
    },
    {
      name: 'bio',
      type: 'textarea',
      label: 'О себе',
      maxLength: 500,
    },
    {
      name: 'totalPoints',
      type: 'number',
      defaultValue: 0,
      label: 'Баллы',
      // Пересчитывается хуками из транзакций; иначе студент выставлял себе баллы через REST
      access: {
        create: canAdministerUsers,
        update: canAdministerUsers,
      },
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      label: 'Активен',
      // Отключает вход и сессии аккаунта, а также скрывает студента из лидерборда.
      access: {
        create: canAdministerUsers,
        update: canAdministerUsers,
      },
      admin: {
        position: 'sidebar',
        description: 'Отключение блокирует новый вход и действующие сессии аккаунта, а также скрывает его из лидерборда.',
      },
    },
  ],
}

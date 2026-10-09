import type { CollectionConfig, PayloadRequest } from 'payload'
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
    beforeOperation: [rejectForeignLoginOrigin, captureRawCollectionPatch, lockSdkAuthOperation],
    beforeLogin: [normalizeLearningLoginIdentity],
    afterLogin: [recordStudentLogin],
    beforeChange: [lockLearningModeChange, validateStudentAvatar],
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
      admin: { position: 'sidebar', description: 'Назначения и исключения задаются в разделе «Доступ к обучению». Каталог и карты доступны для просмотра.' },
    },
    {
      name: 'firstName',
      type: 'text',
      required: true,
      label: 'Имя',
    },
    {
      name: 'lastName',
      type: 'text',
      required: true,
      label: 'Фамилия',
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

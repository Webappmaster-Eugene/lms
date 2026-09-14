import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { resetPasswordEmail } from '@/payload/emails/templates'
import { sendInviteEmail } from '@/payload/hooks/sendNotification'

type ForgotPasswordArgs = {
  token?: string
  user?: { firstName?: string | null }
}

/**
 * Собирает письмо восстановления пароля.
 *
 * Без этого Payload отправляет дефолтное англоязычное письмо со ссылкой на
 * `{serverURL}/admin/reset/{token}` — то есть в админку, а не на страницу
 * `/reset-password`, которая есть у нас во фронтенде.
 */
function buildResetPasswordEmail(args: ForgotPasswordArgs | undefined) {
  const token = args?.token

  if (!token) {
    // Отправить письмо с нерабочей ссылкой хуже, чем упасть: студент
    // потратит попытку и не поймёт, почему восстановление не работает.
    throw new Error('Cannot build reset-password email: Payload did not provide a token')
  }

  return resetPasswordEmail(args?.user?.firstName ?? '', token)
}

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    tokenExpiration: 60 * 60 * 24 * 7, // 7 дней
    forgotPassword: {
      // `expiration` здесь намеренно не задан: значение из конфига коллекции
      // имеет приоритет над поштучным и перекрыло бы 7-дневный срок
      // токена в письме-приглашении (см. sendInviteEmail).
      // Токены восстановления живут стандартный час.
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
    afterChange: [sendInviteEmail],
  },
  access: {
    create: isAdmin,
    read: isAuthenticated,
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      // Студент может редактировать только свой профиль
      return { id: { equals: user.id } }
    },
    delete: isAdmin,
    admin: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
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
        update: ({ req: { user } }) => Boolean(user?.role === 'admin'),
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
      admin: {
        position: 'sidebar',
      },
    },
  ],
}

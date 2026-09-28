import type { CollectionConfig, Where } from 'payload'

import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { isAdmin } from '@/payload/access/isAdmin'
import { assignOwner } from '@/payload/hooks/assignOwner'
import { notifyCommentThread, restrictCommentThread } from '@/payload/hooks/commentThread'

export const Comments: CollectionConfig = {
  slug: 'comments',
  admin: {
    defaultColumns: ['user', 'lesson', 'content', 'createdAt'],
    group: 'Коммуникация',
  },
  access: {
    create: isAuthenticated,
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      // Студент видит свою ветку: свои вопросы и ответы ментора на них.
      // Писать в чужую ветку запрещает restrictCommentThread.
      const own: Where[] = [{ user: { equals: user.id } }, { 'parentComment.user': { equals: user.id } }]
      return { or: own }
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      // Автор может редактировать свой комментарий
      return { user: { equals: user.id } }
    },
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [restrictCommentThread],
    beforeChange: [assignOwner],
    afterChange: [notifyCommentThread],
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      label: 'Автор',
    },
    {
      name: 'lesson',
      type: 'relationship',
      relationTo: 'lessons',
      required: true,
      label: 'Урок',
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
      label: 'Комментарий',
      maxLength: 2000,
    },
    {
      name: 'parentComment',
      type: 'relationship',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      relationTo: 'comments' as any,
      label: 'Ответ на комментарий',
      admin: {
        description: 'Оставьте пустым для корневого комментария',
      },
    },
    {
      name: 'isResolved',
      type: 'checkbox',
      defaultValue: false,
      label: 'Решён (для Q&A)',
      admin: {
        position: 'sidebar',
      },
    },
  ],
}

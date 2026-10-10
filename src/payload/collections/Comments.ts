import type { CollectionConfig } from 'payload'

import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { isAdmin } from '@/payload/access/isAdmin'
import { assignOwner } from '@/payload/hooks/assignOwner'
import { notifyCommentThread, restrictCommentThread } from '@/payload/hooks/commentThread'
import { guardLearningLessonWrite } from '@/payload/hooks/learningLessonWrite'
import { learningStateRead } from '@/payload/access/learningStateRead'
import { guardCommentMutation, removeOwnedComment } from '@/payload/hooks/commentMutation'
import { captureRawCollectionPatch } from '@/payload/hooks/rawCollectionPatch'

export const Comments: CollectionConfig = {
  slug: 'comments',
  endpoints: [{ path: '/:id/remove', method: 'delete', handler: removeOwnedComment }],
  admin: {
    defaultColumns: ['user', 'lesson', 'content', 'createdAt'],
    group: 'Коммуникация',
  },
  access: {
    create: isAuthenticated,
    read: learningStateRead({ comments: true }),
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      // Автор может редактировать свой комментарий
      return { user: { equals: user.id } }
    },
    delete: isAdmin,
  },
  hooks: {
    beforeOperation: [captureRawCollectionPatch],
    beforeValidate: [guardCommentMutation, restrictCommentThread],
    beforeChange: [assignOwner, guardLearningLessonWrite],
    afterChange: [notifyCommentThread],
  },
  fields: [
    {
      name: 'deletedAt',
      type: 'date',
      label: 'Удалён автором',
      access: { create: () => false, update: () => false },
      admin: { readOnly: true },
    },
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
      access: {
        create: async ({ req }) => (await isAdmin({ req })) === true,
        update: async ({ req }) => (await isAdmin({ req })) === true,
      },
      admin: {
        position: 'sidebar',
      },
    },
  ],
}

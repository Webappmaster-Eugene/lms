import type { CollectionConfig, FieldAccess } from 'payload'

import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'
import { isAdmin } from '@/payload/access/isAdmin'
import { queueNotificationPush } from '@/server/notification-service'
import { notificationLinkIsVisible } from '@/server/notification-visibility'
import { safeNotificationLink } from '@/lib/notification-policy'

const editNotification: FieldAccess = async ({ req }) => (await isAdmin({ req })) === true
const adminEdit = { create: editNotification, update: editNotification }

export const Notifications: CollectionConfig = {
  slug: 'notifications',
  admin: {
    defaultColumns: ['user', 'title', 'isRead', 'createdAt'],
    group: 'Коммуникация',
  },
  access: {
    create: isAdmin,
    read: isAdminOrSelf,
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [({ data }) => {
      if (typeof data.link === 'string' && data.link.length <= 500) data.link = safeNotificationLink(data.link, true)
      return data
    }],
    afterChange: [queueNotificationPush],
    afterRead: [async ({ doc, req }) => {
      if (req.user && !(await notificationLinkIsVisible(req.payload, req.user.id, doc.link, req))) return { ...doc, title: 'Учебное уведомление', message: 'Доступ к этому материалу изменился. Обратитесь к преподавателю.', link: null }
      return doc
    }],
    beforeDelete: [async ({ id, req }) => { await req.payload.delete({ collection: 'notification-deliveries', where: { notification: { equals: id } }, req, overrideAccess: true }) }],
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      label: 'Пользователь',
      access: adminEdit,
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Заголовок',
      maxLength: 200,
      access: adminEdit,
    },
    {
      name: 'message',
      type: 'textarea',
      required: true,
      label: 'Текст',
      maxLength: 3000,
      access: adminEdit,
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      label: 'Тип',
      defaultValue: 'info',
      access: adminEdit,
      options: [
        { label: 'Информация', value: 'info' },
        { label: 'Достижение', value: 'achievement' },
        { label: 'Курс завершён', value: 'course_completed' },
        { label: 'Роадмап завершён', value: 'roadmap_completed' },
        { label: 'Комментарий', value: 'comment' },
        { label: 'Задача тренажёра', value: 'trainer_task' },
        { label: 'Обращение в поддержку', value: 'support_message' },
        { label: 'Напоминание об обучении', value: 'learning_reminder' },
      ],
    },
    {
      name: 'link',
      type: 'text',
      label: 'Ссылка (куда вести при клике)',
      maxLength: 500,
      access: adminEdit,
    },
    {
      name: 'isRead',
      type: 'checkbox',
      defaultValue: false,
      label: 'Прочитано',
    },
  ],
}

import { ValidationError, type CollectionBeforeValidateHook, type CollectionConfig } from 'payload'

import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'
import { assignOwner } from '@/payload/hooks/assignOwner'
import { guardLearningLessonWrite } from '@/payload/hooks/learningLessonWrite'
import { learningStateRead } from '@/payload/access/learningStateRead'

/** Закладка ведёт ровно на одно: урок или задачу тренажёра. */
const oneTarget: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const merged = { ...originalDoc, ...data }
  const targets = [merged.lesson, merged.task].filter((v) => v !== null && v !== undefined && v !== '')
  if (targets.length !== 1) {
    throw new ValidationError({
      collection: 'bookmarks',
      errors: [{ path: 'lesson', message: 'Закладка должна вести либо на урок, либо на задачу тренажёра' }],
    })
  }
  return data
}

/** «Сохранённое»: уроки и задачи, к которым ученик хочет вернуться. */
export const Bookmarks: CollectionConfig = {
  slug: 'bookmarks',
  admin: {
    defaultColumns: ['user', 'lesson', 'task', 'createdAt'],
    group: 'Прогресс',
  },
  access: {
    create: isAuthenticated,
    read: learningStateRead({ allowTask: true }),
    update: isAdminOrSelf,
    delete: isAdminOrSelf,
  },
  hooks: {
    beforeValidate: [oneTarget],
    beforeChange: [assignOwner, guardLearningLessonWrite],
  },
  // Повторное «сохранить» не плодит дубли. NULL в Postgres уникальности не мешает,
  // поэтому закладки на урок и на задачу живут в одной таблице.
  indexes: [
    { fields: ['user', 'lesson'], unique: true },
    { fields: ['user', 'task'], unique: true },
  ],
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      label: 'Пользователь',
    },
    {
      name: 'lesson',
      type: 'relationship',
      relationTo: 'lessons',
      label: 'Урок',
    },
    {
      name: 'task',
      type: 'relationship',
      relationTo: 'trainer-tasks',
      label: 'Задача тренажёра',
    },
  ],
}

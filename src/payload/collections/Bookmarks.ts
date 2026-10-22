import { ValidationError, type CollectionBeforeValidateHook, type CollectionConfig } from 'payload'

import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'
import { assignOwner } from '@/payload/hooks/assignOwner'
import { guardLearningLessonWrite } from '@/payload/hooks/learningLessonWrite'
import { guardTrainerTaskBookmark } from '@/payload/hooks/trainerTaskBookmark'
import { guardGuideBookmark } from '@/payload/hooks/guideBookmark'
import { learningStateRead } from '@/payload/access/learningStateRead'

/** Закладка ведёт ровно на одно: урок, задачу тренажёра или гайд. */
const oneTarget: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const merged = { ...originalDoc, ...data }
  const targets = [merged.lesson, merged.task, merged.guide].filter((v) => v !== null && v !== undefined && v !== '')
  if (targets.length !== 1) {
    throw new ValidationError({
      collection: 'bookmarks',
      errors: [{ path: 'lesson', message: 'Закладка должна вести на что-то одно: урок, задачу тренажёра или гайд' }],
    })
  }
  return data
}

/** «Сохранённое»: уроки, задачи и гайды, к которым ученик хочет вернуться. */
export const Bookmarks: CollectionConfig = {
  slug: 'bookmarks',
  admin: {
    defaultColumns: ['user', 'lesson', 'task', 'guide', 'createdAt'],
    group: 'Прогресс',
  },
  access: {
    create: isAuthenticated,
    read: learningStateRead({ allowTask: true, allowGuide: true }),
    update: isAdminOrSelf,
    delete: isAdminOrSelf,
  },
  hooks: {
    beforeValidate: [oneTarget],
    beforeChange: [assignOwner, guardLearningLessonWrite, guardTrainerTaskBookmark, guardGuideBookmark],
  },
  // Повторное «сохранить» не плодит дубли. NULL в Postgres уникальности не мешает,
  // поэтому закладки на урок, задачу и гайд живут в одной таблице.
  indexes: [
    { fields: ['user', 'lesson'], unique: true },
    { fields: ['user', 'task'], unique: true },
    { fields: ['user', 'guide'], unique: true },
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
    {
      name: 'guide',
      type: 'relationship',
      relationTo: 'guides',
      label: 'Гайд',
    },
  ],
}

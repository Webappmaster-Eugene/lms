import type { CollectionConfig } from 'payload'

import { GUIDE_CATEGORIES } from '@/lib/guides'
import { isAdmin } from '@/payload/access/isAdmin'
import { cleanupGuideRelations } from '@/payload/hooks/cleanupOwnedRelations'
import { generateSlug } from '@/payload/hooks/generateSlug'
import { applyGuideFile, computeGuideMeta } from '@/payload/hooks/guideFrontmatter'
import { cleanupLearningTargetGrants } from '@/payload/hooks/learningAccessCleanup'
import { announceGuide } from '@/server/guide-announcements'
import { guideReadAccess } from '@/server/guide-access'

/**
 * Самостоятельные инструкции вне программы курсов, баллов не дают. Доступ к обучению их
 * не открывает: ученик видит гайд только по отдельному назначению или режиму «все гайды».
 * Текст — Markdown. Каждое сохранение пишет версию: перезалитый файл можно откатить.
 */
export const Guides: CollectionConfig = {
  slug: 'guides',
  labels: {
    singular: 'Гайд',
    plural: 'Гайды',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'isPublished', 'reviewBy', 'order'],
    group: 'Контент',
    preview: (doc) => (typeof doc?.slug === 'string' && doc.slug ? `/guides/${encodeURIComponent(doc.slug)}` : null),
    components: {
      beforeList: ['/components/guides/GuideReviewNotice#GuideReviewNotice'],
    },
  },
  // Без drafts: версия — снимок после сохранения, а опубликованность по-прежнему решает isPublished.
  versions: { maxPerDoc: 50 },
  access: {
    create: isAdmin,
    read: guideReadAccess,
    // Версии хранят и черновые, и закрытые гайды: читать их может только администратор.
    readVersions: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    // Файл раскладывается по полям раньше, чем slug генерируется из названия.
    beforeValidate: [applyGuideFile, generateSlug],
    beforeChange: [computeGuideMeta],
    afterChange: [announceGuide],
    beforeDelete: [cleanupLearningTargetGrants('guides'), cleanupGuideRelations],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Название',
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      required: true,
      label: 'Slug',
      admin: {
        position: 'sidebar',
        description: 'Генерируется автоматически из названия',
      },
    },
    {
      name: 'summary',
      type: 'textarea',
      required: true,
      maxLength: 300,
      label: 'Кратко',
      admin: {
        description: 'Одна-две фразы о том, чему научит гайд. Видны в списке гайдов и в описании страницы',
      },
    },
    {
      name: 'markdownFile',
      type: 'ui',
      admin: {
        components: { Field: '/components/guides/GuideMarkdownUpload#GuideMarkdownUpload' },
      },
    },
    {
      name: 'markdown',
      type: 'textarea',
      label: 'Текст гайда',
      // Обязательность проверяет validate: required у textarea пропускает строку из пробелов.
      validate: (value: string | null | undefined) => (value?.trim() ? true : 'Добавьте текст гайда'),
      admin: {
        components: { Field: '/components/guides/GuideMarkdownEditor#GuideMarkdownEditor' },
      },
    },
    {
      name: 'category',
      type: 'select',
      label: 'Категория',
      options: GUIDE_CATEGORIES.map((category) => ({ ...category })),
      admin: {
        position: 'sidebar',
        description: 'По ней ученик фильтрует список гайдов',
      },
    },
    {
      name: 'reviewedAt',
      type: 'date',
      label: 'Данные проверены',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMMM yyyy' },
        description: 'Когда цифры и ссылки в гайде сверены с источниками. Видно ученику',
      },
    },
    {
      name: 'reviewBy',
      type: 'date',
      label: 'Пересмотреть до',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMMM yyyy' },
        description: 'Пустое — через 3 месяца после проверки. Просроченные гайды видны над списком',
      },
    },
    {
      name: 'stats',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '/components/guides/GuideStats#GuideStats' },
      },
    },
    {
      name: 'readingMinutes',
      type: 'number',
      label: 'Минут чтения',
      admin: { position: 'sidebar', readOnly: true, description: 'Считается из текста при сохранении' },
    },
    {
      name: 'announcedAt',
      type: 'date',
      label: 'Впервые опубликован',
      // Ставит сервер при первой публикации: от него отсчитывается «Новое» и рассылаются уведомления.
      access: { create: () => false, update: () => false },
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      label: 'Порядок',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'isPublished',
      type: 'checkbox',
      defaultValue: false,
      label: 'Опубликован',
      admin: {
        position: 'sidebar',
      },
    },
  ],
}

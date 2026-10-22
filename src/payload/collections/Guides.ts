import type { CollectionConfig } from 'payload'

import { lexicalPlainText } from '@/lib/lexical-text'
import { isAdmin } from '@/payload/access/isAdmin'
import { cleanupGuideRelations } from '@/payload/hooks/cleanupOwnedRelations'
import { generateSlug } from '@/payload/hooks/generateSlug'
import { applyGuideFile } from '@/payload/hooks/guideFrontmatter'
import { cleanupLearningTargetGrants } from '@/payload/hooks/learningAccessCleanup'
import { guideReadAccess } from '@/server/guide-access'

/**
 * Самостоятельные инструкции вне программы курсов, баллов не дают. Доступ к обучению их
 * не открывает: ученик видит гайд только по отдельному назначению или режиму «все гайды».
 * Текст — Markdown; Lexical-поле `content` осталось у гайдов, созданных до него.
 */
export const Guides: CollectionConfig = {
  slug: 'guides',
  labels: {
    singular: 'Гайд',
    plural: 'Гайды',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'order', 'isPublished', 'updatedAt'],
    group: 'Контент',
  },
  access: {
    create: isAdmin,
    read: guideReadAccess,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    // Файл раскладывается по полям раньше, чем slug генерируется из названия.
    beforeValidate: [applyGuideFile, generateSlug],
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
      label: 'Текст гайда (Markdown)',
      validate: (value: string | null | undefined, { data }: { data: unknown }) => {
        if (value?.trim()) return true
        const legacy = (data as { content?: unknown } | null)?.content
        return lexicalPlainText(legacy).trim() ? true : 'Добавьте текст гайда в Markdown'
      },
      admin: {
        rows: 30,
        description: 'Разделы — заголовки «## …», из них строится оглавление. Таблицы, код и цитаты — обычный Markdown',
      },
    },
    {
      name: 'content',
      type: 'richText',
      label: 'Текст гайда (старый формат)',
      admin: {
        condition: (data) => !(typeof data?.markdown === 'string' && data.markdown.trim()) && Boolean(data?.content),
        description: 'Используется, пока поле Markdown пустое. Загрузите .md, чтобы перевести гайд в Markdown',
      },
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

import type { CollectionBeforeValidateHook } from 'payload'

import { hasFrontmatter, parseGuideFile } from '@/lib/guide-file'

/**
 * Гайд можно прислать файлом целиком (REST, `pnpm guide:publish`): шапка `---` раскладывается
 * по полям, первая строка `# …` у нового гайда без названия становится названием.
 * Файл — источник истины, поэтому значения шапки заменяют текущие.
 */
export const applyGuideFile: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  if (!data || typeof data.markdown !== 'string') return data
  const untitled = !data.title && !originalDoc?.title
  if (!hasFrontmatter(data.markdown) && !untitled) return data
  const { fields, markdown } = parseGuideFile(data.markdown)
  return {
    ...data,
    markdown,
    ...(fields.title !== undefined && { title: fields.title }),
    ...(fields.summary !== undefined && { summary: fields.summary }),
    // generateSlug пересоздаёт slug при PATCH названия без slug — адрес гайда менять файлом нельзя.
    ...(fields.slug !== undefined ? { slug: fields.slug } : !data.slug && originalDoc?.slug ? { slug: originalDoc.slug } : {}),
    ...(fields.order !== undefined && { order: fields.order }),
    ...(fields.published !== undefined && { isPublished: fields.published }),
  }
}

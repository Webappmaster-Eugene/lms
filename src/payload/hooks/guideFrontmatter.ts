import { ValidationError, type CollectionBeforeChangeHook, type CollectionBeforeValidateHook } from 'payload'

import { hasFrontmatter, parseGuideFile } from '@/lib/guide-file'
import { defaultGuideReviewBy, guideReadingMinutes } from '@/lib/guides'

/**
 * Гайд можно прислать файлом целиком (REST, `pnpm guide:publish`): шапка `---` раскладывается
 * по полям, первая строка `# …` у нового гайда без названия становится названием.
 * Файл — источник истины, поэтому значения шапки заменяют текущие.
 */
export const applyGuideFile: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  if (!data || typeof data.markdown !== 'string') return data
  const untitled = !data.title && !originalDoc?.title
  if (!hasFrontmatter(data.markdown) && !untitled) return data
  const { fields, markdown, problems } = parseGuideFile(data.markdown)
  if (problems.length) {
    throw new ValidationError({ collection: 'guides', errors: problems.map((message) => ({ path: 'markdown', message: `Шапка файла: ${message}` })) })
  }
  return {
    ...data,
    markdown,
    ...(fields.title !== undefined && { title: fields.title }),
    ...(fields.summary !== undefined && { summary: fields.summary }),
    // generateSlug пересоздаёт slug при PATCH названия без slug — адрес гайда менять файлом нельзя.
    ...(fields.slug !== undefined ? { slug: fields.slug } : !data.slug && originalDoc?.slug ? { slug: originalDoc.slug } : {}),
    ...(fields.order !== undefined && { order: fields.order }),
    ...(fields.published !== undefined && { isPublished: fields.published }),
    ...(fields.category !== undefined && { category: fields.category }),
    ...(fields.reviewedAt !== undefined && { reviewedAt: fields.reviewedAt }),
    // Новая дата проверки без своего срока сбрасывает старый срок: он относился к прошлой проверке.
    ...(fields.reviewBy !== undefined ? { reviewBy: fields.reviewBy } : fields.reviewedAt !== undefined ? { reviewBy: null } : {}),
  }
}

/**
 * Служебные поля гайда считает сервер: время чтения — для списка без загрузки текстов,
 * срок пересмотра — от даты проверки, момент первой публикации — для «Новое» и уведомлений.
 */
export const computeGuideMeta: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const merged = { ...originalDoc, ...data }
  const next = { ...data }
  if (typeof data.markdown === 'string' || !originalDoc) next.readingMinutes = guideReadingMinutes(merged.markdown)
  if (merged.reviewedAt && !merged.reviewBy) next.reviewBy = defaultGuideReviewBy(merged.reviewedAt)
  // Дата первой публикации не меняется: восстановление старой версии через Local API иначе обнулило бы её и разослало гайд заново.
  if (originalDoc?.announcedAt) next.announcedAt = originalDoc.announcedAt
  else if (merged.isPublished && !merged.announcedAt) next.announcedAt = new Date().toISOString()
  return next
}

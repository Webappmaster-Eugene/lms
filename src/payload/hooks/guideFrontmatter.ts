import { ValidationError, type CollectionBeforeChangeHook, type CollectionBeforeValidateHook } from 'payload'

import { hasFrontmatter, parseGuideFile } from '@/lib/guide-file'
import { defaultGuideReviewBy, guideReadingMinutes } from '@/lib/guides'
import { collectAllPages } from '@/lib/paginate'

/**
 * Гайд можно прислать файлом целиком (REST, `pnpm guide:publish`): шапка `---` раскладывается
 * по полям, первая строка `# …` у нового гайда без названия становится названием.
 * Файл — источник истины, поэтому значения шапки заменяют текущие.
 */
export const applyGuideFile: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  if (!data || typeof data.markdown !== 'string') return data
  const untitled = !data.title && !originalDoc?.title
  if (!hasFrontmatter(data.markdown) && !untitled) return data
  const { fields, markdown, problems } = parseGuideFile(data.markdown)

  // Категорию из шапки (название или slug) сопоставляем со справочником: id знает только база.
  let categoryId: number | undefined
  if (fields.category !== undefined) {
    const text = fields.category.trim().toLowerCase()
    const all = await collectAllPages(
      ({ page, limit }) => req.payload.find({ collection: 'guide-categories', depth: 0, overrideAccess: true, req, page, limit }),
      { label: 'категории гайдов' },
    )
    const match = all.find((item) => item.slug.toLowerCase() === text || (item.title ?? '').trim().toLowerCase() === text)
    if (match) categoryId = match.id
    else problems.push(`category: «${fields.category.trim()}» - такой категории нет, есть ${all.map((item) => item.slug).join(', ') || '- сначала создайте категорию'}`)
  }

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
    ...(fields.public !== undefined && { isPublic: fields.public }),
    ...(categoryId !== undefined && { category: categoryId }),
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

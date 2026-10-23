import type { CollectionBeforeValidateHook } from 'payload'

import { slugify } from '@/lib/slug'

/**
 * Генерирует slug из title, если slug не указан вручную.
 * Поле в CMS подставляет его вживую, этот хук — страховка для REST и команды публикации.
 */
export const generateSlug: CollectionBeforeValidateHook = ({ data }) => {
  if (!data) return data
  if (data.title && !data.slug) data.slug = slugify(data.title)
  return data
}

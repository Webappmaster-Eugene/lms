import type { CollectionBeforeValidateHook } from 'payload'

/**
 * Генерирует slug из title, если slug не указан вручную.
 * Транслитерация кириллицы + kebab-case.
 */
export const generateSlug: CollectionBeforeValidateHook = ({ data, operation }) => {
  if (!data) return data

  if (operation === 'create' || (operation === 'update' && data.title && !data.slug)) {
    if (data.title && !data.slug) {
      data.slug = slugify(data.title)
    }
  }

  return data
}

const CYRILLIC_MAP: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map((char) => CYRILLIC_MAP[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

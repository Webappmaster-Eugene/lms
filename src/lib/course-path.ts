import type { Where } from 'payload'

/** Буткемп живёт в своём разделе: ссылка через «Курсы» вела бы туда редиректом. */
export function coursePath(course: { slug: string; isBootcamp?: boolean | null }): string {
  return `${course.isBootcamp ? '/bootcamp' : '/courses'}/${course.slug}`
}

/** Курсы без буткемпов. `exists: false` — строка без значения не должна пропасть из каталога. */
export const notBootcamp: Where = { or: [{ isBootcamp: { equals: false } }, { isBootcamp: { exists: false } }] }

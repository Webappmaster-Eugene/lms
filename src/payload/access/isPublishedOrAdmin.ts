import type { Access } from 'payload'

/**
 * Учебный контент: админ видит всё, студент - только опубликованное.
 * Страницы берут данные Local API с overrideAccess, поэтому правило действует на REST:
 * без него черновики курсов, уроков и задач читались по id до публикации.
 */
export const isPublishedOrAdmin: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.role === 'admin') return true
  return { isPublished: { equals: true } }
}

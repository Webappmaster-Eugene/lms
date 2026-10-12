import { APIError, type CollectionBeforeOperationHook, type CollectionConfig, type Field, type SanitizedConfig } from 'payload'

const OWN_CONTENT = /^content(?:\.|$)/
const MAX_DEPTH = 20
const relatedContentPatterns = new WeakMap<SanitizedConfig, RegExp>()

/**
 * Через связь условие доходит до урока из заметок, комментариев, прогресса и закладок.
 * Имена связей берутся из конфигурации: новая связь с уроком под другим именем не должна
 * молча обойти защиту. `.value` — запись пути для связи с несколькими коллекциями.
 */
function relatedContent(config: SanitizedConfig): RegExp {
  const known = relatedContentPatterns.get(config)
  if (known) return known
  const names = new Set<string>()
  const walk = (fields: Field[]) => {
    for (const field of fields) {
      if (field.type === 'relationship' || field.type === 'upload') {
        if ([field.relationTo].flat().includes('lessons')) names.add(field.name)
      } else if (field.type === 'join') {
        if ([field.collection].flat().includes('lessons')) names.add(field.name)
      }
      if ('fields' in field) walk(field.fields)
      if (field.type === 'blocks') for (const block of field.blocks) walk(block.fields)
      if (field.type === 'tabs') for (const tab of field.tabs) walk(tab.fields)
    }
  }
  for (const entry of [...config.collections, ...config.globals]) walk(entry.fields)
  const links = [...names].map((name) => name.replace(/[^\w-]/g, '\\$&')).join('|')
  const pattern = new RegExp(`(?:^|\\.)(?:${links})(?:\\.value)?\\.content(?:\\.|$)`)
  relatedContentPatterns.set(config, pattern)
  return pattern
}

/** Пути полей из условия: `and`/`or` раскрываются, вложенная запись `a[b]` приводится к `a.b`. */
function conditionPaths(where: unknown, prefix = '', paths: string[] = [], depth = 0): string[] {
  if (!where || typeof where !== 'object' || depth > MAX_DEPTH) return paths
  if (Array.isArray(where)) {
    for (const entry of where) conditionPaths(entry, prefix, paths, depth + 1)
    return paths
  }
  for (const [key, value] of Object.entries(where)) {
    if (['and', 'or'].includes(key.toLowerCase())) {
      conditionPaths(value, prefix, paths, depth + 1)
      continue
    }
    const path = prefix ? `${prefix}.${key}` : key
    paths.push(path)
    conditionPaths(value, path, paths, depth + 1)
  }
  return paths
}

function sortPaths(sort: unknown): string[] {
  const entries = Array.isArray(sort) ? sort : typeof sort === 'string' ? sort.split(',') : []
  return entries.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim().replace(/^-/, ''))
}

/**
 * Ссылки на файлы урока скрываются от ученика при чтении, но фильтр и сортировка работают
 * по сохранённым значениям. По ответу «нашлось / не нашлось» ссылку можно подобрать
 * посимвольно, поэтому запросы по содержимому урока оставлены администратору и серверу.
 */
export const denyLessonSourceQueries: CollectionBeforeOperationHook = ({ args, collection, overrideAccess, req }) => {
  if (overrideAccess || req.user?.role === 'admin' || !args || typeof args !== 'object') return
  const query = args as { where?: unknown; sort?: unknown; field?: unknown; joins?: unknown }
  const paths = [...conditionPaths(query.where), ...sortPaths(query.sort), ...(typeof query.field === 'string' ? [query.field] : [])]
  // У обратной связи свои условие и сортировка — они применяются к связанным документам.
  if (query.joins && typeof query.joins === 'object') {
    for (const [name, join] of Object.entries(query.joins)) {
      if (!join || typeof join !== 'object') continue
      const nested = join as { where?: unknown; sort?: unknown }
      paths.push(...conditionPaths(nested.where, name), ...sortPaths(nested.sort).map((path) => `${name}.${path}`))
    }
  }
  const related = relatedContent(req.payload.config)
  // Payload принимает путь и с двойным подчёркиванием вместо точки: `content__videoUrl`.
  const exposesSource = paths.map((path) => path.replace(/__/g, '.')).some((path) => related.test(path) || (collection.slug === 'lessons' && OWN_CONTENT.test(path)))
  if (exposesSource) throw new APIError('Фильтр и сортировка по содержимому урока недоступны', 403, undefined, true)
}

/** Условие доходит до урока через связь из любой коллекции, поэтому защита стоит на всех. */
export function withLessonSourceGuard(collection: CollectionConfig): CollectionConfig {
  return {
    ...collection,
    hooks: { ...collection.hooks, beforeOperation: [denyLessonSourceQueries, ...(collection.hooks?.beforeOperation ?? [])] },
  }
}

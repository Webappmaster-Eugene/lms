import { describe, expect, it, vi } from 'vitest'

vi.mock('@/server/content-cache', () => ({ cachedContent: vi.fn(), contentCacheKey: vi.fn() }))
const { validCatalog } = await import('@/server/learning-catalog')

const catalog = (course: Record<string, unknown>) => ({
  courses: [{ id: 1, roadmap: 1, roadmapNode: null, isPublished: true, ...course }],
  sections: [], roadmaps: [{ id: 1, isPublished: true }], nodes: [], invalidLessonIds: [],
})

/**
 * Кеш каталога в Redis общий для старого и нового контейнера во время выката.
 * Запись прежнего кода без assignedOnly открыла бы закрытый курс всем — её надо
 * отвергнуть и пересобрать каталог из базы.
 */
describe('кеш метаданных каталога', () => {
  it('принимает запись с явным флажком «только по назначению»', () => {
    expect(validCatalog(catalog({ assignedOnly: true }))).toBe(true)
    expect(validCatalog(catalog({ assignedOnly: false }))).toBe(true)
  })

  it('отвергает запись прежнего формата и пустой флажок', () => {
    expect(validCatalog(catalog({}))).toBe(false)
    expect(validCatalog(catalog({ assignedOnly: null }))).toBe(false)
    expect(validCatalog(catalog({ assignedOnly: 'true' }))).toBe(false)
  })
})

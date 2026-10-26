import { describe, expect, it } from 'vitest'

import { coursePath, notBootcamp } from '@/lib/course-path'
import { PLATFORM_SECTIONS, visibleSections } from '@/lib/platform-sections'

describe('буткемп отдельно от курсов', () => {
  it('ссылка на буткемп ведёт в его раздел, на курс — в каталог', () => {
    expect(coursePath({ slug: 'nodejs-bootcamp-manuals', isBootcamp: true })).toBe('/bootcamp/nodejs-bootcamp-manuals')
    expect(coursePath({ slug: 'react', isBootcamp: false })).toBe('/courses/react')
    expect(coursePath({ slug: 'react', isBootcamp: null })).toBe('/courses/react')
    expect(coursePath({ slug: 'react' })).toBe('/courses/react')
  })

  it('фильтр каталога не теряет курс без значения флага', () => {
    expect(notBootcamp).toEqual({ or: [{ isBootcamp: { equals: false } }, { isBootcamp: { exists: false } }] })
  })

  it('раздел «Буткемп» виден только с доступом, остальные разделы не задевает', () => {
    const all = { trainerEnabled: true, guidesEnabled: true, bootcampEnabled: true }
    expect(visibleSections(PLATFORM_SECTIONS, all)).toHaveLength(PLATFORM_SECTIONS.length)
    const without = visibleSections(PLATFORM_SECTIONS, { ...all, bootcampEnabled: false }).map(({ href }) => href)
    expect(without).not.toContain('/bootcamp')
    expect(without).toHaveLength(PLATFORM_SECTIONS.length - 1)
  })
})

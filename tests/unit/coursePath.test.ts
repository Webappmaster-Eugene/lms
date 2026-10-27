import { describe, expect, it } from 'vitest'

import { coursePath, notBootcamp } from '@/lib/course-path'
import { PLATFORM_SECTIONS, withSectionAccess } from '@/lib/platform-sections'

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

  it('раздел без доступа не пропадает, а помечается закрытым; остальные разделы не задевает', () => {
    const all = { trainerEnabled: true, guidesEnabled: true, bootcampEnabled: true }
    expect(withSectionAccess(PLATFORM_SECTIONS, all).filter(({ locked }) => locked)).toEqual([])
    const without = withSectionAccess(PLATFORM_SECTIONS, { trainerEnabled: false, guidesEnabled: false, bootcampEnabled: false })
    expect(without.map(({ href }) => href)).toEqual(PLATFORM_SECTIONS.map(({ href }) => href))
    expect(without.filter(({ locked }) => locked).map(({ href }) => href)).toEqual(['/bootcamp', '/trainer', '/guides'])
  })
})

import { describe, expect, it } from 'vitest'

import { BOOTCAMP_LOCKED_PATH } from '@/lib/course-path'
import { buildNodeExtras } from '@/lib/roadmap-node-extras'

/**
 * Состав темы для страницы карты. Закрытый материал остаётся в теме с замком, но адрес закрытого
 * буткемпа в клиент не уходит: ссылка ведёт на общий экран «нет доступа».
 */
const guides = [{ id: 1, title: 'LinkedIn', slug: 'linkedin' }, { id: 2, title: 'Резюме', slug: 'resume' }]
const bootcamps = [{ id: 9, title: 'Буткемп Node.js', slug: 'nodejs-bootcamp' }, { id: 8, title: 'Буткемп Go', slug: 'go-bootcamp' }]
const build = (nodes: Parameters<typeof buildNodeExtras>[0]['nodes'], options: Partial<Parameters<typeof buildNodeExtras>[0]> = {}) => buildNodeExtras({
  nodes, guides, bootcamps, canAccessGuide: (id) => id === 1, canBrowseBootcamp: (id) => id === 8, readGuideIds: new Set([1, 2]), ...options,
})

describe('гайды и буткемпы темы', () => {
  it('сначала буткемпы, потом гайды, внутри — в порядке администратора', () => {
    const extras = build([{ id: 100, guides: [2, 1], bootcamps: [9, 8] }]).get(100) ?? []
    expect(extras.map((extra) => extra.key)).toEqual(['bootcamp-9', 'bootcamp-8', 'guide-2', 'guide-1'])
  })

  it('закрытый буткемп ведёт на экран без адреса, открытый — в свой раздел', () => {
    const extras = build([{ id: 100, bootcamps: [9, 8] }]).get(100) ?? []
    expect(extras[0]).toEqual({ key: 'bootcamp-9', kind: 'bootcamp', title: 'Буткемп Node.js', href: BOOTCAMP_LOCKED_PATH, accessAllowed: false, read: false })
    expect(JSON.stringify(extras[0])).not.toContain('nodejs-bootcamp')
    expect(extras[1]).toMatchObject({ href: '/bootcamp/go-bootcamp', accessAllowed: true })
  })

  it('гайд всегда ведёт на свою страницу; «Прочитан» — только у открытого', () => {
    const extras = build([{ id: 100, guides: [1, 2] }]).get(100) ?? []
    expect(extras).toEqual([
      { key: 'guide-1', kind: 'guide', title: 'LinkedIn', href: '/guides/linkedin', accessAllowed: true, read: true },
      { key: 'guide-2', kind: 'guide', title: 'Резюме', href: '/guides/resume', accessAllowed: false, read: false },
    ])
  })

  it('неопубликованные, удалённые и повторённые id отбрасываются, пустая тема в карту не попадает', () => {
    const result = build([{ id: 100, guides: [1, 404, 1], bootcamps: [77, 9, 9] }, { id: 101, guides: [404] }, { id: 102, guides: null, bootcamps: null }])
    expect(result.get(100)?.map((extra) => extra.key)).toEqual(['bootcamp-9', 'guide-1'])
    expect(result.has(101)).toBe(false)
    expect(result.has(102)).toBe(false)
  })
})

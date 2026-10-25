import { describe, expect, it } from 'vitest'

import { buildGuideAccess, type GuideAccessUser } from '@/lib/guide-access'
import type { LearningGrant } from '@/lib/learning-access'

const NOW = Date.parse('2026-10-22T12:00:00Z')
const guides = [{ id: 1, isPublished: true }, { id: 2, isPublished: true }, { id: 3, isPublished: false }]
const student = (overrides: Partial<GuideAccessUser> = {}): GuideAccessUser => ({ id: 10, role: 'student', isActive: true, ...overrides })
const grant = (id: number, effect: 'allow' | 'deny' = 'allow', extra: Partial<LearningGrant> = {}): LearningGrant => ({ target: { relationTo: 'guides', value: id }, effect, ...extra })

describe('доступ к гайдам', () => {
  it('публичный опубликованный гайд открыт всем, включая гостя и ученика с запретом', () => {
    const publicGuides = [...guides, { id: 4, isPublished: true, isPublic: true }, { id: 5, isPublished: false, isPublic: true }]
    for (const user of [null, student(), student({ isActive: false })]) {
      const access = buildGuideAccess(user, [grant(4, 'deny')], publicGuides, NOW)
      expect(access.accessibleGuideIds).toEqual([4])
      expect(access.canAccessGuide(5)).toBe(false)
      expect(access.canAccessGuide(1)).toBe(false)
    }
  })
  it('по умолчанию ученику не открыт ни один гайд', () => {
    const access = buildGuideAccess(student(), [], guides, NOW)
    expect(access.mode).toBe('assigned')
    expect(access.hasAccess).toBe(false)
    expect(access.accessibleGuideIds).toEqual([])
    expect(access.guideWhere).toEqual({ and: [{ isPublished: { equals: true } }, { id: { in: [-1] } }] })
  })

  it('назначение открывает только свой гайд; черновик не открывает даже назначение', () => {
    const access = buildGuideAccess(student(), [grant(2), grant(3)], guides, NOW)
    expect(access.accessibleGuideIds).toEqual([2])
    expect(access.canAccessGuide(1)).toBe(false)
    expect(access.canAccessGuide(3)).toBe(false)
  })

  it('режим «все» открывает опубликованные гайды, запрет закрывает отдельный', () => {
    const access = buildGuideAccess(student({ guidesAccessMode: 'all' }), [grant(1, 'deny')], guides, NOW)
    expect(access.accessibleGuideIds).toEqual([2])
  })

  it('запрет сильнее разрешения на тот же гайд', () => {
    expect(buildGuideAccess(student(), [grant(1), grant(1, 'deny')], guides, NOW).canAccessGuide(1)).toBe(false)
  })

  it('учитывает сроки назначения', () => {
    const expired = grant(1, 'allow', { expiresAt: '2026-10-21T00:00:00Z' })
    const future = grant(2, 'allow', { startsAt: '2026-10-23T00:00:00Z' })
    expect(buildGuideAccess(student(), [expired, future], guides, NOW).hasAccess).toBe(false)
  })

  it('назначения на курсы и тренажёр гайды не открывают', () => {
    const others: LearningGrant[] = [{ target: { relationTo: 'courses', value: 1 }, effect: 'allow' }, { target: { relationTo: 'trainer-tasks', value: 2 }, effect: 'allow' }]
    expect(buildGuideAccess(student(), others, guides, NOW).hasAccess).toBe(false)
  })

  it('отключённый аккаунт и аноним не видят гайды даже в режиме «все»', () => {
    expect(buildGuideAccess(student({ guidesAccessMode: 'all', isActive: false }), [], guides, NOW).hasAccess).toBe(false)
    expect(buildGuideAccess(null, [], guides, NOW).hasAccess).toBe(false)
  })

  it('администратор видит все гайды, включая черновики', () => {
    const access = buildGuideAccess({ id: 1, role: 'admin' }, [], guides, NOW)
    expect(access.guideWhere).toEqual({})
    expect(access.canAccessGuide(3)).toBe(true)
  })
})

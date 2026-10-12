import { describe, expect, it } from 'vitest'

import { routeSlug } from '@/lib/route-slug'

describe('slug из параметра маршрута', () => {
  it('кириллический адрес совпадает со значением в базе', () => {
    expect(routeSlug('%D0%BE%D0%B1%D0%B7%D0%BE%D1%80-%D1%82%D0%B5%D0%BC%D1%8B-1775463625828-0')).toBe('обзор-темы-1775463625828-0')
  })
  it('обычный и уже раскодированный slug не меняются', () => {
    expect(routeSlug('react-basics')).toBe('react-basics')
    expect(routeSlug('обзор-темы')).toBe('обзор-темы')
  })
  it('битая последовательность не роняет страницу, а ведёт к обычной 404', () => {
    expect(routeSlug('%E0%A4%A')).toBe('%E0%A4%A')
  })
})

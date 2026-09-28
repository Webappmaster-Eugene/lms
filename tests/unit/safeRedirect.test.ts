import { describe, expect, it } from 'vitest'

import { safeRedirectPath } from '@/lib/safe-redirect'

describe('safeRedirectPath', () => {
  it.each([
    ['/', '/'],
    ['/courses/react?tab=2#top', '/courses/react?tab=2#top'],
    ['/trainer/js/sum', '/trainer/js/sum'],
  ])('путь приложения %s остаётся', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected)
  })

  it.each([
    'https://evil.example/steal',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'evil.example',
    '',
  ])('внешний или битый адрес «%s» заменяется на /', (input) => {
    expect(safeRedirectPath(input)).toBe('/')
  })

  it('пустое значение - запасной путь', () => {
    expect(safeRedirectPath(null, '/dashboard')).toBe('/dashboard')
  })
})

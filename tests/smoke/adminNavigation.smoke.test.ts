import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ADMIN_NAV_GROUPS, ADMIN_SHORTCUTS, isAdminPathActive } from '@/lib/admin-navigation'

function slugs(directory: string) {
  const path = fileURLToPath(new URL(directory, import.meta.url))
  return readdirSync(path).filter((name) => name.endsWith('.ts')).map((name) => {
    const source = readFileSync(`${path}/${name}`, 'utf8')
    const slug = source.match(/slug:\s*'([^']+)'/)?.[1]
    expect(slug, `нет slug в ${name}`).toBeDefined()
    if (slug === 'auth-session-revocations' || slug === 'learning-access-policies') {
      expect(source).toMatch(/hidden:\s*true/)
      return undefined
    }
    return slug
  }).filter((slug) => slug !== undefined)
}

describe('полнота меню управления', () => {
  const items = [...ADMIN_SHORTCUTS, ...ADMIN_NAV_GROUPS.flatMap((group) => [...group.items])]
  const hrefs = items.map((item) => item.href)

  it('каждая коллекция и настройки доступны из меню', () => {
    for (const slug of slugs('../../src/payload/collections/')) {
      expect(hrefs).toContain(`/admin/collections/${slug}`)
    }
    for (const slug of slugs('../../src/payload/globals/')) {
      expect(hrefs).toContain(`/admin/globals/${slug}`)
    }
  })

  it('каждая служебная страница платформы доступна из меню', () => {
    const path = fileURLToPath(new URL('../../src/app/(frontend)/admin/', import.meta.url))
    for (const route of readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      expect(hrefs).toContain(`/admin/${route.name}`)
    }
  })

  it('панель не выделяется для всех вложенных страниц, а раздел выделяется для его документов', () => {
    expect(isAdminPathActive('/admin/roadmap-editor/1', '/admin')).toBe(false)
    expect(isAdminPathActive('/admin/roadmap-editor/1', '/admin/roadmap-editor')).toBe(true)
    expect(isAdminPathActive('/admin/collections/courses-other', '/admin/collections/courses')).toBe(false)
  })
})

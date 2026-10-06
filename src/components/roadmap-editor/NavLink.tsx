'use client'

import { usePathname } from 'next/navigation'
import { ADMIN_NAV_GROUPS, ADMIN_SHORTCUTS, isAdminPathActive } from '@/lib/admin-navigation'

export function RoadmapEditorNavLink() {
  const pathname = usePathname()
  const links = [
    ...ADMIN_SHORTCUTS,
    { href: '/', label: 'Открыть платформу' },
  ]

  return (
    <nav aria-label="Переходы администратора" className="platform-admin-links">
      <p className="platform-admin-links__title">Управление</p>
      {links.map(({ href, label }) => (
        <a key={href} href={href} aria-current={isAdminPathActive(pathname, href) ? 'page' : undefined}>
          {label}
        </a>
      ))}
      {ADMIN_NAV_GROUPS.map(({ label, items }) => (
        <details key={label} open={items.some(({ href }) => isAdminPathActive(pathname, href))}>
          <summary>{label}</summary>
          <div className="platform-admin-links__group">
            {items.map(({ href, label: itemLabel }) => (
              <a key={href} href={href} aria-current={isAdminPathActive(pathname, href) ? 'page' : undefined}>
                {itemLabel}
              </a>
            ))}
          </div>
        </details>
      ))}
    </nav>
  )
}

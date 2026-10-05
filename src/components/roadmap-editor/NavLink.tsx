'use client'

import { usePathname } from 'next/navigation'
import { ADMIN_SHORTCUTS, isAdminPathActive } from '@/lib/admin-navigation'

export function RoadmapEditorNavLink() {
  const pathname = usePathname()
  const links = [
    ...ADMIN_SHORTCUTS,
    { href: '/admin/import-yandex', label: 'Импорт из Яндекс.Диска' },
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
    </nav>
  )
}

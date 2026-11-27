'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Award,
  Bookmark,
  Code2,
  Compass,
  GraduationCap,
  HelpCircle,
  Keyboard,
  LayoutDashboard,
  Map,
  MessageCircle,
  MessagesSquare,
  StickyNote,
  Trophy,
  Shield,
  Bell,
  User,
  LogOut,
  Smartphone,
  History,
  Film,
  UsersRound,
  Tent,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'
import { MobileSheet } from './MobileSheet'
import { ThemeToggle } from './ThemeToggle'
import { SHORTCUTS_OPEN_EVENT } from './KeyboardShortcuts'
import { BrandMark, BrandWordmark } from '@/components/brand/BrandMark'
import { cn } from '@/lib/utils'
import { useSidebar } from './SidebarContext'
import { disconnectDevicePush } from '@/lib/pwa-client'
import { PLATFORM_SECTIONS, withSectionAccess, type PlatformSectionHref } from '@/lib/platform-sections'

const NAV_ICONS: Record<PlatformSectionHref, typeof LayoutDashboard> = {
  '/': LayoutDashboard,
  '/bootcamp': Tent,
  '/tutoring': UsersRound,
  '/roadmaps': Map,
  '/courses': GraduationCap,
  '/trainer': Code2,
  '/interviews': Film,
  '/guides': Compass,
  '/learning-history': History,
  '/certificates': Award,
  '/notes': StickyNote,
  '/questions': MessagesSquare,
  '/saved': Bookmark,
  '/leaderboard': Trophy,
  '/profile': User,
  '/settings/app': Smartphone,
  '/settings/notifications': Bell,
  '/contacts': MessageCircle,
  '/help': HelpCircle,
}
const NAV_ITEMS = PLATFORM_SECTIONS.map((section) => ({ ...section, icon: NAV_ICONS[section.href] }))

const expandedQuery = '(min-width: 768px)'

function subscribeToWidth(notify: () => void) {
  const query = window.matchMedia(expandedQuery)
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}

function SidebarToggle() {
  const { expanded, setExpanded } = useSidebar()
  const wide = useSyncExternalStore(subscribeToWidth, () => window.matchMedia(expandedQuery).matches, () => true)
  const open = expanded ?? wide
  const label = open ? 'Свернуть меню' : 'Развернуть меню'
  const Icon = open ? PanelLeftClose : PanelLeftOpen
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={open}
      aria-controls="platform-sidebar-nav"
      onClick={() => setExpanded(!open)}
      className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring min-[480px]:max-[1024px]:flex"
    >
      <Icon aria-hidden="true" className="size-5" />
    </button>
  )
}

export function Sidebar({ isAdmin = false, trainerEnabled = true, guidesEnabled = false, bootcampEnabled = false, tutoringEnabled = false }: { isAdmin?: boolean; trainerEnabled?: boolean; guidesEnabled?: boolean; bootcampEnabled?: boolean; tutoringEnabled?: boolean }) {
  const pathname = usePathname()
  const { mobileOpen, setMobileOpen } = useSidebar()

  // A navigation outside the menu (history, deep link) must also dismiss it.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname, setMobileOpen])

  async function handleLogout() {
    await disconnectDevicePush()
    await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
    window.location.href = '/login'
  }

  const items = withSectionAccess(NAV_ITEMS, { trainerEnabled, guidesEnabled, bootcampEnabled, tutoringEnabled })

  const navContent = (mobile: boolean) => (
    <>
      {/* Logo */}
      <div className={cn('platform-sidebar-brand flex h-16 shrink-0 items-center gap-3 px-4', mobile && 'hidden')}>
        <BrandMark size={36} className="shrink-0" />
        <BrandWordmark className="h-[15px] min-w-0 w-auto text-foreground" />
        {!mobile && <SidebarToggle />}
      </div>

      {/* Navigation */}
      <nav id={mobile ? undefined : 'platform-sidebar-nav'} aria-label="Меню платформы" className={cn('flex-1 overflow-y-auto px-3 py-4', mobile ? 'grid grid-cols-1 gap-2 min-[360px]:grid-cols-2' : 'space-y-1')}>
        {items.map(({ href, label, hint, icon: Icon, locked }) => {
          const isActive = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              // Пометка в имени ссылки, а не скрытым span: Chrome отделяет такой span пробелом.
              aria-label={locked ? `${label}, нет доступа` : undefined}
              title={locked ? `Нет доступа. ${label}. ${hint}` : `${label}. ${hint}`}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'platform-nav-link relative flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                mobile && 'min-h-14 border border-border',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon aria-hidden="true" className="h-5 w-5 flex-shrink-0" />
              <span className="platform-nav-label min-w-0 flex-1 whitespace-normal">{label}</span>
              {locked && <Lock aria-hidden="true" className="platform-nav-lock h-3.5 w-3.5 flex-shrink-0" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="platform-sidebar-footer border-t border-border p-3 space-y-1">
        {isAdmin && (
          <Link
            href="/admin"
            title="Админка"
            prefetch={false}
            onClick={() => setMobileOpen(false)}
            className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Shield aria-hidden="true" className="h-5 w-5 shrink-0" />
            <span className="platform-nav-label">Админка</span>
          </Link>
        )}
        <div className="platform-sidebar-actions flex items-center justify-between px-3">
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent(SHORTCUTS_OPEN_EVENT))}
              aria-label="Горячие клавиши"
              title="Горячие клавиши (?)"
              className="hidden min-h-[44px] items-center rounded-lg px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground min-[480px]:flex"
            >
              <Keyboard className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <button
            onClick={handleLogout}
            title="Выйти"
            className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="platform-nav-label">Выйти</span>
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      <MobileSheet closeAtWidth={480} id="platform-mobile-menu" open={mobileOpen} onClose={() => setMobileOpen(false)} title="Меню платформы">
        {navContent(true)}
      </MobileSheet>

      {/* Desktop sidebar */}
      <aside className="platform-sidebar fixed inset-y-0 left-0 hidden flex-col border-r border-border bg-card min-[480px]:flex min-[1024px]:w-64">
        {navContent(false)}
      </aside>
    </>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Award,
  BookOpen,
  Bookmark,
  Code2,
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
} from 'lucide-react'
import { useEffect } from 'react'
import { MobileSheet } from './MobileSheet'
import { ThemeToggle } from './ThemeToggle'
import { SHORTCUTS_OPEN_EVENT } from './KeyboardShortcuts'
import { cn } from '@/lib/utils'
import { useSidebar } from './SidebarContext'
import { disconnectDevicePush } from '@/lib/pwa-client'

const NAV_ITEMS = [
  { href: '/', label: 'Дашборд', icon: LayoutDashboard },
  { href: '/courses', label: 'Курсы', icon: GraduationCap },
  { href: '/roadmaps', label: 'Роадмапы', icon: Map },
  { href: '/trainer', label: 'Тренажёр', icon: Code2 },
  { href: '/leaderboard', label: 'Лидерборд', icon: Trophy },
  { href: '/certificates', label: 'Сертификаты', icon: Award },
  { href: '/notes', label: 'Заметки', icon: StickyNote },
  { href: '/questions', label: 'Вопросы', icon: MessagesSquare },
  { href: '/saved', label: 'Сохранённое', icon: Bookmark },
  { href: '/profile', label: 'Профиль', icon: User },
  { href: '/settings/notifications', label: 'Приложение и уведомления', icon: Bell },
  { href: '/contacts', label: 'Контакты', icon: MessageCircle },
  { href: '/help', label: 'Помощь', icon: HelpCircle },
] as const

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
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

  const navContent = (mobile: boolean) => (
    <>
      {/* Logo */}
      <div className={cn('flex h-16 items-center gap-3 px-4', mobile && 'hidden')}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <BookOpen className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold text-foreground">MentorCareer</span>
      </div>

      {/* Navigation */}
      <nav aria-label="Меню платформы" className={cn('flex-1 overflow-y-auto px-3 py-4', mobile ? 'grid grid-cols-1 gap-2 min-[360px]:grid-cols-2' : 'space-y-1')}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                mobile && 'min-h-14 border border-border',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon aria-hidden="true" className="h-5 w-5 flex-shrink-0" />
              <span className="min-w-0 whitespace-normal">{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-1">
        {isAdmin && (
          <Link
            href="/admin"
            prefetch={false}
            onClick={() => setMobileOpen(false)}
            className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Shield aria-hidden="true" className="h-5 w-5 shrink-0" />
            Админка
          </Link>
        )}
        <div className="flex items-center justify-between px-3">
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent(SHORTCUTS_OPEN_EVENT))}
              aria-label="Горячие клавиши"
              title="Горячие клавиши (?)"
              className="hidden min-h-[44px] items-center rounded-lg px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:flex"
            >
              <Keyboard className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      <MobileSheet id="platform-mobile-menu" open={mobileOpen} onClose={() => setMobileOpen(false)} title="Меню платформы">
        {navContent(true)}
      </MobileSheet>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 lg:border-r lg:border-border lg:bg-card">
        {navContent(false)}
      </aside>
    </>
  )
}

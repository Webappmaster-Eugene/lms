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
  ChevronDown,
  Shield,
  Users,
  User,
  LogOut,
  X,
} from 'lucide-react'
import { useEffect } from 'react'
import { ThemeToggle } from './ThemeToggle'
import { SHORTCUTS_OPEN_EVENT } from './KeyboardShortcuts'
import { cn } from '@/lib/utils'
import { useSidebar } from './SidebarContext'
import { ADMIN_NAV_GROUPS, ADMIN_SHORTCUTS, isAdminPathActive } from '@/lib/admin-navigation'

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
  { href: '/contacts', label: 'Контакты', icon: MessageCircle },
  { href: '/help', label: 'Помощь', icon: HelpCircle },
] as const

const ADMIN_ICONS = {
  '/manage': GraduationCap,
  '/admin': Shield,
  '/admin/roadmap-editor': Map,
  '/admin/collections/users': Users,
  '/admin/questions': MessagesSquare,
} as const

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname()
  const { mobileOpen, setMobileOpen } = useSidebar()

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  async function handleLogout() {
    await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
    window.location.href = '/login'
  }

  const navContent = (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <BookOpen className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold text-foreground">MentorCareer</span>
      </div>

      {/* Navigation */}
      <nav aria-label="Меню платформы" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {/* Admin-only links */}
        {isAdmin && (
          <>
            <p className="px-3 py-2 text-sm font-semibold text-foreground">Управление</p>
            {ADMIN_SHORTCUTS.map(({ href, label }) => {
              const Icon = ADMIN_ICONS[href]
              const isActive = isAdminPathActive(pathname, href)
              return (
                <a
                  key={href}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {label}
                </a>
              )
            })}
            {ADMIN_NAV_GROUPS.map(({ label, items }) => (
              <details key={label} open={items.some(({ href }) => isAdminPathActive(pathname, href))} className="group">
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                  {label}
                  <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div className="ml-3 space-y-1 border-l border-border pl-2">
                  {items.map(({ href, label: itemLabel }) => {
                    const isActive = isAdminPathActive(pathname, href)
                    return (
                      <a
                        key={href}
                        href={href}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          'flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                          isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        {itemLabel}
                      </a>
                    )
                  })}
                </div>
              </details>
            ))}
          </>
        )}
        {isAdmin && <p className="mt-4 border-t border-border px-3 pt-4 pb-2 text-sm font-semibold text-foreground">Обучение</p>}
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-1">
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
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card transition-transform duration-300 ease-in-out lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-4 flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          aria-label="Закрыть меню"
        >
          <X className="h-5 w-5" />
        </button>
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 lg:border-r lg:border-border lg:bg-card">
        {navContent}
      </aside>
    </>
  )
}

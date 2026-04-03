'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Award,
  BookOpen,
  Code2,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  Map,
  MessageCircle,
  Trophy,
  Upload,
  User,
  LogOut,
  X,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { ThemeToggle } from './ThemeToggle'
import { cn } from '@/lib/utils'
import { useSidebar } from './SidebarContext'

const NAV_ITEMS = [
  { href: '/', label: 'Дашборд', icon: LayoutDashboard },
  { href: '/courses', label: 'Курсы', icon: GraduationCap },
  { href: '/roadmaps', label: 'Роадмапы', icon: Map },
  { href: '/trainer', label: 'Тренажёр', icon: Code2 },
  { href: '/leaderboard', label: 'Лидерборд', icon: Trophy },
  { href: '/certificates', label: 'Сертификаты', icon: Award },
  { href: '/profile', label: 'Профиль', icon: User },
  { href: '/contacts', label: 'Контакты', icon: MessageCircle },
  { href: '/help', label: 'Помощь', icon: HelpCircle },
] as const

const ADMIN_NAV_ITEMS = [
  { href: '/admin/import-yandex', label: 'Импорт из YD', icon: Upload },
] as const

export function Sidebar() {
  const pathname = usePathname()
  const { mobileOpen, setMobileOpen } = useSidebar()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    fetch('/api/users/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.user?.role === 'admin') setIsAdmin(true)
      })
      .catch(() => {})
  }, [])

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
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
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

        {/* Admin-only links */}
        {isAdmin && (
          <>
            <div className="my-2 border-t border-border" />
            {ADMIN_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
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
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-1">
        <div className="flex items-center justify-between px-3">
          <ThemeToggle />
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

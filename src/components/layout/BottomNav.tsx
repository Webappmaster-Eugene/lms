'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Code2, GraduationCap, LayoutDashboard, Menu, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebar } from './SidebarContext'

type Tab = {
  href: string
  label: string
  icon: typeof LayoutDashboard
  exact?: boolean
}

const TABS: readonly Tab[] = [
  { href: '/', label: 'Главная', icon: LayoutDashboard, exact: true },
  { href: '/courses', label: 'Курсы', icon: GraduationCap },
  { href: '/trainer', label: 'Тренажёр', icon: Code2 },
  { href: '/leaderboard', label: 'Рейтинг', icon: Trophy },
]

export function BottomNav({ trainerEnabled = true }: { trainerEnabled?: boolean } = {}) {
  const pathname = usePathname()
  const { mobileOpen, toggleMobile } = useSidebar()

  return (
    <nav aria-label="Основная навигация" className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div
        className="mx-auto flex h-16 max-w-lg items-stretch justify-around"
      >
        {TABS.filter((item) => trainerEnabled || item.href !== '/trainer').map(({ href, label, icon: Icon, exact }) => {
          const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`) || (href === '/courses' && pathname.startsWith('/lessons/'))
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', isActive && 'bg-primary/10')}><Icon aria-hidden="true" className="h-5 w-5" /></span>
              <span>{label}</span>
            </Link>
          )
        })}

        {/* More button — opens sidebar */}
        <button
          type="button"
          onClick={toggleMobile}
          aria-expanded={mobileOpen}
          aria-haspopup="dialog"
          aria-controls={mobileOpen ? 'platform-mobile-menu' : undefined}
          className="flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="flex h-7 w-12 items-center justify-center"><Menu aria-hidden="true" className="h-5 w-5" /></span>
          <span>Ещё</span>
        </button>
      </div>
    </nav>
  )
}

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

export function BottomNav() {
  const pathname = usePathname()
  const { toggleMobile } = useSidebar()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md lg:hidden">
      <div
        className="mx-auto flex h-16 max-w-lg items-stretch justify-around"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {TABS.map(({ href, label, icon: Icon, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          )
        })}

        {/* More button — opens sidebar */}
        <button
          onClick={toggleMobile}
          className="flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors"
        >
          <Menu className="h-5 w-5" />
          <span>Ещё</span>
        </button>
      </div>
    </nav>
  )
}

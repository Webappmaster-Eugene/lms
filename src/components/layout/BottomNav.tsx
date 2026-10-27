'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { GraduationCap, History, LayoutDashboard, Map, Menu, Tent } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHydrated } from '@/hooks/use-hydrated'
import { useSidebar } from './SidebarContext'

type Tab = {
  href: string
  label: string
  icon: typeof LayoutDashboard
  exact?: boolean
}

const TABS: readonly Tab[] = [
  { href: '/', label: 'Главная', icon: LayoutDashboard, exact: true },
  { href: '/roadmaps', label: 'Роадмапы', icon: Map },
  { href: '/courses', label: 'Курсы', icon: GraduationCap },
  // Тренажёр открывается из «Ещё»: с ним вкладок шесть, и на узком телефоне они теснятся.
  { href: '/learning-history', label: 'История', icon: History },
]

/** Участнику буткемпа он важнее истории: та остаётся в «Ещё», а вкладок по-прежнему пять. */
const BOOTCAMP_TABS: readonly Tab[] = [...TABS.slice(0, 3), { href: '/bootcamp', label: 'Буткемпы', icon: Tent }]

export function BottomNav({ bootcampEnabled = false }: { bootcampEnabled?: boolean } = {}) {
  const hydrated = useHydrated()
  const pathname = usePathname()
  const { mobileOpen, toggleMobile } = useSidebar()

  return (
    <nav aria-label="Основная навигация" className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div
        className="mx-auto flex h-16 max-w-lg items-stretch justify-around"
      >
        {(bootcampEnabled ? BOOTCAMP_TABS : TABS).map(({ href, label, icon: Icon, exact }) => {
          // Урок участника буткемпа скорее из буткемпа: подсветка «Курсов» на нём была бы ложной.
          const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`) || (href === '/courses' && !bootcampEnabled && pathname.startsWith('/lessons/'))
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span className={cn('flex h-7 w-full max-w-12 items-center justify-center rounded-full', isActive && 'bg-primary/10')}><Icon aria-hidden="true" className="h-5 w-5" /></span>
              {/* На 320px вкладка шириной 64px, а «Роадмапы» в Inter 11px — 61px: без боковых отступов
                  и с плотным трекингом на узких экранах подпись влезает с запасом, без многоточия. */}
              <span className="max-w-full truncate max-[359px]:tracking-tight">{label}</span>
            </Link>
          )
        })}

        {/* More button — opens sidebar */}
        <button
          type="button"
          disabled={!hydrated}
          onClick={toggleMobile}
          aria-expanded={mobileOpen}
          aria-haspopup="dialog"
          aria-controls={mobileOpen ? 'platform-mobile-menu' : undefined}
          className="flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
        >
          <span className="flex h-7 w-full max-w-12 items-center justify-center"><Menu aria-hidden="true" className="h-5 w-5" /></span>
          <span className="max-w-full truncate max-[359px]:tracking-tight">Ещё</span>
        </button>
      </div>
    </nav>
  )
}

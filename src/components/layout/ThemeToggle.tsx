'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

import { useHydrated } from '@/hooks/use-hydrated'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const hydrated = useHydrated()

  if (!hydrated) {
    return <div className="h-11 w-11" />
  }

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      type="button"
      className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      aria-label="Переключить тему"
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  )
}

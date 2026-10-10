'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { useHydrated } from '@/hooks/use-hydrated'
import { fieldClassName } from '@/components/profile/PasswordField'

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const hydrated = useHydrated()
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (window.location.hash === '#appearance') sectionRef.current?.scrollIntoView({ block: 'start' })
  }, [])
  return (
    <section ref={sectionRef} id="appearance" aria-labelledby="appearance-heading" className="scroll-mt-24 rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 id="appearance-heading" className="text-lg font-semibold">Удобство и приложение</h2>
      <div className="mt-4 max-w-sm">
        <label htmlFor="appearance-theme" className="text-sm font-medium">Тема оформления</label>
        <select id="appearance-theme" value={hydrated ? theme ?? 'system' : 'system'} disabled={!hydrated} onChange={(event) => setTheme(event.target.value)} className={fieldClassName} aria-describedby="theme-help">
          <option value="system">Как на устройстве</option>
          <option value="light">Светлая</option>
          <option value="dark">Тёмная</option>
        </select>
        <p id="theme-help" className="mt-2 text-xs text-muted-foreground">Применяется сразу и сохраняется в этом браузере.</p>
      </div>
      <div className="mt-4 flex flex-col items-start gap-1">
        <Link href="/settings/notifications" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">Настроить уведомления</Link>
        <Link href="/settings/app" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">Установить приложение</Link>
      </div>
    </section>
  )
}

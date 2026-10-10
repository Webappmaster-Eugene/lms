'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Download, Smartphone } from 'lucide-react'
import { currentInstallPrompt, rememberInstallPrompt } from '@/lib/pwa-client'
import { usePwaCapabilities } from './use-pwa-capabilities'

export function AppSettings() {
  const { installed, canInstall } = usePwaCapabilities()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function install() {
    const prompt = currentInstallPrompt()
    if (!prompt) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      rememberInstallPrompt(null)
      if (choice.outcome === 'accepted') setNotice('Приложение установлено. Откройте MentorCareer с домашнего экрана.')
    } catch {
      setError('Не удалось открыть установку. Попробуйте добавить приложение через меню браузера.')
      rememberInstallPrompt(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Приложение</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Открывайте MentorCareer с домашнего экрана телефона и продолжайте учиться с места остановки.</p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-border bg-accent p-4 text-sm">{notice}</p>}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="install-heading">
        <h2 id="install-heading" className="flex items-center gap-3 text-lg font-semibold"><Smartphone className="h-5 w-5 shrink-0" aria-hidden="true" />Приложение на телефоне</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Те же курсы, уроки и заметки — с иконкой на домашнем экране и без панели браузера.</p>
        {installed ? (
          <p className="mt-4 flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Вы уже открыли установленное приложение</p>
        ) : canInstall ? (
          <button type="button" disabled={busy} onClick={() => void install()} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><Download className="h-4 w-4" aria-hidden="true" />{busy ? 'Устанавливаем…' : 'Установить приложение'}</button>
        ) : (
          <div className="mt-4 space-y-3 text-sm leading-relaxed"><p><strong>Android:</strong> откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».</p><p><strong>iPhone:</strong> нажмите «Поделиться» → «На экран Домой», затем откройте приложение с новой иконки.</p></div>
        )}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Для новых уроков и синхронизации нужен интернет. Вход сохраняется на 30 дней, место остановки переносится между устройствами.</p>
      </section>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="app-preferences-heading">
        <h2 id="app-preferences-heading" className="text-lg font-semibold">Настройки приложения</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Разрешение на уведомления запрашивается отдельно. Для push на iPhone требуется iOS 16.4 или новее.</p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/settings/notifications" className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Настроить уведомления</Link>
          <Link href="/profile/edit#appearance" className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Выбрать тему оформления</Link>
        </div>
      </section>
    </div>
  )
}

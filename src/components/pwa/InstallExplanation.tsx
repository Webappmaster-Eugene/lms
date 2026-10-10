'use client'

import Link from 'next/link'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { BellRing, BookOpen, Download, Smartphone } from 'lucide-react'
import { MobileSheet } from '@/components/layout/MobileSheet'
import { currentInstallPrompt, installExplanationSeen, isInstalledPwa, isIosDevice, rememberInstallExplanation, rememberInstallPrompt } from '@/lib/pwa-client'

function subscribeToInstallation(callback: () => void) {
  window.addEventListener('lms:install-ready', callback)
  return () => window.removeEventListener('lms:install-ready', callback)
}

function installationState() {
  return (currentInstallPrompt() ? 1 : 0) | (isInstalledPwa() ? 2 : 0) | (isIosDevice() ? 4 : 0)
}

const actionClass = 'flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function InstallExplanation({ paused = false }: { paused?: boolean }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const environment = useSyncExternalStore(subscribeToInstallation, installationState, () => 0)
  const canInstall = Boolean(environment & 1)
  const installed = Boolean(environment & 2)
  const ios = Boolean(environment & 4)

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 1023px)').matches && (/Android|iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.maxTouchPoints > 1)
    if (!mobile || paused || installed || installExplanationSeen()) return
    let timer: ReturnType<typeof setTimeout>
    const reveal = () => {
      if (installExplanationSeen()) return
      // Do not stack onboarding over a menu, search or lesson dialog.
      if (document.visibilityState === 'hidden' || document.querySelector('dialog[open]')) {
        timer = setTimeout(reveal, 1500)
        return
      }
      setOpen(true)
    }
    timer = setTimeout(reveal, 1500)
    return () => clearTimeout(timer)
  }, [installed, paused])

  useEffect(() => {
    const installedApp = () => { rememberInstallExplanation(); setOpen(false) }
    window.addEventListener('appinstalled', installedApp)
    return () => window.removeEventListener('appinstalled', installedApp)
  }, [])

  function dismiss() {
    rememberInstallExplanation()
    setOpen(false)
  }

  async function install() {
    const prompt = currentInstallPrompt()
    if (!prompt || busy) return
    setBusy(true)
    setError('')
    try {
      await prompt.prompt()
      await prompt.userChoice
      rememberInstallPrompt(null)
      dismiss()
    } catch {
      setError('Не удалось открыть установку. Откройте меню браузера и выберите «Установить приложение».')
    } finally { setBusy(false) }
  }

  return (
    <MobileSheet open={open && !paused && !installed} onClose={dismiss} title="Учиться удобнее с телефона" closeLabel="Закрыть подсказку об установке">
      <div className="space-y-5 p-5">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-1 h-7 w-7 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm leading-relaxed">Добавьте MentorCareer на главный экран: курсы и ваше место в уроке будут под рукой, как в обычном приложении.</p>
        </div>
        <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <li className="flex gap-3"><BookOpen className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><span>Те же уроки, заметки и прогресс — без панели браузера.</span></li>
          <li className="flex gap-3"><BellRing className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><span>Напоминания о занятиях и ответы ментора на телефоне. Уведомления включаются отдельно, когда вы захотите.</span></li>
        </ul>
        {!canInstall && <div className="rounded-xl bg-muted p-4 text-sm leading-relaxed">{ios ? <p>На iPhone или iPad откройте сайт в Safari, нажмите «Поделиться» → «На экран Домой», затем «Добавить». Откройте MentorCareer с новой иконки.</p> : <p>Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».</p>}</div>}
        <p className="text-xs leading-relaxed text-muted-foreground">Для уроков и синхронизации нужен интернет.{ios && ' Уведомления доступны в установленном приложении на iOS 16.4 и новее.'}</p>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="space-y-2">
          {canInstall && <button type="button" disabled={busy} onClick={() => void install()} className={actionClass + ' bg-primary text-primary-foreground disabled:opacity-50'}><Download className="h-4 w-4" aria-hidden="true" />{busy ? 'Открываем установку…' : 'Установить приложение'}</button>}
          <Link href="/settings/notifications" onClick={dismiss} className={actionClass + ' border border-border'}>Приложение и уведомления</Link>
          <button type="button" onClick={dismiss} className={actionClass + ' text-muted-foreground'}>Продолжить в браузере</button>
        </div>
      </div>
    </MobileSheet>
  )
}

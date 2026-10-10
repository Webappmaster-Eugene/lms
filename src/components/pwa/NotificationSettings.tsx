'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { BellRing, CheckCircle2, Download, Smartphone } from 'lucide-react'
import { currentInstallPrompt, isInstalledPwa, isIosDevice, rememberInstallPrompt, vapidBytes } from '@/lib/pwa-client'

interface Preferences {
  remindersEnabled: boolean
  timezone: string
  reminderHour: number
  pushEnabled: boolean
}
interface PushSettings {
  preferences: Preferences
  vapidPublicKey: string | null
  pushConfigured: boolean
  devicesCount: number
}

const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const secondaryClass = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const timezoneNames: Record<string, string> = {
  'Europe/Moscow': 'Москва', 'Asia/Yekaterinburg': 'Екатеринбург',
  'Asia/Novosibirsk': 'Новосибирск', 'Asia/Almaty': 'Алматы',
  'Europe/Berlin': 'Берлин', 'Europe/London': 'Лондон',
  'America/New_York': 'Нью-Йорк', 'America/Los_Angeles': 'Лос-Анджелес',
}

function timezoneLabel(zone: string) {
  const offset = new Intl.DateTimeFormat('ru', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts().find((part) => part.type === 'timeZoneName')?.value
  return `${timezoneNames[zone] ?? zone.replaceAll('_', ' ')}${offset ? ` (${offset})` : ''}`
}

async function request(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) {
    if (response.status === 401) throw new Error('Сессия завершилась. Войдите в аккаунт заново.')
    if (response.status === 409) throw new Error('Это устройство связано с другим аккаунтом. Отключите уведомления в прежнем аккаунте и попробуйте снова.')
    throw new Error('Не удалось выполнить действие. Проверьте подключение и попробуйте снова.')
  }
  return response.status === 204 ? null : response.json()
}

function settingsDto(value: unknown): PushSettings {
  if (!value || typeof value !== 'object' || !('preferences' in value) || !value.preferences || typeof value.preferences !== 'object') throw new Error('Не удалось загрузить настройки')
  const prefs = value.preferences as Record<string, unknown>
  const data = value as Record<string, unknown>
  if (typeof prefs.remindersEnabled !== 'boolean' || typeof prefs.pushEnabled !== 'boolean' || typeof prefs.timezone !== 'string' || typeof prefs.reminderHour !== 'number' || typeof data.pushConfigured !== 'boolean' || typeof data.devicesCount !== 'number' || !(data.vapidPublicKey === null || typeof data.vapidPublicKey === 'string')) throw new Error('Не удалось загрузить настройки')
  return value as PushSettings
}

function subscribeToCapabilities(callback: () => void) {
  window.addEventListener('lms:install-ready', callback)
  return () => window.removeEventListener('lms:install-ready', callback)
}

function capabilities() {
  const installed = isInstalledPwa()
  const ios = isIosDevice()
  const push = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const denied = 'Notification' in window && Notification.permission === 'denied'
  return (push ? 1 : 0) | (installed ? 2 : 0) | (ios && !installed ? 4 : 0) | (currentInstallPrompt() ? 8 : 0) | (denied ? 16 : 0)
}

export function NotificationSettings() {
  const [settings, setSettings] = useState<PushSettings | null>(null)
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const environment = useSyncExternalStore(subscribeToCapabilities, capabilities, () => 0)
  const supported = Boolean(environment & 1)
  const installed = Boolean(environment & 2)
  const needsHomeScreen = Boolean(environment & 4)
  const canInstall = Boolean(environment & 8)
  const denied = Boolean(environment & 16)
  const [subscribed, setSubscribed] = useState(false)

  async function load() {
    const data = settingsDto(await request('/api/push/settings'))
    setSettings(data)
    setPreferences(data.preferences)
  }

  useEffect(() => {
    let active = true
    const hasPush = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window
    void request('/api/push/settings').then(settingsDto).then((data) => {
      if (active) { setSettings(data); setPreferences(data.preferences) }
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить настройки') })
    if (hasPush) void navigator.serviceWorker.getRegistration('/').then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription()
      if (active) setSubscribed(Boolean(subscription))
    }).catch(() => { /* A worker may still be installing on first visit. */ })
    return () => { active = false }
  }, [])

  async function action(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await work() } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось выполнить действие')
    } finally { setBusy(false) }
  }

  function enablePush() {
    if (!settings?.vapidPublicKey) return
    // The permission prompt starts directly in the click handler, including on iOS.
    const permissionRequest = Notification.requestPermission()
    void action(async () => {
      const granted = await permissionRequest
      window.dispatchEvent(new Event('lms:install-ready'))
      if (granted !== 'granted') { setNotice('Разрешение не выдано. Уведомления внутри сайта продолжают работать.'); return }
      await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Приложение ещё не готово. Обновите страницу и попробуйте снова.')), 15000)),
      ])
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(settings.vapidPublicKey ?? '') })
      try { await request('/api/push/subscriptions', 'POST', subscription.toJSON()) }
      catch (cause) { await subscription.unsubscribe(); throw cause }
      setSubscribed(true)
      await load()
      setNotice('Уведомления на этом устройстве включены.')
    })
  }

  function disableDevice() {
    void action(async () => {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await request('/api/push/subscriptions', 'DELETE', { endpoint: subscription.endpoint })
        await subscription.unsubscribe()
      }
      setSubscribed(false); await load(); setNotice('Уведомления на этом устройстве отключены. Другие устройства продолжают работать.')
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Приложение и уведомления</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Продолжайте обучение с телефона и выбирайте, когда получать напоминания.</p></header>
      {error && <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"><p>{error}</p>{!settings && <button type="button" className={secondaryClass + ' mt-3'} disabled={busy} onClick={() => void action(load)}>Попробовать снова</button>}</div>}
      {notice && <p role="status" className="rounded-xl border border-border bg-accent p-4 text-sm">{notice}</p>}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="install-heading">
        <h2 id="install-heading" className="flex items-center gap-3 text-lg font-semibold"><Smartphone className="h-5 w-5 shrink-0" aria-hidden="true" />Приложение на телефоне</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Те же курсы, уроки, заметки и место остановки — с иконкой на домашнем экране и без панели браузера.</p>
        {installed ? <p className="mt-4 flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Вы уже открыли установленное приложение</p> : canInstall ? <button type="button" disabled={busy} className={buttonClass + ' mt-4'} onClick={() => void action(async () => { const prompt = currentInstallPrompt(); if (!prompt) return; await prompt.prompt(); const choice = await prompt.userChoice; rememberInstallPrompt(null); if (choice.outcome === 'accepted') setNotice('Приложение установлено. Откройте MentorCareer с домашнего экрана.'); })}><Download className="h-4 w-4" aria-hidden="true" />Установить приложение</button> : (
          <div className="mt-4 space-y-3 text-sm leading-relaxed"><p><strong>Android:</strong> откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».</p><p><strong>iPhone:</strong> нажмите «Поделиться» → «На экран Домой», затем откройте приложение с новой иконки. Для push требуется iOS 16.4 или новее.</p></div>
        )}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Для новых уроков и синхронизации нужен интернет. Вход сохраняется на 30 дней, место остановки переносится между устройствами.</p>
      </section>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="push-heading">
        <h2 id="push-heading" className="flex items-center gap-3 text-lg font-semibold"><BellRing className="h-5 w-5 shrink-0" aria-hidden="true" />Уведомления на этом устройстве</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Ответы ментора, достижения, сертификаты и учебные напоминания могут приходить, даже когда приложение закрыто.</p>
        {!settings ? <p className="mt-4 text-sm" role="status">Загружаем настройки…</p> : !settings.pushConfigured ? <p className="mt-4 text-sm text-muted-foreground">Уведомления на телефон ещё настраиваются. Все сообщения доступны в колокольчике на сайте.</p> : needsHomeScreen ? <p className="mt-4 text-sm">Сначала добавьте приложение на экран «Домой» и откройте его с иконки.</p> : !supported ? <p className="mt-4 text-sm">Этот браузер не поддерживает push. Используйте современный браузер или установленное приложение.</p> : denied ? <p className="mt-4 text-sm">Уведомления запрещены в настройках браузера или телефона. Разрешите их для MentorCareer и обновите страницу.</p> : (
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" disabled={busy} className={subscribed ? secondaryClass : buttonClass} onClick={subscribed ? disableDevice : enablePush}>{subscribed ? 'Отключить на этом устройстве' : 'Включить уведомления'}</button>
            {subscribed && <button type="button" disabled={busy || !preferences?.pushEnabled} className={secondaryClass} onClick={() => void action(async () => { await request('/api/push/test', 'POST', {}); setNotice('Проверочное уведомление поставлено в очередь. Оно появится на устройстве после отправки.'); })}>Отправить проверочное уведомление</button>}
          </div>
        )}
        {settings && <p className="mt-4 text-xs text-muted-foreground">Подключено устройств: {settings.devicesCount}. Выход из аккаунта останавливает уведомления этой сессии.</p>}
      </section>
      {preferences && <form className="rounded-2xl border border-border bg-card p-5 sm:p-6" onSubmit={(event) => { event.preventDefault(); void action(async () => { await request('/api/push/settings', 'PATCH', preferences); await load(); setNotice('Настройки сохранены.'); }) }}>
        <h2 className="text-lg font-semibold">Учебный ритм</h2>
        <label className="mt-4 flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-primary" checked={preferences.remindersEnabled} onChange={(event) => setPreferences({ ...preferences, remindersEnabled: event.target.checked })} /><span><strong className="block">Напоминать, если я давно не учился</strong><span className="mt-1 block leading-relaxed text-muted-foreground">После 3, 7 и 14 дней без учебной активности. Затем сделаем паузу, пока вы не вернётесь. Никаких напоминаний ночью.</span></span></label>
        <label className="mt-4 flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-primary" checked={preferences.pushEnabled} onChange={(event) => setPreferences({ ...preferences, pushEnabled: event.target.checked })} /><span><strong className="block">Разрешить push на подключённых устройствах</strong><span className="mt-1 block text-muted-foreground">Уведомления внутри сайта останутся доступны и при отключении push.</span></span></label>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm"><span className="block font-medium">Время напоминания</span><select className="min-h-11 w-full rounded-xl border border-border bg-background px-3" value={preferences.reminderHour} onChange={(event) => setPreferences({ ...preferences, reminderHour: Number(event.target.value) })}>{Array.from({ length: 14 }, (_, i) => i + 8).map((hour) => <option value={hour} key={hour}>{String(hour).padStart(2, '0')}:00</option>)}</select></label>
          <label className="space-y-2 text-sm"><span className="block font-medium">Часовой пояс</span><select className="min-h-11 w-full rounded-xl border border-border bg-background px-3" value={preferences.timezone} onChange={(event) => setPreferences({ ...preferences, timezone: event.target.value })}>{[...new Set([preferences.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone, 'Europe/Moscow', 'Asia/Yekaterinburg', 'Asia/Novosibirsk', 'Asia/Almaty', 'Europe/Berlin', 'Europe/London', 'America/New_York', 'America/Los_Angeles'])].map((zone) => <option value={zone} key={zone}>{timezoneLabel(zone)}</option>)}</select></label>
        </div>
        <button className={buttonClass + ' mt-5'} disabled={busy} type="submit">{busy ? 'Сохраняем…' : 'Сохранить настройки'}</button>
      </form>}
    </div>
  )
}

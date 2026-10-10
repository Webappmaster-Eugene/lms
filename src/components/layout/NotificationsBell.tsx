'use client'

import { useState, useEffect, useRef, useId, useCallback } from 'react'
import { Bell, X } from 'lucide-react'
import Link from 'next/link'
import { useAsyncData } from '@/hooks/use-async-data'
import { safeNotificationLink } from '@/lib/notification-policy'
import { formatDate } from '@/lib/utils'
import { markNotificationsRead, requestNotifications, requestUnreadNotificationCount, type NotificationDoc } from './notifications-api'

const POLL_INTERVAL_MS = 30_000
type BellData = { docs: NotificationDoc[]; unread: number | null }

export function NotificationsBell({ userId }: { userId?: number }) {
  const [open, setOpen] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [mutationError, setMutationError] = useState('')
  const [marking, setMarking] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const loadNotifications = useCallback(async (signal: AbortSignal): Promise<BellData> => {
    try {
      const requests = await Promise.allSettled([requestNotifications(signal, fetch, userId), requestUnreadNotificationCount(signal, userId)])
      if (signal.aborted) return { docs: [], unread: null }
      if (requests.some((result) => result.status === 'fulfilled' && result.value.status === 'unauthorized')) {
        setSessionExpired(true)
        return { docs: [], unread: 0 }
      }
      const [listResult, countResult] = requests
      if (listResult.status === 'rejected') throw listResult.reason
      if (countResult.status === 'rejected') throw countResult.reason
      const result = listResult.value
      const count = countResult.value
      if (result.status !== 'ok' || count.status !== 'ok') return { docs: [], unread: 0 }
      setLoadError('')
      return { docs: result.docs, unread: count.count }
    } catch (error) {
      if (!signal.aborted) setLoadError('Не удалось загрузить уведомления. Попробуйте ещё раз.')
      throw error
    }
  }, [userId])

  const { data, reload, setData, loading } = useAsyncData<BellData>(loadNotifications, { docs: [], unread: null })
  const unreadCount = data.unread ?? 0

  useEffect(() => {
    if (data.unread !== null) window.dispatchEvent(new CustomEvent('lms:notification-count', { detail: data.unread }))
  }, [data.unread])

  useEffect(() => {
    if (sessionExpired) return
    const interval = setInterval(reload, POLL_INTERVAL_MS)
    window.addEventListener('lms:notification', reload)
    return () => { clearInterval(interval); window.removeEventListener('lms:notification', reload) }
  }, [reload, sessionExpired])

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>('[data-close-notifications]')?.focus({ preventScroll: true })
    const clickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus({ preventScroll: true })
    }
    document.addEventListener('mousedown', clickOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('mousedown', clickOutside); document.removeEventListener('keydown', onKeyDown) }
  }, [open])

  async function read(notifications: NotificationDoc[]) {
    setMarking(true)
    setMutationError('')
    const result = await markNotificationsRead(notifications)
    if (result.unauthorized) {
      setSessionExpired(true)
      setData({ docs: [], unread: 0 })
    } else {
      setData((previous) => ({
        docs: previous.docs.map((notification) => result.readIds.has(String(notification.id)) ? { ...notification, isRead: true } : notification),
        unread: previous.unread === null ? null : Math.max(0, previous.unread - result.readIds.size),
      }))
      if (result.failed) setMutationError('Не все уведомления удалось отметить прочитанными. Попробуйте ещё раз.')
      if (result.readIds.size) window.dispatchEvent(new Event('lms:notification'))
    }
    setMarking(false)
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button ref={triggerRef} type="button" onClick={() => setOpen(!open)} aria-label="Уведомления" aria-describedby={unreadCount > 0 ? `${panelId}-count` : undefined} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? panelId : undefined} className="relative flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <Bell aria-hidden="true" className="h-5 w-5" />
        {unreadCount > 0 && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        {unreadCount > 0 && <span id={`${panelId}-count`} className="sr-only">Непрочитанных: {unreadCount}</span>}
      </button>
      {open && (
        <div ref={panelRef} id={panelId} role="dialog" aria-label="Уведомления" className="fixed inset-x-4 top-[calc(4.5rem+env(safe-area-inset-top,0px))] z-50 flex max-h-[calc(100dvh-10rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[calc(100dvh-6rem)] sm:w-96">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
            <h2 className="min-w-0 text-sm font-semibold text-foreground">Уведомления</h2>
            <button type="button" data-close-notifications aria-label="Закрыть уведомления" onClick={() => { setOpen(false); triggerRef.current?.focus({ preventScroll: true }) }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><X aria-hidden="true" className="h-5 w-5" /></button>
          </div>
          <div className="min-h-0 max-h-[55dvh] overflow-y-auto overscroll-contain">
            {sessionExpired ? <p className="px-4 py-6 text-sm text-muted-foreground">Сессия истекла. <Link href="/login" className="text-primary underline">Войдите снова</Link></p> : (
              <>
                {loadError && <div role="alert" className="px-4 py-3 text-sm text-destructive"><p>{loadError}</p><button type="button" onClick={reload} className="mt-1 min-h-11 text-primary underline">Повторить</button></div>}
                {mutationError && <p role="alert" className="px-4 py-3 text-sm text-destructive">{mutationError}</p>}
                {loading ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Загружаем уведомления…</p> : data.docs.length === 0 && !loadError ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Нет уведомлений</p> : data.docs.map((notification) => {
                  const content = <div className={`min-h-11 border-b border-border px-4 py-3 transition-colors ${notification.isRead ? '' : 'bg-primary/5'}`}><p className="break-words text-sm font-medium text-foreground">{!notification.isRead && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}{notification.title}</p><p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{notification.message}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(notification.createdAt)}</p></div>
                  return notification.link ? <Link key={notification.id} href={safeNotificationLink(notification.link, true)} onClick={() => { if (!notification.isRead && !marking) void read([notification]); setOpen(false) }} className="block focus-visible:outline-2 focus-visible:outline-ring">{content}</Link> : <div key={notification.id}>{content}</div>
                })}
              </>
            )}
          </div>
          <div className="shrink-0 space-y-1 border-t border-border px-4 py-2">
            {!sessionExpired && data.docs.some((notification) => !notification.isRead) && <button type="button" disabled={marking} onClick={() => void read(data.docs)} className="min-h-11 text-sm font-medium text-primary disabled:opacity-50">{marking ? 'Сохраняем…' : 'Прочитать показанные'}</button>}
            <Link href="/notifications" onClick={() => setOpen(false)} className="flex min-h-11 items-center text-sm font-medium text-primary">Все уведомления</Link>
            <Link href="/settings/notifications" onClick={() => setOpen(false)} className="flex min-h-11 items-center text-xs text-muted-foreground">Настройки уведомлений</Link>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, Check, ChevronLeft, ChevronRight, RefreshCw, Settings } from 'lucide-react'
import { useAsyncData } from '@/hooks/use-async-data'
import { cn, formatDate } from '@/lib/utils'
import { safeNotificationLink } from '@/lib/notification-policy'
import { markNotificationsRead, requestNotificationPage, requestUnreadNotificationCount, type NotificationDoc, type NotificationPage } from '@/components/layout/notifications-api'

type InboxData = { result: NotificationPage; unread: number | null; unreadOnly: boolean | null }
const EMPTY: InboxData = { result: { docs: [], page: 1, totalPages: 1, totalDocs: 0 }, unread: null, unreadOnly: null }

export function NotificationInbox({ userId }: { userId: number }) {
  const [query, setQuery] = useState({ page: 1, unreadOnly: false })
  const [expired, setExpired] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [mutationError, setMutationError] = useState('')
  const [marking, setMarking] = useState(false)

  const load = useCallback(async (signal: AbortSignal): Promise<InboxData> => {
    try {
      const requests = await Promise.allSettled([requestNotificationPage(signal, query.page, userId, query.unreadOnly), requestUnreadNotificationCount(signal, userId)])
      if (signal.aborted) return EMPTY
      if (requests.some((result) => result.status === 'fulfilled' && result.value.status === 'unauthorized')) {
        setExpired(true)
        return { ...EMPTY, unread: 0 }
      }
      const [listResult, countResult] = requests
      if (listResult.status === 'rejected') throw listResult.reason
      if (countResult.status === 'rejected') throw countResult.reason
      if (listResult.value.status !== 'ok' || countResult.value.status !== 'ok') return EMPTY
      setLoadError('')
      const totalPages = listResult.value.result.totalPages
      if (query.page > totalPages) setQuery((previous) => ({ ...previous, page: totalPages }))
      return { result: listResult.value.result, unread: countResult.value.count, unreadOnly: query.unreadOnly }
    } catch (error) {
      if (!signal.aborted) setLoadError('Не удалось загрузить уведомления. Проверьте подключение и попробуйте ещё раз.')
      throw error
    }
  }, [query, userId])

  const { data, loading, setData, reload } = useAsyncData<InboxData>(load, EMPTY)
  const awaitingPage = data.result.page !== query.page || data.unreadOnly !== query.unreadOnly

  useEffect(() => {
    if (data.unread !== null) window.dispatchEvent(new CustomEvent('lms:notification-count', { detail: data.unread }))
  }, [data.unread])

  useEffect(() => {
    if (expired) return
    window.addEventListener('lms:notification', reload)
    const timer = setInterval(() => { if (document.visibilityState === 'visible') reload() }, 60_000)
    return () => { window.removeEventListener('lms:notification', reload); clearInterval(timer) }
  }, [reload, expired])

  async function read(notifications: NotificationDoc[]) {
    setMarking(true)
    setMutationError('')
    const result = await markNotificationsRead(notifications)
    if (result.unauthorized) {
      setExpired(true)
      setData({ ...EMPTY, unread: 0 })
    } else {
      setData((previous) => ({ ...previous,
        result: { ...previous.result, docs: previous.result.docs.map((notification) => result.readIds.has(String(notification.id)) ? { ...notification, isRead: true } : notification) },
        unread: previous.unread === null ? null : Math.max(0, previous.unread - result.readIds.size),
      }))
      if (result.failed) setMutationError('Не все изменения сохранились. Непрочитанные уведомления можно отметить ещё раз.')
      if (result.readIds.size) window.dispatchEvent(new Event('lms:notification'))
    }
    setMarking(false)
  }

  if (expired) return <div role="alert" className="rounded-xl border border-border bg-card p-5 text-sm"><p>Сессия истекла. Войдите снова, чтобы открыть свои уведомления.</p><Link href="/login?redirect=%2Fnotifications" className="mt-3 inline-flex min-h-11 items-center font-medium text-primary underline">Войти</Link></div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Фильтр уведомлений" className="flex gap-2">
          {[{ label: 'Все', unreadOnly: false }, { label: 'Непрочитанные', unreadOnly: true }].map(({ label, unreadOnly }) => <button key={label} type="button" aria-pressed={query.unreadOnly === unreadOnly} disabled={marking} onClick={() => { setLoadError(''); setQuery({ page: 1, unreadOnly }) }} className={cn('min-h-11 rounded-full border px-3 text-sm font-medium disabled:opacity-50', query.unreadOnly === unreadOnly ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>{label}</button>)}
        </div>
        <button type="button" onClick={reload} disabled={marking} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50"><RefreshCw aria-hidden="true" className="h-4 w-4" />Обновить</button>
      </div>
      <Link href="/settings/notifications" className="inline-flex min-h-11 max-w-full items-center gap-2 text-sm text-primary hover:underline"><Settings aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">Настройки уведомлений</span></Link>
      {loadError && <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"><p>{loadError}</p><button type="button" onClick={reload} className="mt-2 min-h-11 font-medium text-primary underline">Повторить загрузку</button></div>}
      {mutationError && <p role="alert" className="text-sm text-destructive">{mutationError}</p>}
      {(loading || awaitingPage && !loadError) && <p role="status" className="py-8 text-center text-muted-foreground">Загружаем уведомления…</p>}
      {!loading && !awaitingPage && data.result.docs.length === 0 && !loadError && <div className="space-y-3 rounded-xl border border-border bg-card p-8 text-center"><Bell aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground" /><p className="font-medium">{query.unreadOnly ? 'Все уведомления прочитаны' : 'Уведомлений пока нет'}</p><p className="text-sm text-muted-foreground">Здесь появятся ответы ментора, новые достижения и напоминания об обучении.</p></div>}
      {!awaitingPage && data.result.docs.length > 0 && <>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-muted-foreground">Непрочитанных: {data.unread ?? 0}</p>
          {data.result.docs.some((notification) => !notification.isRead) && <button type="button" disabled={marking} onClick={() => void read(data.result.docs)} className="min-h-11 font-medium text-primary disabled:opacity-50">{marking ? 'Сохраняем…' : 'Прочитать эту страницу'}</button>}
        </div>
        <ul aria-label="Уведомления" className="space-y-3">
          {data.result.docs.map((notification) => <li key={notification.id} className={cn('min-w-0 space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5', !notification.isRead && 'border-l-4 border-l-primary')}>
            <div className="space-y-2"><h2 className="break-words text-base font-semibold leading-6">{notification.title}</h2><p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{notification.message}</p></div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="text-xs text-muted-foreground"><time dateTime={notification.createdAt}>{formatDate(notification.createdAt)}</time><span className="ml-3">{notification.isRead ? 'Прочитано' : 'Не прочитано'}</span></p>
              <div className="flex flex-wrap items-center gap-3">
                {!notification.isRead && <button type="button" disabled={marking} onClick={() => void read([notification])} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary disabled:opacity-50"><Check aria-hidden="true" className="h-4 w-4" />Прочитано<span className="sr-only">: {notification.title}</span></button>}
                {notification.link && <Link href={safeNotificationLink(notification.link, true)} aria-label={`Открыть: ${notification.title}`} onClick={() => { if (!notification.isRead && !marking) void read([notification]) }} className="inline-flex min-h-11 items-center text-sm font-medium text-primary">Открыть</Link>}
              </div>
            </div>
          </li>)}
        </ul>
      </>}
      {data.result.totalPages > 1 && <nav aria-label="Страницы уведомлений" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <button type="button" disabled={query.page <= 1 || marking || awaitingPage && !loadError} onClick={() => { setLoadError(''); setQuery((previous) => ({ ...previous, page: previous.page - 1 })) }} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm disabled:opacity-40"><ChevronLeft aria-hidden="true" className="h-4 w-4" />Назад</button>
        <span className="text-xs text-muted-foreground" aria-live="polite">Страница {query.page} из {data.result.totalPages}</span>
        <button type="button" disabled={query.page >= data.result.totalPages || marking || awaitingPage && !loadError} onClick={() => { setLoadError(''); setQuery((previous) => ({ ...previous, page: previous.page + 1 })) }} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm disabled:opacity-40">Дальше<ChevronRight aria-hidden="true" className="h-4 w-4" /></button>
      </nav>}
    </div>
  )
}

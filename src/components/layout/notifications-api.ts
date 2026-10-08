export type NotificationDoc = {
  id: string | number
  title: string
  message: string
  type: string
  link?: string | null
  isRead: boolean
  createdAt: string
}

export type NotificationsResponse =
  | { status: 'ok'; docs: NotificationDoc[] }
  /** Сессии нет или она истекла. Повторять запрос бессмысленно до нового входа. */
  | { status: 'unauthorized' }

const ENDPOINT = '/api/notifications?sort=-createdAt&limit=10&depth=0'

export async function requestNotifications(
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  userId?: number,
): Promise<NotificationsResponse> {
  const res = await fetchImpl(`${ENDPOINT}${userId === undefined ? '' : `&where[user][equals]=${userId}`}`, { credentials: 'include', signal })

  if (res.status === 401 || res.status === 403) return { status: 'unauthorized' }

  // Тело ошибки — не список уведомлений. Разобрать его молча значит показать
  // пустой колокольчик вместо сбоя и не узнать, что запрос не прошёл.
  if (!res.ok) throw new Error(`Уведомления не загрузились: HTTP ${res.status}`)

  const data = (await res.json()) as { docs?: NotificationDoc[] }
  if (!Array.isArray(data.docs ?? [])) throw new Error('Некорректный список уведомлений')

  return { status: 'ok', docs: data.docs ?? [] }
}

export type NotificationPage = {
  docs: NotificationDoc[]
  page: number
  totalPages: number
  totalDocs: number
}

export async function requestNotificationPage(signal: AbortSignal, page: number, userId: number, unreadOnly = false): Promise<{ status: 'ok'; result: NotificationPage } | { status: 'unauthorized' }> {
  const res = await fetch(`/api/notifications?sort=-createdAt&limit=20&depth=0&page=${page}&where[user][equals]=${userId}${unreadOnly ? '&where[isRead][equals]=false' : ''}`, { credentials: 'include', signal })
  if (res.status === 401 || res.status === 403) return { status: 'unauthorized' }
  if (!res.ok) throw new Error(`Уведомления не загрузились: HTTP ${res.status}`)
  const data = await res.json() as NotificationPage
  if (!Array.isArray(data.docs) || !Number.isSafeInteger(data.totalPages) || !Number.isSafeInteger(data.totalDocs) || data.totalPages < 0 || data.totalDocs < 0) throw new Error('Некорректный список уведомлений')
  return { status: 'ok', result: { ...data, page, totalPages: Math.max(1, data.totalPages) } }
}

export async function requestUnreadNotificationCount(signal: AbortSignal, userId?: number): Promise<{ status: 'ok'; count: number } | { status: 'unauthorized' }> {
  const res = await fetch(`/api/notifications/count?where[isRead][equals]=false${userId === undefined ? '' : `&where[user][equals]=${userId}`}`, { credentials: 'include', signal })
  if (res.status === 401 || res.status === 403) return { status: 'unauthorized' }
  if (!res.ok) throw new Error(`Счётчик уведомлений не загрузился: HTTP ${res.status}`)
  const data = await res.json() as { totalDocs?: number }
  if (!Number.isSafeInteger(data.totalDocs) || typeof data.totalDocs !== 'number' || data.totalDocs < 0) throw new Error('Некорректный счётчик уведомлений')
  return { status: 'ok', count: data.totalDocs }
}

export async function markNotificationsRead(notifications: readonly NotificationDoc[]): Promise<{ readIds: Set<string>; failed: number; unauthorized: boolean }> {
  const results = await Promise.allSettled(notifications.filter((notification) => !notification.isRead).map(async (notification) => {
    const response = await fetch(`/api/notifications/${encodeURIComponent(String(notification.id))}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ isRead: true }), signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 401 || response.status === 403) return { id: String(notification.id), status: 'unauthorized' } as const
    if (!response.ok) throw new Error('Не удалось отметить уведомление прочитанным')
    const result = await response.json() as { doc?: { isRead?: boolean } }
    if (result.doc?.isRead !== true) throw new Error('Сервер не подтвердил прочтение уведомления')
    return { id: String(notification.id), status: 'ok' } as const
  }))
  const readIds = new Set<string>()
  let failed = 0
  let unauthorized = false
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.status === 'ok') readIds.add(result.value.id)
    else {
      failed += 1
      if (result.status === 'fulfilled') unauthorized = true
    }
  }
  return { readIds, failed, unauthorized }
}

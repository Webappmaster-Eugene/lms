export type NotificationDoc = {
  id: string
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
): Promise<NotificationsResponse> {
  const res = await fetchImpl(ENDPOINT, { credentials: 'include', signal })

  if (res.status === 401 || res.status === 403) return { status: 'unauthorized' }

  // Тело ошибки — не список уведомлений. Разобрать его молча значит показать
  // пустой колокольчик вместо сбоя и не узнать, что запрос не прошёл.
  if (!res.ok) throw new Error(`Уведомления не загрузились: HTTP ${res.status}`)

  const data = (await res.json()) as { docs?: NotificationDoc[] }

  return { status: 'ok', docs: data.docs ?? [] }
}

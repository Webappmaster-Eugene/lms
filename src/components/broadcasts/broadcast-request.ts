export async function broadcastRequest(path: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown = {}): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Тестовое письмо ждёт ответа SMTP-сервера, а у него свой таймаут 20 секунд.
      signal: AbortSignal.timeout(45_000),
    })
  } catch {
    throw new Error('Нет соединения с сервером. Проверьте сеть и повторите действие')
  }
  const data: unknown = await response.json().catch(() => null)
  const record = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {}
  if (!response.ok) {
    const message = typeof record.error === 'string' && record.error.length <= 400 ? record.error : null
    throw new Error(message ?? 'Не удалось выполнить действие. Попробуйте ещё раз')
  }
  return record
}

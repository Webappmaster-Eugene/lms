/**
 * Публичные формы без входа (заявка на буткемп, входное задание) принимают запросы
 * только со своих страниц: чужой сайт не отправит их руками посетителя.
 */
export function foreignPage(headers: Headers): boolean {
  if (['cross-site', 'same-site'].includes(headers.get('sec-fetch-site') ?? '')) return true
  const origin = headers.get('origin')
  if (!origin) return false
  const host = headers.get('x-forwarded-host') ?? headers.get('host')
  try {
    return new URL(origin).host !== host
  } catch {
    return true
  }
}

export const REMINDER_DAYS = [3, 7, 14] as const
const forbiddenLinkCharacters = (value: string) => [...value].some((character) => character === '\\' || character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)

export function safeNotificationLink(value: unknown, allowAdmin = false): string {
  if (typeof value !== 'string' || value.length > 500 || !value.startsWith('/') || value.startsWith('//') || forbiddenLinkCharacters(value)) return '/notifications'
  try {
    const decoded = decodeURIComponent(value)
    if (decoded.startsWith('//') || forbiddenLinkCharacters(decoded)) return '/notifications'
    const url = new URL(value, 'https://lms.invalid')
    const pathname = new URL(decoded, 'https://lms.invalid').pathname
    if (url.origin !== 'https://lms.invalid' || /^\/api(?:\/|$)/.test(pathname) || !allowAdmin && /^\/admin(?:\/|$)/.test(pathname)) return '/notifications'
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return '/notifications' }
}

export function validTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80) return false
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true } catch { return false }
}

export function dueReminderStage(input: { lastLearningAt: string; lastReminderAt?: string | null; reminderStage: number; timezone: string; reminderHour: number }, now = new Date()): number | null {
  if (!validTimezone(input.timezone) || !Number.isInteger(input.reminderHour) || input.reminderHour < 8 || input.reminderHour > 21) return null
  const hour = Number(new Intl.DateTimeFormat('en', { timeZone: input.timezone, hour: 'numeric', hourCycle: 'h23' }).format(now))
  if (hour !== input.reminderHour) return null
  const stage = Math.max(0, Math.min(3, input.reminderStage))
  const threshold = REMINDER_DAYS[stage]
  if (threshold === undefined) return null
  const elapsed = now.getTime() - new Date(input.lastLearningAt).getTime()
  if (!Number.isFinite(elapsed) || elapsed < threshold * 86_400_000) return null
  // Long absences advance one stage per three days rather than delivering all missed reminders.
  if (input.lastReminderAt && now.getTime() - new Date(input.lastReminderAt).getTime() < 3 * 86_400_000) return null
  return stage + 1
}

export function pushEndpoint(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = new URL(value)
    const browserProvider = url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com' || url.hostname === 'web.push.apple.com' || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)
    return url.protocol === 'https:' && browserProvider && !url.username && !url.password && !url.hash && (!url.port || url.port === '443') && url.pathname.length > 1 ? url : null
  } catch { return null }
}

export function deliveryOutcome(status: number, attempt: number): { status: 'sent' | 'failed' | 'pending'; removeSubscription: boolean; retryDelay: number } {
  if (status >= 200 && status < 300) return { status: 'sent', removeSubscription: false, retryDelay: 0 }
  if (status === 404 || status === 410) return { status: 'failed', removeSubscription: true, retryDelay: 0 }
  const retryable = status === 0 || status === 429 || status >= 500
  return { status: retryable && attempt < 5 ? 'pending' : 'failed', removeSubscription: false, retryDelay: Math.min(86_400_000, 60_000 * 2 ** Math.max(0, attempt - 1)) }
}

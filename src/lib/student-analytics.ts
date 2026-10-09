export const studentEventTypes = ['login', 'logout', 'page_view', 'lesson_view', 'lesson_completed', 'trainer_completed', 'achievement_unlocked', 'certificate_issued'] as const
export type StudentEventType = typeof studentEventTypes[number]
export type AnalyticsTarget = { id: number; title: string; href: string | null }
export type StudentSessionDTO = {
  id: number | null
  device: string
  browser: string
  os: string
  firstSeenAt: string
  lastSeenAt: string | null
  expiresAt: string
  status: 'online' | 'active' | 'expired' | 'revoked'
  ip: string | null
  geo: { countryCode: string | null; country: string | null; region: string | null; city: string | null; source: 'local-mmdb' | 'unknown'; approximate: true }
  timezone: string | null
  standalone: boolean | null
  path: string | null
  course: AnalyticsTarget | null
  lesson: AnalyticsTarget | null
}
export type StudentEventDTO = {
  id: number
  type: StudentEventType
  source: 'server' | 'observed'
  at: string
  course: AnalyticsTarget | null
  lesson: AnalyticsTarget | null
  taskId: number | null
  achievementId: number | null
  certificateId: number | null
  title: string | null
  path: string | null
}
export type StudentAnalyticsSnapshot = {
  student: { id: number; title: string; email: string; isActive: boolean; role?: 'admin' | 'student' }
  activeSessionCount: number
  onlineSessionCount: number
  lastActiveAt: string | null
  lastLearningAt: string | null
  resume: { course: AnalyticsTarget | null; lesson: AnalyticsTarget; videoId: string | null; seconds: number | null; lastViewedAt: string } | null
  totals: { completedLessons: number; verifiedTrainerTasks: number; points: number; achievements: number; certificates: number }
  performance?: { windowDays: 30; metrics: { name: 'LCP' | 'INP' | 'CLS'; sampleCount: number; p75: number | null }[] }
  sessions: { docs: StudentSessionDTO[]; page: number; hasNextPage: boolean; totalDocs: number }
  events: { docs: StudentEventDTO[]; page: number; hasNextPage: boolean; totalDocs: number }
}
export class StudentAnalyticsError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export function activityInput(value: unknown): { path: string; timezone: string | null; standalone: boolean | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StudentAnalyticsError('Некорректная активность')
  const input = value as Record<string, unknown>
  if (typeof input.path !== 'string' || input.path.length > 240 || !/^\/[a-zA-Z0-9_\-/]*$/.test(input.path) || input.path.includes('//')) throw new StudentAnalyticsError('Некорректная страница')
  let timezone: string | null = null
  if (input.timezone !== undefined) {
    if (typeof input.timezone !== 'string' || input.timezone.length > 80) throw new StudentAnalyticsError('Некорректный часовой пояс')
    try { timezone = new Intl.DateTimeFormat('en', { timeZone: input.timezone }).resolvedOptions().timeZone } catch { throw new StudentAnalyticsError('Некорректный часовой пояс') }
  }
  if (input.standalone !== undefined && typeof input.standalone !== 'boolean') throw new StudentAnalyticsError('Некорректный режим приложения')
  const path = input.path.startsWith('/trainer/interview/') ? '/trainer/interview' : input.path.startsWith('/admin/') ? '/admin' : input.path
  return { path, timezone, standalone: typeof input.standalone === 'boolean' ? input.standalone : null }
}

/** Deliberately coarse labels: no fingerprint, raw user-agent or inferred physical device model. */
export function deviceLabels(raw: string | null): { device: string; browser: string; os: string } {
  const ua = (raw ?? '').slice(0, 512)
  const device = !ua ? 'Не определено' : /bot|crawler|spider/i.test(ua) ? 'Робот' : /ipad|tablet/i.test(ua) ? 'Планшет' : /iphone|mobile|android/i.test(ua) ? 'Телефон' : 'Компьютер'
  const browser = /YaBrowser/i.test(ua) ? 'Яндекс Браузер' : /Edg/i.test(ua) ? 'Edge' : /OPR|Opera/i.test(ua) ? 'Opera' : /Firefox|FxiOS/i.test(ua) ? 'Firefox' : /Chrome|CriOS/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'Не определено'
  const os = /iphone|ipad/i.test(ua) ? 'iOS' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /macintosh|mac os/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : 'Не определено'
  return { device, browser, os }
}

export function sessionStatus(active: boolean, expiresAt: string, lastSeenAt: string | null, now = Date.now()): StudentSessionDTO['status'] {
  if (Date.parse(expiresAt) <= now) return 'expired'
  if (!active) return 'revoked'
  return lastSeenAt && Date.parse(lastSeenAt) >= now - 5 * 60_000 ? 'online' : 'active'
}

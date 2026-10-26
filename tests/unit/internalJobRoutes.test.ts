import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { validInterviewJobKey } from '@/server/interviews/job-auth'
import { validNotificationJobKey } from '@/server/notification-job-auth'

/**
 * Служебные ключи планировщиков и маршрут /api/internal/notifications/run.
 * Ключ — HMAC от PAYLOAD_SECRET с назначением задачи: ключ одной задачи не
 * открывает другую. Сами задачи подменены — проверяется, что маршрут
 * пускает только по ключу и что сбой одной задачи не останавливает другую.
 */

const SECRET = 'unit-payload-secret-for-job-keys'
const keyFor = (purpose: string, secret = SECRET) => createHmac('sha256', secret).update(purpose).digest('hex')
const NOTIFICATIONS_KEY = keyFor('lms-notifications-scheduler-v1')
const INTERVIEWS_KEY = keyFor('lms-interviews-scheduler-v1')

const jobs = vi.hoisted(() => ({
  getPayload: vi.fn(),
  runNotificationJobs: vi.fn(),
  cleanupStudentAnalytics: vi.fn(),
  cleanupWebVitals: vi.fn(),
  runEmailBroadcastJobs: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/payload', () => ({ getPayload: jobs.getPayload }))
vi.mock('@/server/notification-service', () => ({ runNotificationJobs: jobs.runNotificationJobs }))
vi.mock('@/server/student-analytics', () => ({ cleanupStudentAnalytics: jobs.cleanupStudentAnalytics }))
vi.mock('@/server/web-vitals', () => ({ cleanupWebVitals: jobs.cleanupWebVitals }))
vi.mock('@/server/broadcasts/service', () => ({ runEmailBroadcastJobs: jobs.runEmailBroadcastJobs }))
vi.mock('@/lib/telemetry', () => ({ logger: jobs.logger }))

const { POST } = await import('@/app/api/internal/notifications/run/route')

const payload = { marker: 'payload' }
const idleEmails = { skipped: false, sent: 0, failed: 0, retried: 0, skippedRecipients: 0, completed: 0 }
const call = (key?: string | null) => POST(new Request('http://lms.test/api/internal/notifications/run', { method: 'POST', headers: key ? { 'x-lms-job-key': key } : {} }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PAYLOAD_SECRET', SECRET)
  jobs.getPayload.mockResolvedValue(payload)
  jobs.runNotificationJobs.mockResolvedValue({ skipped: false, reminders: 2, deliveries: 5 })
  jobs.runEmailBroadcastJobs.mockResolvedValue(idleEmails)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('служебные ключи планировщиков', () => {
  it.each([
    ['уведомлений', validNotificationJobKey, NOTIFICATIONS_KEY, INTERVIEWS_KEY],
    ['собеседований', validInterviewJobKey, INTERVIEWS_KEY, NOTIFICATIONS_KEY],
  ])('ключ %s принимается только свой и только при заданном PAYLOAD_SECRET', (_, valid, own, foreign) => {
    expect(valid(own)).toBe(true)
    expect(valid(foreign)).toBe(false)
    expect(valid(null)).toBe(false)
    expect(valid('')).toBe(false)
    expect(valid(own.toUpperCase())).toBe(false)
    expect(valid(own.slice(0, 63))).toBe(false)
    expect(valid(`${own}0`)).toBe(false)
    expect(valid(`${own.slice(0, 63)}${own[63] === '0' ? '1' : '0'}`)).toBe(false)
    expect(valid(keyFor('lms-notifications-scheduler-v1', 'other-secret'))).toBe(false)
    vi.stubEnv('PAYLOAD_SECRET', '')
    expect(valid(own)).toBe(false)
    expect(valid(keyFor(own === NOTIFICATIONS_KEY ? 'lms-notifications-scheduler-v1' : 'lms-interviews-scheduler-v1', ''))).toBe(false)
  })
})

describe('POST /api/internal/notifications/run: доступ', () => {
  it.each([
    ['без ключа', null],
    ['с чужим ключом', 'f'.repeat(64)],
    ['с ключом задачи собеседований', INTERVIEWS_KEY],
  ])('%s — 403 без обращения к базе и задачам', async (_, key) => {
    const response = await call(key)
    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'Доступ запрещён' })
    expect(jobs.getPayload).not.toHaveBeenCalled()
    expect(jobs.runNotificationJobs).not.toHaveBeenCalled()
    expect(jobs.runEmailBroadcastJobs).not.toHaveBeenCalled()
  })

  it('с верным ключом запускает напоминания, очистку и рассылки и возвращает итоги', async () => {
    jobs.runEmailBroadcastJobs.mockResolvedValue({ ...idleEmails, sent: 3 })
    const response = await call(NOTIFICATIONS_KEY)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ skipped: false, reminders: 2, deliveries: 5, emails: { ...idleEmails, sent: 3 } })
    expect(jobs.runNotificationJobs).toHaveBeenCalledWith(payload)
    expect(jobs.cleanupStudentAnalytics).toHaveBeenCalledWith(payload)
    expect(jobs.cleanupWebVitals).toHaveBeenCalledWith(payload)
    expect(jobs.logger.info).toHaveBeenCalledWith('Email broadcast job completed', expect.objectContaining({ 'email.sent': 3 }))
  })

  it('если напоминания уже выполняет другой экземпляр, очистка не запускается, а рассылки — да', async () => {
    jobs.runNotificationJobs.mockResolvedValue({ skipped: true, reminders: 0, deliveries: 0 })
    const response = await call(NOTIFICATIONS_KEY)
    expect(response.status).toBe(200)
    expect(jobs.cleanupStudentAnalytics).not.toHaveBeenCalled()
    expect(jobs.cleanupWebVitals).not.toHaveBeenCalled()
    expect(jobs.runEmailBroadcastJobs).toHaveBeenCalledTimes(1)
    expect(jobs.logger.info).not.toHaveBeenCalledWith('Email broadcast job completed', expect.anything())
  })
})

describe('POST /api/internal/notifications/run: сбои', () => {
  it('недоступная база — 500 без запуска задач', async () => {
    jobs.getPayload.mockRejectedValue(new Error('connect ECONNREFUSED'))
    const response = await call(NOTIFICATIONS_KEY)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Задача уведомлений не выполнена' })
    expect(jobs.runNotificationJobs).not.toHaveBeenCalled()
    expect(jobs.runEmailBroadcastJobs).not.toHaveBeenCalled()
  })

  it('сбой напоминаний не останавливает рассылки, но планировщик видит 500', async () => {
    jobs.runNotificationJobs.mockRejectedValue(new Error('deadlock'))
    jobs.runEmailBroadcastJobs.mockResolvedValue({ ...idleEmails, completed: 1 })
    const response = await call(NOTIFICATIONS_KEY)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Задача уведомлений не выполнена', emails: { ...idleEmails, completed: 1 } })
    expect(jobs.runEmailBroadcastJobs).toHaveBeenCalledTimes(1)
    expect(jobs.logger.error).toHaveBeenCalledWith('Notification scheduler failed', expect.any(Error))
  })

  it('сбой рассылок не отменяет итог напоминаний', async () => {
    jobs.runEmailBroadcastJobs.mockRejectedValue(new Error('smtp down'))
    const response = await call(NOTIFICATIONS_KEY)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ skipped: false, reminders: 2, deliveries: 5, emails: { error: 'Задача рассылок не выполнена' } })
    expect(jobs.logger.error).toHaveBeenCalledWith('Email broadcast job failed', expect.any(Error))
  })

  it('рассылкам достаётся не больше 60 с и только время, не потраченное напоминаниями из бюджета 110 с', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const started = new Date('2026-10-26T10:00:00Z').getTime()
    vi.setSystemTime(started)
    await call(NOTIFICATIONS_KEY)
    expect(jobs.runEmailBroadcastJobs).toHaveBeenLastCalledWith(payload, { deadline: started + 60_000 })
    vi.setSystemTime(started)
    jobs.runNotificationJobs.mockImplementation(async () => {
      vi.setSystemTime(started + 80_000)
      return { skipped: false, reminders: 0, deliveries: 0 }
    })
    await call(NOTIFICATIONS_KEY)
    expect(jobs.runEmailBroadcastJobs).toHaveBeenLastCalledWith(payload, { deadline: started + 110_000 })
  })
})

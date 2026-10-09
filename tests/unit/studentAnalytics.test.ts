import { describe, expect, it } from 'vitest'
import { activityInput, deviceLabels, sessionStatus } from '@/lib/student-analytics'

describe('bounded observational activity', () => {
  it('accepts known pathname data without query strings and rejects arbitrary payloads', () => {
    expect(activityInput({ path: '/lessons/node-intro', timezone: 'Europe/Moscow', standalone: true })).toEqual({ path: '/lessons/node-intro', timezone: 'Europe/Moscow', standalone: true })
    for (const path of ['https://evil.example/', '/profile?token=secret', '/profile#fragment', '//evil', '/../../users', '/a'.repeat(200)]) expect(() => activityInput({ path })).toThrow()
    expect(() => activityInput({ path: '/profile', timezone: 'Fake/Zone' })).toThrow()
    expect(() => activityInput({ path: '/profile', standalone: 'true' })).toThrow()
    expect(() => activityInput([])).toThrow()
  })
  it('never retains interview access tokens as pathname telemetry', () => {
    expect(activityInput({ path: '/trainer/interview/private-room-token' }).path).toBe('/trainer/interview')
    expect(activityInput({ path: '/admin/collections/users/34' }).path).toBe('/admin')
    expect(activityInput({ path: '/trainer/node/task' }).path).toBe('/trainer/node/task')
  })
  it('keeps coarse device labels and no raw fingerprint', () => {
    expect(deviceLabels('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17 Safari/605.1')).toEqual({ device: 'Телефон', browser: 'Safari', os: 'iOS' })
    expect(deviceLabels('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile')).toEqual({ device: 'Телефон', browser: 'Chrome', os: 'Android' })
    expect(deviceLabels('Windows Chrome/120 YaBrowser/24')).toEqual({ device: 'Компьютер', browser: 'Яндекс Браузер', os: 'Windows' })
    expect(deviceLabels(null)).toEqual({ device: 'Не определено', browser: 'Не определено', os: 'Не определено' })
  })
  it('separates recent observation from a valid long-lived authorization', () => {
    const now = Date.parse('2026-10-08T12:00:00Z')
    const expires = new Date(now + 86_400_000).toISOString()
    expect(sessionStatus(true, expires, new Date(now - 60_000).toISOString(), now)).toBe('online')
    expect(sessionStatus(true, expires, new Date(now - 6 * 60_000).toISOString(), now)).toBe('active')
    expect(sessionStatus(false, expires, new Date(now).toISOString(), now)).toBe('revoked')
    expect(sessionStatus(true, new Date(now - 1).toISOString(), new Date(now).toISOString(), now)).toBe('expired')
    expect(sessionStatus(true, expires, null, now)).toBe('active')
  })
})

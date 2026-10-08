import { describe, expect, it } from 'vitest'
import { deliveryOutcome, dueReminderStage, pushEndpoint, safeNotificationLink, validTimezone } from '@/lib/notification-policy'

describe('notification privacy and reminder policy', () => {
  const baseline = { lastLearningAt: '2026-10-01T15:00:00Z', reminderStage: 0, timezone: 'Europe/Moscow', reminderHour: 18 }
  it('uses learning inactivity, learner timezone and three spaced stages', () => {
    expect(dueReminderStage(baseline, new Date('2026-10-04T14:00:00Z'))).toBeNull()
    expect(dueReminderStage(baseline, new Date('2026-10-04T15:00:00Z'))).toBe(1)
    expect(dueReminderStage({ ...baseline, reminderStage: 1, lastReminderAt: '2026-10-04T15:00:00Z' }, new Date('2026-10-08T15:00:00Z'))).toBe(2)
    expect(dueReminderStage({ ...baseline, reminderStage: 2, lastReminderAt: '2026-10-08T15:00:00Z' }, new Date('2026-10-15T15:00:00Z'))).toBe(3)
    expect(dueReminderStage({ ...baseline, reminderStage: 3 }, new Date('2026-12-15T15:00:00Z'))).toBeNull()
  })
  it('does not flood missed reminders or notify at night, after a study return or in unknown zones', () => {
    expect(dueReminderStage({ ...baseline, lastReminderAt: '2026-10-14T15:00:00Z' }, new Date('2026-10-15T15:00:00Z'))).toBeNull()
    expect(dueReminderStage({ ...baseline, reminderHour: 23 }, new Date('2026-10-15T20:00:00Z'))).toBeNull()
    expect(dueReminderStage({ ...baseline, timezone: 'Unknown/Zone' }, new Date('2026-10-15T15:00:00Z'))).toBeNull()
    expect(dueReminderStage({ ...baseline, lastLearningAt: '2026-10-15T14:00:00Z' }, new Date('2026-10-15T15:00:00Z'))).toBeNull()
    expect(validTimezone('America/New_York')).toBe(true)
  })
  it.each(['https://evil.example', '//evil.example', '/%2Fexample', '/\\evil', '/api/users/logout', '/admin', '/profile\n'])('restricts notification actions %s to safe student pages', (path) => {
    expect(safeNotificationLink(path)).toBe('/notifications')
  })
  it('keeps safe internal deep links', () => {
    expect(safeNotificationLink('/lessons/example#video-1')).toBe('/lessons/example#video-1')
    expect(safeNotificationLink('/certificates')).toBe('/certificates')
    expect(safeNotificationLink('/admin/questions', true)).toBe('/admin/questions')
    expect(safeNotificationLink('/%61pi/users/logout', true)).toBe('/notifications')
  })
  it.each(['http://fcm.googleapis.com/send/x', 'https://fcm.googleapis.com.evil.test/send/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://user@web.push.apple.com/x', 'https://fcm.googleapis.com:444/x', 'https://web.push.apple.com/x#secret'])('rejects unsafe push endpoints %s', (value) => {
    expect(pushEndpoint(value)).toBeNull()
  })
  it.each(['https://fcm.googleapis.com/fcm/send/example', 'https://updates.push.services.mozilla.com/wpush/v2/example', 'https://web.push.apple.com/example', 'https://wns2-par02p.notify.windows.com/w/?token=example'])('accepts browser provider %s', (value) => {
    expect(pushEndpoint(value)).not.toBeNull()
  })
  it('removes gone subscriptions and bounds retry to transient failures', () => {
    expect(deliveryOutcome(201, 1).status).toBe('sent')
    expect(deliveryOutcome(410, 1).removeSubscription).toBe(true)
    expect(deliveryOutcome(404, 1).removeSubscription).toBe(true)
    expect(deliveryOutcome(302, 1).status).toBe('failed')
    expect(deliveryOutcome(403, 1).status).toBe('failed')
    expect(deliveryOutcome(429, 4).status).toBe('pending')
    expect(deliveryOutcome(503, 5).status).toBe('failed')
    expect(deliveryOutcome(0, 2).retryDelay).toBe(120_000)
  })
})

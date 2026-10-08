import { createHmac } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

const secret = process.env.PAYLOAD_SECRET
if (!secret) throw new Error('Notification scheduler requires PAYLOAD_SECRET')
const endpoint = new URL('/api/internal/notifications/run', process.env.LMS_NOTIFICATION_APP_URL || 'http://lms-mentor-app:3000')
const key = createHmac('sha256', secret).update('lms-notifications-scheduler-v1').digest('hex')
let stopped = false
let failures = 0
process.on('SIGTERM', () => { stopped = true })
process.on('SIGINT', () => { stopped = true })

while (!stopped) {
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'x-lms-job-key': key }, redirect: 'error', signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error('Notification job HTTP failure')
    const result = await response.json()
    process.stdout.write(`${JSON.stringify({ event: 'notifications_job', skipped: result.skipped === true, reminders: Number(result.reminders) || 0, deliveries: Number(result.deliveries) || 0 })}\n`)
    await writeFile('/tmp/notifications-heartbeat', String(Date.now()))
    failures = 0
  } catch {
    failures += 1
    process.stderr.write(`${JSON.stringify({ event: 'notifications_job_failed', consecutiveFailures: failures })}\n`)
  }
  await delay(Math.min(600_000, 60_000 * 2 ** Math.min(failures, 3)))
}

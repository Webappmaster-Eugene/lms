import { createHmac } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

const secret = process.env.PAYLOAD_SECRET
if (!secret) throw new Error('Interview scheduler requires PAYLOAD_SECRET')
const endpoint = new URL('/api/internal/interviews/run', process.env.LMS_INTERVIEW_APP_URL || 'http://lms-mentor-app:3000')
const key = createHmac('sha256', secret).update('lms-interviews-scheduler-v1').digest('hex')
const stop = new AbortController()
process.on('SIGTERM', () => stop.abort())
process.on('SIGINT', () => stop.abort())
let failures = 0
while (!stop.signal.aborted) {
  const heartbeat = setInterval(() => { void writeFile('/tmp/interviews-heartbeat', String(Date.now())).catch(() => {}) }, 30000)
  try {
    const result = await fetch(endpoint, { method: 'POST', headers: { 'x-lms-job-key': key }, redirect: 'error', signal: AbortSignal.any([stop.signal, AbortSignal.timeout(7200000)]) })
    if (!result.ok) throw new Error('Interview job HTTP failure')
    const body = await result.json()
    process.stdout.write(`${JSON.stringify({ event: 'interviews_job', skipped: body.skipped === true, completed: Number(body.completed) || 0, failed: Number(body.failed) || 0 })}\n`)
    await writeFile('/tmp/interviews-heartbeat', String(Date.now()))
    failures = 0
  } catch {
    failures++
    if (!stop.signal.aborted) process.stderr.write(`${JSON.stringify({ event: 'interviews_job_failed', consecutiveFailures: failures })}\n`)
  } finally { clearInterval(heartbeat) }
  try { await delay(Math.min(300000, 15000 * 2 ** Math.min(failures, 4)), undefined, { signal: stop.signal }) } catch { /* shutdown */ }
}

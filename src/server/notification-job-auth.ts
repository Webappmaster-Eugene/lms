import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

export function validNotificationJobKey(value: string | null): boolean {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret || !value || !/^[a-f0-9]{64}$/.test(value)) return false
  const expected = createHmac('sha256', secret).update('lms-notifications-scheduler-v1').digest()
  return timingSafeEqual(expected, Buffer.from(value, 'hex'))
}

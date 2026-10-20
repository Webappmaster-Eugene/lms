import type { Payload } from 'payload'

import { changeNotificationPreferences } from '@/server/notification-service'

async function userExists(payload: Payload, userId: number): Promise<boolean> {
  const found = await payload.find({ collection: 'users', where: { id: { equals: userId } }, select: { email: true }, limit: 1, depth: 0, overrideAccess: true })
  return found.docs.length > 0
}

/** Согласие на рассылки. `null` — аккаунта по ссылке больше нет. */
export async function emailBroadcastConsent(payload: Payload, userId: number): Promise<boolean | null> {
  if (!(await userExists(payload, userId))) return null
  const found = await payload.find({ collection: 'notification-preferences', where: { user: { equals: userId } }, select: { emailBroadcastsEnabled: true }, limit: 1, depth: 0, overrideAccess: true })
  return found.docs[0]?.emailBroadcastsEnabled !== false
}

export async function setEmailBroadcastConsent(payload: Payload, userId: number, enabled: boolean): Promise<boolean> {
  if (!(await userExists(payload, userId))) return false
  await changeNotificationPreferences(payload, { id: userId }, { emailBroadcastsEnabled: enabled })
  return true
}

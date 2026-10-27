import type { Payload } from 'payload'

import { logger } from '@/lib/telemetry'

/** Адрес для ответа на письма — контакт из настроек сайта; без него письмо уходит без Reply-To. */
export async function contactReplyTo(payload: Payload): Promise<string | undefined> {
  try {
    const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true })
    const address = settings.contacts?.email?.trim()
    return address && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) ? address : undefined
  } catch (error) {
    logger.warn('Email reply-to is unavailable', { 'error.type': error instanceof Error ? error.name : 'unknown' })
    return undefined
  }
}

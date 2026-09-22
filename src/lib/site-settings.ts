import { cache } from 'react'
import { getPayload } from '@/lib/payload'

export type SiteContacts = {
  telegramChannel?: string
  telegramGroup?: string
  website?: string
  email?: string
}

/**
 * Контакты из глобала CMS. `cache` — потому что подвал рендерится на каждой
 * странице и на странице контактов сложился бы второй такой же запрос за рендер.
 * Недоступная CMS отдаёт пустые контакты: подвал есть везде, ронять из-за него
 * все страницы нельзя.
 */
export const readSiteContacts = cache(async function readSiteContacts(): Promise<SiteContacts> {
  try {
    const payload = await getPayload()
    const settings = await payload.findGlobal({ slug: 'site-settings' })

    return (settings.contacts as SiteContacts) ?? {}
  } catch (error) {
    console.error('[site-settings] Не удалось прочитать контакты:', error)

    return {}
  }
})

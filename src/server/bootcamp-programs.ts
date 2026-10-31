import 'server-only'

import type { Payload, PayloadRequest } from 'payload'

import { EnrollmentInputError } from '@/lib/bootcamp-enrollment'
import { toProgramConfig, type BootcampProgramConfig } from '@/lib/bootcamp-programs'
import { logger } from '@/lib/telemetry'

export async function findProgram(payload: Payload, key: string | null | undefined, req?: PayloadRequest): Promise<BootcampProgramConfig | null> {
  if (!key) return null
  const found = await payload.find({ collection: 'bootcamp-programs', where: { key: { equals: key } }, limit: 1, depth: 0, overrideAccess: true, ...(req ? { req } : {}) })
  const doc = found.docs[0]
  return doc ? toProgramConfig(doc) : null
}

/** Для действий наставника: без программы заявки не взять цену, оферту, курс и проект GitLab. */
export async function requireProgram(payload: Payload, key: string | null | undefined, req?: PayloadRequest): Promise<BootcampProgramConfig> {
  const program = await findProgram(payload, key, req)
  if (!program) throw new EnrollmentInputError(`Программы «${key ?? 'нет'}» нет в CMS: создайте её в разделе Буткемпы, Программы буткемпов`, 409)
  return program
}

/**
 * Название программы для писем и сообщений. Уведомление не должно падать из-за
 * удалённой программы: тогда в тексте ключ, а в журнале предупреждение.
 */
export async function programNames(payload: Payload, key: string | null | undefined, req?: PayloadRequest): Promise<{ short: string, full: string }> {
  try {
    const program = await findProgram(payload, key, req)
    if (program) return { short: program.shortTitle, full: program.title }
    logger.warn('Bootcamp program not found for names', { 'program.key': key ?? '' })
  } catch (error) {
    logger.error('Bootcamp program lookup failed', error, { 'program.key': key ?? '' })
  }
  return { short: key ?? '', full: key ?? '' }
}

export type CandidateLanding = { landingUrl: string | null, program: string | null }

/**
 * Куда вести кандидата со страницы, где заявка неизвестна (404, возврат с ошибкой оплаты):
 * единственная открытая программа - на её страницу, иначе на сайт. Сбой поиска не ломает страницу.
 */
export async function candidateLanding(payload: Payload): Promise<CandidateLanding> {
  try {
    const found = await payload.find({ collection: 'bootcamp-programs', where: { isActive: { equals: true } }, limit: 2, depth: 0, overrideAccess: true })
    const [only] = found.docs
    if (only && found.docs.length === 1) return { landingUrl: only.landingUrl, program: only.shortTitle }
  } catch (error) {
    logger.error('Bootcamp programs lookup for candidate page failed', error)
  }
  return { landingUrl: null, program: null }
}

/** Открытые программы для страницы «Буткемпы» без доступа: куда записаться. Сбой поиска не ломает страницу. */
export async function openProgramLinks(payload: Payload): Promise<{ title: string, url: string }[]> {
  try {
    const found = await payload.find({ collection: 'bootcamp-programs', where: { isActive: { equals: true } }, select: { shortTitle: true, landingUrl: true }, sort: 'title', limit: 20, depth: 0, overrideAccess: true })
    return found.docs.map((doc) => ({ title: doc.shortTitle, url: doc.landingUrl }))
  } catch (error) {
    logger.error('Bootcamp programs lookup for locked page failed', error)
    return []
  }
}

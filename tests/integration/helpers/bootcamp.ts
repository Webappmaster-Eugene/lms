import type { Payload } from 'payload'

import { createCourseTree } from './payload'

const MANUALS_SLUG = 'nodejs-bootcamp-manuals'

/**
 * Программа nodejs заводится миграцией, курс методичек к ней цепляется по slug, если он уже
 * был. В тестовой базе курса нет: создаём его и выбираем в программе. Возвращает id курса.
 */
export async function ensureNodejsProgramCourse(payload: Payload): Promise<number> {
  const program = (await payload.find({ collection: 'bootcamp-programs', where: { key: { equals: 'nodejs' } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  if (!program) throw new Error('Миграция не завела программу nodejs')
  if (typeof program.manualsCourse === 'number') return program.manualsCourse
  const existing = (await payload.find({ collection: 'courses', where: { slug: { equals: MANUALS_SLUG } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  const courseId = existing?.id ?? (await payload.update({ collection: 'courses', id: (await createCourseTree(payload, { lessons: 1 })).course.id, data: { slug: MANUALS_SLUG }, overrideAccess: true })).id
  await payload.update({ collection: 'bootcamp-programs', id: program.id, data: { manualsCourse: courseId }, overrideAccess: true })
  return courseId
}

/** Вторая программа со своими условиями: проверка, что путь заявки берёт их, а не значения Node.js. */
export async function createProgram(payload: Payload, extra: Record<string, unknown> = {}) {
  const key = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return payload.create({
    collection: 'bootcamp-programs',
    data: {
      key, title: `Программа ${key}`, shortTitle: 'Python', isActive: true, landingUrl: `https://info.test/bootcamp/${key}/`,
      priceKopecks: 3_000_000, paymentDueDays: 5, offerUrl: `https://info.test/bootcamp/${key}/offer/`, offerVersion: '2026-11-01',
      receiptItemName: `Буткемп Python ${key}`, gitlabCourseProject: `python/course-${key}`, gitlabStreamGroup: `python-${key}`,
      gradingProject: `python-staff/grading-${key}`, entryTaskSet: 'rental-js', ...extra,
    },
    overrideAccess: true,
  })
}

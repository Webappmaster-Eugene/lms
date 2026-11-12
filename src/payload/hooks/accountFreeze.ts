import type { CollectionAfterChangeHook } from 'payload'

import { FREEZE_NOTICE_DAYS } from '@/lib/account-freeze'
import { automaticFreezeStart, deletePlannedFreezes, endActiveFreezes, loadFreezePeriods, planAutomaticFreeze } from '@/server/account-freeze'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

/**
 * Ученик замерзает через 6 месяцев после создания учётки, чтобы вышел на связь за продлением.
 * Тестовый ученик и администраторы не замерзают. Пишется в транзакции req, как политика доступа.
 */
export const planFreezeForNewStudent: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create' || doc.role !== 'student' || doc.isTestStudent === true) return doc
  await planAutomaticFreeze(req, doc.id, automaticFreezeStart(doc.createdAt))
  return doc
}

/** Флажок «Тестовый ученик» работает и из формы Payload, поэтому следим за ним здесь, а не в API экрана. */
export const syncTestStudentFreezes: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (operation !== 'update' || Boolean(previousDoc?.isTestStudent) === Boolean(doc.isTestStudent)) return doc
  const actor = req.user?.id ?? null
  if (doc.isTestStudent === true) {
    await deletePlannedFreezes(req, doc.id, { automaticOnly: true })
    await endActiveFreezes(req, doc.id, actor, { automaticOnly: true })
    return doc
  }
  if ((await getAuthoritativeLearningPolicy(req.payload, doc.id, req)).role !== 'student') return doc
  const now = Date.now()
  if ((await loadFreezePeriods(req.payload, doc.id, req)).some((period) => Date.parse(period.startsAt) > now)) return doc
  // Полгода могли уже пройти: тогда заморозка через две недели, чтобы ученик успел увидеть плашку.
  const notice = now + FREEZE_NOTICE_DAYS * 24 * 60 * 60 * 1000
  const startsAt = new Date(Math.max(Date.parse(automaticFreezeStart(doc.createdAt)), notice)).toISOString()
  await planAutomaticFreeze(req, doc.id, startsAt, actor)
  return doc
}

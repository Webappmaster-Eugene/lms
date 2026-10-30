import type { CollectionAfterChangeHook } from 'payload'

import { BOOTCAMP_LEAD_STATUSES } from '@/lib/bootcamp-leads'
import { adminLink, notifyAdminsAfterCommit } from '@/server/admin-telegram'
import type { BootcampLead } from '@/payload-types'

const statusLabel = (status: string | null | undefined) => BOOTCAMP_LEAD_STATUSES.find((item) => item.value === status)?.label ?? status ?? 'нет'

/**
 * Смена этапа заявки уходит в Telegram: видно, кто и куда перевёл кандидата.
 * Зачисление переводит заявку само и пишет своё сообщение, поэтому ставит
 * context.leadStatusNoticeSent.
 */
export const notifyLeadStatusChange: CollectionAfterChangeHook<BootcampLead> = async ({ doc, previousDoc, operation, req }) => {
  if (operation !== 'update' || !previousDoc || previousDoc.status === doc.status || req.context.leadStatusNoticeSent) return doc
  const actor = req.user ? [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || req.user.email : 'система'
  await notifyAdminsAfterCommit(req, {
    title: `Этап заявки на буткемп: ${doc.email}`,
    lines: [`Было: ${statusLabel(previousDoc.status)}, стало: ${statusLabel(doc.status)}`, `Изменил: ${actor}`],
    link: adminLink(`/admin/collections/bootcamp-leads/${doc.id}`),
  })
  return doc
}

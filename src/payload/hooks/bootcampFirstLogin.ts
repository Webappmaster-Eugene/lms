import { sql } from '@payloadcms/db-postgres'
import type { CollectionAfterLoginHook } from 'payload'

import { relationId } from '@/lib/relation-id'
import { logger } from '@/lib/telemetry'
import { adminLink, notifyAdmins } from '@/server/admin-telegram'
import type { User } from '@/payload-types'

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }

/**
 * Первый вход зачисленного ученика в LMS: значит, приглашение дошло и пароль задан.
 * Отметка ставится одним UPDATE: повторные входы и параллельные вкладки её не дублируют.
 * Сбой не мешает входу.
 */
export const noteBootcampFirstLogin: CollectionAfterLoginHook<User> = async ({ user, req }) => {
  if (user.role !== 'student') return user
  try {
    const db = (req.payload.db as unknown as { drizzle: Db }).drizzle
    const result = await db.execute(sql`update bootcamp_enrollments set lms_signed_in_at = now(), updated_at = now() where lms_user_id = ${user.id} and lms_signed_in_at is null returning id, email, first_name, last_name, gitlab_username, lead_id`)
    for (const row of (result as { rows?: Record<string, unknown>[] }).rows ?? []) {
      void notifyAdmins({
        title: `Ученик впервые вошёл в LMS: ${String(row.email)}`,
        lines: [`${String(row.first_name)} ${String(row.last_name)}, логин GitLab ${String(row.gitlab_username)}`],
        link: adminLink(`/admin/collections/bootcamp-leads/${relationId(row.lead_id)}`),
      })
    }
  } catch (error) {
    logger.error('Bootcamp first login mark failed', error, { 'user.id': user.id })
  }
  return user
}

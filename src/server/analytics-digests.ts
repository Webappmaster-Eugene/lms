import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { formatFreezeDate } from '@/lib/account-freeze'
import { weeklySummaryWindow } from '@/lib/bootcamp-funnel'
import { daysLabel, INACTIVE_DAYS, type StudentRow } from '@/lib/learning-analytics'
import { adminLink, notifyAdminsAfterCommit } from '@/server/admin-telegram'
import { inTransaction, rowsOf, txDb } from '@/server/bootcamp-lead-events'
import { studentRows } from '@/server/learning-analytics'

// Больше строк в одном сообщении Telegram уже не читаются: остальное - на экране по ссылке.
const MAX_LINES = 25

export const INACTIVE_FILTER_PATH = '/admin/student-analytics?filter=inactive'

function inactiveLine(row: StudentRow): string {
  if (row.lastActivityAt) return `${row.title} - последняя активность ${formatFreezeDate(row.lastActivityAt)}, ${daysLabel(row.idleDays ?? 0)} назад`
  return `${row.title} - не занимался ни разу, учётка создана ${formatFreezeDate(row.createdAt)}`
}

/**
 * По понедельникам с 10:00 - ученики без активности 14 дней (решение владельца 13.11.2026).
 * Отметка недели вставляется первой в транзакции: второй процесс приложения упрётся в уникальный
 * ключ и ничего не отправит. Пустая неделя тоже отмечается, чтобы не пересчитывать её каждую минуту.
 */
export async function sendInactiveDigest(payload: Payload, now = new Date()): Promise<boolean> {
  const window = weeklySummaryWindow(now)
  if (!window) return false
  return inTransaction(payload, null, async (req) => {
    const tx = await txDb(req)
    const marked = rowsOf(await tx.execute(sql`
      insert into admin_digests (kind, period) values ('inactive-students', ${window.week})
      on conflict (kind, period) do nothing returning id`))
    if (marked.length === 0) return false
    const inactive = (await studentRows(payload, req, { period: 30, withCourses: false }, now.getTime()))
      .filter((row) => row.state === 'inactive' && !row.isTestStudent)
      .sort((left, right) => (right.idleDays ?? 0) - (left.idleDays ?? 0) || left.title.localeCompare(right.title, 'ru-RU'))
    if (inactive.length === 0) return false
    const lines = inactive.slice(0, MAX_LINES).map(inactiveLine)
    if (inactive.length > MAX_LINES) lines.push(`и ещё ${inactive.length - MAX_LINES}`)
    lines.push('Кто ушёл в отпуск или бросил учёбу, можно заморозить на экране «Ученики и доступы».')
    await tx.execute(sql`update admin_digests set summary = ${lines.join('\n').slice(0, 4000)}, updated_at = now() where kind = 'inactive-students' and period = ${window.week}`)
    await notifyAdminsAfterCommit(req, { title: `Нет активности ${INACTIVE_DAYS}+ дней: ${inactive.length}`, lines, link: adminLink(INACTIVE_FILTER_PATH) })
    return true
  })
}

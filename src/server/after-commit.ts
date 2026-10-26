// Payload CLI loads collection hooks outside React's server module condition, so no 'server-only'.
import type { PayloadRequest } from 'payload'
import { logger } from '@/lib/telemetry'

/**
 * Задачи, которые нельзя отозвать (письма), ждут фиксации транзакции: иначе при
 * откате начисления ученик получил бы письмо о награде, которой в базе нет.
 * Задачи лежат в сессии транзакции адаптера; securePostgresAdapter выполняет их
 * после commit, а rollback выбрасывает вместе с сессией.
 */
export const COMMIT_TASKS = Symbol.for('lms.db.commitTasks')

export type CommitTask = () => Promise<void>
export type SessionWithTasks = { [COMMIT_TASKS]?: CommitTask[] }
type AdapterWithTasks = { [COMMIT_TASKS]?: true; sessions?: Record<string | number, SessionWithTasks | undefined> }

/** Вне транзакции (или на адаптере без поддержки) задача выполняется сразу. */
export async function afterCommit(req: PayloadRequest, task: CommitTask): Promise<void> {
  const id = await req.transactionID
  const adapter = req.payload.db as unknown as AdapterWithTasks | undefined
  const session = id === undefined || !adapter?.[COMMIT_TASKS] ? undefined : adapter.sessions?.[id]
  if (!session) return runCommitTasks([task])
  ;(session[COMMIT_TASKS] ??= []).push(task)
}

/** Сбой одной задачи не отменяет остальные и не превращает зафиксированную операцию в ошибку. */
export async function runCommitTasks(tasks: CommitTask[] | undefined): Promise<void> {
  for (const task of tasks ?? []) {
    try {
      await task()
    } catch (error) {
      logger.error('Действие после фиксации транзакции не выполнено', error)
    }
  }
}

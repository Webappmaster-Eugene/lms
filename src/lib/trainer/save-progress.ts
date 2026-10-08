import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from 'payload'

import type { TrainerTask, User } from '@/payload-types'
import type { TrainerLanguage, TrainerRunResult } from '@/lib/trainer/types'

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
type SessionsAdapter = { sessions: Record<string | number, { db: Executor } | undefined> }

export async function saveTrainerProgress(input: {
  payload: Payload
  user: User
  task: TrainerTask
  language: TrainerLanguage
  code: string
  result: TrainerRunResult
}) {
  const { payload, user, task, language, code, result } = input
  const req = await createLocalReq({ user }, payload)
  try {
    if (!await initTransaction(req)) throw new Error('Не удалось начать транзакцию прогресса')
    const transactionId = await req.transactionID
    const adapter = payload.db as unknown as SessionsAdapter
    const db = transactionId === undefined ? undefined : adapter.sessions[transactionId]?.db
    if (!db) throw new Error('Прогресс требует транзакцию')
    // Один замок охватывает первое создание, счётчики и пересчёт XP разных задач.
    await db.execute(sql`select id from users where id = ${user.id} for update`)
    const existing = await payload.find({
      collection: 'user-trainer-progress', req, depth: 0, overrideAccess: true,
      where: { user: { equals: user.id }, task: { equals: task.id } }, limit: 1,
    })
    const previous = existing.docs[0]
    const passed = result.status === 'passed'
    const wasCompleted = previous?.isCompleted === true && previous.verifiedBy === 'server'
    const attempts = (previous?.attempts ?? 0) + 1
    const completed = wasCompleted || passed
    const data = {
      isCompleted: completed, userCode: code, language, attempts,
      failedAttempts: (previous?.failedAttempts ?? 0) + (passed ? 0 : 1),
      lastResult: {
        status: result.status, language, passed: result.passedCount, total: result.totalCount,
        failedTests: result.tests.filter(test => !test.passed).slice(0, 10).map(test => test.name),
        ...(result.error ? { error: result.error.slice(0, 300) } : {}),
        at: new Date().toISOString(),
      },
      ...(passed ? { verifiedBy: 'server' as const } : {}),
      ...(passed && !wasCompleted ? { completedAt: new Date().toISOString() } : {}),
    }
    if (previous) {
      await payload.update({ collection: 'user-trainer-progress', id: previous.id, data, req, overrideAccess: true })
    } else {
      await payload.create({ collection: 'user-trainer-progress', data: { ...data, user: user.id, task: task.id }, req, overrideAccess: true })
    }
    let awardedPoints: number | null = null
    if (passed && !wasCompleted) {
      const transactions = await payload.find({
        collection: 'points-transactions', req, depth: 0, overrideAccess: true, limit: 1,
        where: { user: { equals: user.id }, reason: { equals: 'trainer_task_completed' }, relatedEntity: { equals: String(task.id) } },
      })
      awardedPoints = transactions.docs[0]?.amount ?? null
    }
    await commitTransaction(req)
    return { completed, awardedPoints, attempts }
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}

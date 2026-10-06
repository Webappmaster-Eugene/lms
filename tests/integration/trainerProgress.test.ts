import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { saveTrainerProgress } from '@/lib/trainer/save-progress'
import type { TrainerRunResult } from '@/lib/trainer/types'
import { createStudent, createSumTask, getTestPayload } from './helpers/payload'

let payload: Payload
beforeAll(async () => { payload = await getTestPayload() })

function result(passed: boolean): TrainerRunResult {
  return {
    status: passed ? 'passed' : 'failed',
    tests: [{ name: 'сумма', passed, hidden: false, durationMs: 0 }],
    passedCount: passed ? 1 : 0, totalCount: 1, consoleOutput: [], totalMs: 0,
  }
}

describe('обычные конкурентные отправки: прогресс и баллы в PostgreSQL', () => {
  it.each([false, true])('сохраняет каждую попытку и успех при существующем прогрессе=%s', async existing => {
    const user = await createStudent(payload)
    const task = await createSumTask(payload, { pointsReward: 19 })
    if (existing) await payload.create({ collection: 'user-trainer-progress', data: { user: user.id, task: task.id, isCompleted: false } })
    const saved = await Promise.all(Array.from({ length: 6 }, (_, index) => saveTrainerProgress({
      payload, user, task, language: 'js', code: `attempt ${index}`, result: result(index % 2 === 0),
    })))
    expect(saved.map(item => item.attempts).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6])
    expect(saved.filter(item => item.awardedPoints !== null).map(item => item.awardedPoints)).toEqual([19])
    const progress = await payload.find({ collection: 'user-trainer-progress', depth: 0, where: { user: { equals: user.id }, task: { equals: task.id } } })
    expect(progress.docs).toHaveLength(1)
    expect(progress.docs[0]).toMatchObject({ isCompleted: true, attempts: 6, failedAttempts: 3, verifiedBy: 'server' })
    expect(progress.docs[0].completedAt).toBeTruthy()
    const points = await payload.find({ collection: 'points-transactions', depth: 0, where: { user: { equals: user.id }, reason: { equals: 'trainer_task_completed' } } })
    expect(points.docs).toHaveLength(1)
    expect(points.docs[0].amount).toBe(19)
    expect((await payload.findByID({ collection: 'users', id: user.id })).totalPoints).toBe(19)
    const laterFailure = await saveTrainerProgress({ payload, user, task, language: 'js', code: 'обычная новая неверная попытка', result: result(false) })
    expect(laterFailure).toEqual({ completed: true, attempts: 7, awardedPoints: null })
    const latest = await payload.findByID({ collection: 'user-trainer-progress', id: progress.docs[0].id, depth: 0 })
    expect(latest).toMatchObject({ isCompleted: true, verifiedBy: 'server', attempts: 7, failedAttempts: 4, completedAt: progress.docs[0].completedAt })
    expect(latest.lastResult).toMatchObject({ status: 'failed' })
  })

  it('пересчёт XP разных одновременно решённых задач сохраняет полную сумму', async () => {
    const user = await createStudent(payload)
    const tasks = await Promise.all([11, 13, 17].map(pointsReward => createSumTask(payload, { pointsReward })))
    await Promise.all(tasks.map(task => saveTrainerProgress({ payload, user, task, language: 'js', code: 'sum', result: result(true) })))
    expect((await payload.findByID({ collection: 'users', id: user.id })).totalPoints).toBe(41)
    const transactions = await payload.find({ collection: 'points-transactions', where: { user: { equals: user.id } }, depth: 0 })
    expect(transactions.docs).toHaveLength(3)
  })
})

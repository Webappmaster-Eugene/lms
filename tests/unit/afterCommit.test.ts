import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/telemetry', () => ({ logger }))

const { afterCommit, COMMIT_TASKS, runCommitTasks } = await import('@/server/after-commit')

function makeReq(transactionID: string | undefined, db: unknown): PayloadRequest {
  return { transactionID, payload: { db } } as unknown as PayloadRequest
}

beforeEach(() => vi.clearAllMocks())

describe('afterCommit', () => {
  it('вне транзакции выполняет задачу сразу', async () => {
    const task = vi.fn(async () => {})
    await afterCommit(makeReq(undefined, { [COMMIT_TASKS]: true, sessions: {} }), task)
    expect(task).toHaveBeenCalledOnce()
  })

  it('внутри транзакции откладывает задачу в её сессию до фиксации', async () => {
    const session: Record<symbol, unknown> = {}
    const task = vi.fn(async () => {})
    await afterCommit(makeReq('tx-1', { [COMMIT_TASKS]: true, sessions: { 'tx-1': session } }), task)
    expect(task).not.toHaveBeenCalled()
    await runCommitTasks(session[COMMIT_TASKS] as never)
    expect(task).toHaveBeenCalledOnce()
  })

  it('адаптер без поддержки отложенных задач выполняет их сразу, а не теряет', async () => {
    const task = vi.fn(async () => {})
    await afterCommit(makeReq('tx-1', { sessions: { 'tx-1': {} } }), task)
    expect(task).toHaveBeenCalledOnce()
  })

  it('сбой одной задачи записывается в журнал и не отменяет следующие', async () => {
    const after = vi.fn(async () => {})
    await runCommitTasks([async () => { throw new Error('SMTP недоступен') }, after])
    expect(logger.error).toHaveBeenCalledWith('Действие после фиксации транзакции не выполнено', expect.any(Error))
    expect(after).toHaveBeenCalledOnce()
  })
})

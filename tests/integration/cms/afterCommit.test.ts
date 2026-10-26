import { beforeAll, describe, expect, it, vi } from 'vitest'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload, type PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import { afterCommit } from '@/server/after-commit'
import { getTestPayload } from '../helpers/payload'

/**
 * Отложенные до фиксации действия на настоящем адаптере: письмо о награде нельзя
 * отозвать, поэтому оно уходит только после COMMIT, а откат его отменяет.
 */
let payload: Payload

beforeAll(async () => {
  payload = await getTestPayload()
})

async function transaction(): Promise<PayloadRequest> {
  const req = await createLocalReq({}, payload)
  await initTransaction(req)
  return req
}

type Sessions = Record<string | number, { db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } }>

describe('afterCommit на адаптере PostgreSQL', () => {
  it('задача ждёт фиксации транзакции', async () => {
    const req = await transaction()
    const task = vi.fn(async () => {})
    await afterCommit(req, task)
    expect(task).not.toHaveBeenCalled()
    await commitTransaction(req)
    expect(task).toHaveBeenCalledOnce()
  })

  it('откат выбрасывает задачу', async () => {
    const req = await transaction()
    const task = vi.fn(async () => {})
    await afterCommit(req, task)
    await killTransaction(req)
    expect(task).not.toHaveBeenCalled()
  })

  it('транзакция, прерванная пойманной ошибкой SQL, не выполняет задачи, хотя COMMIT не бросает', async () => {
    const req = await transaction()
    const task = vi.fn(async () => {})
    await afterCommit(req, task)
    const db = (payload.db as unknown as { sessions: Sessions }).sessions[(await req.transactionID)!].db
    await expect(db.execute(sql`select 1 / 0`)).rejects.toThrow()
    await commitTransaction(req)
    expect(task).not.toHaveBeenCalled()
  })

  it('вне транзакции задача выполняется сразу', async () => {
    const req = await createLocalReq({}, payload)
    const task = vi.fn(async () => {})
    await afterCommit(req, task)
    expect(task).toHaveBeenCalledOnce()
  })
})

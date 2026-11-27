import { sql } from '@payloadcms/db-postgres'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from 'payload'

import { adminTelegramTransport, notifyAdmins, notifyAdminsAfterCommit, runAdminTelegramJobs } from '@/server/admin-telegram'
import { logger } from '@/lib/telemetry'
import { getTestPayload } from '../helpers/payload'

const TOKEN = '123456:abcdefghijklmnopqrstuvwxyz'
const run = () => runAdminTelegramJobs(payload, Date.now() + 60_000)
let payload: Payload

beforeAll(async () => { payload = await getTestPayload() })
beforeEach(() => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', TOKEN)
  vi.stubEnv('TELEGRAM_ADMIN_CHAT_ID', '42,43,42')
  vi.stubEnv('TELEGRAM_PROXY_URL', '')
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('lms.adminTelegram.sent')]
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await payload.delete({ collection: 'admin-telegram-deliveries', where: { chat: { in: ['42', '43'] } }, overrideAccess: true })
})

describe('очередь Telegram для ментора', () => {
  it('после отказа повторяет отправку только в недоставленный чат, в том числе при двух планировщиках', async () => {
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const send = vi.spyOn(adminTelegramTransport, 'send').mockImplementation(async (_config, chat) => {
      if (chat === '43') throw new Error(`failed /bot${TOKEN}/sendMessage`)
    })
    await notifyAdmins(payload, { title: 'Заявка', lines: ['Нужен ответ'] })
    await Promise.all([run(), run()])
    expect(send.mock.calls.map(([, chat]) => chat).sort()).toEqual(['42', '43'])
    await vi.waitFor(() => expect(log).toHaveBeenCalledOnce())
    const { docs } = await payload.find({ collection: 'admin-telegram-deliveries', overrideAccess: true })
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ chat: '43', attempts: 1, message: 'Заявка\nНужен ответ' })
    expect(Date.parse(docs[0].nextAttemptAt)).toBeGreaterThan(Date.now())
    expect(log).toHaveBeenCalled()
    expect(log.mock.calls.map(([, error]) => String(error)).join()).not.toContain(TOKEN)
    await run()
    expect(send).toHaveBeenCalledTimes(2)
    await payload.db.drizzle.execute(sql`UPDATE admin_telegram_deliveries SET next_attempt_at = now() WHERE id = ${docs[0].id}`)
    send.mockResolvedValue()
    await Promise.all([run(), run()])
    expect(send.mock.calls.map(([, chat, text]) => [chat, text]).at(-1)).toEqual(['43', 'Заявка\nНужен ответ'])
    expect(send).toHaveBeenCalledTimes(3)
    expect((await payload.count({ collection: 'admin-telegram-deliveries' })).totalDocs).toBe(0)
  })

  it('не отправляет накопленное сообщение в чат, удаленный из настроек', async () => {
    const send = vi.spyOn(adminTelegramTransport, 'send').mockRejectedValue(new Error('proxy answered 500'))
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {})
    await notifyAdmins(payload, { title: 'Заявка' })
    await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(2))
    await payload.db.drizzle.execute(sql`UPDATE admin_telegram_deliveries SET next_attempt_at = now() WHERE chat IN ('42', '43')`)
    send.mockClear().mockResolvedValue()
    vi.stubEnv('TELEGRAM_ADMIN_CHAT_ID', '43')
    await run()
    expect(send.mock.calls.map(([, chat]) => chat)).toEqual(['43'])
    expect((await payload.count({ collection: 'admin-telegram-deliveries' })).totalDocs).toBe(0)
  })

  it('выдает сообщение только после фиксации действия и скрывает очередь от клиентов', async () => {
    const send = vi.spyOn(adminTelegramTransport, 'send').mockResolvedValue()
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    await notifyAdminsAfterCommit(req, { title: 'Отмененная заявка' })
    await killTransaction(req)
    await run()
    expect(send).not.toHaveBeenCalled()

    const next = await createLocalReq({}, payload)
    await initTransaction(next)
    await notifyAdminsAfterCommit(next, { title: 'Принятая заявка' })
    expect(send).not.toHaveBeenCalled()
    await commitTransaction(next)
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    await expect(payload.find({ collection: 'admin-telegram-deliveries', overrideAccess: false })).rejects.toMatchObject({ status: 403 })
    await expect(payload.create({ collection: 'admin-telegram-deliveries', data: { chat: '42', message: 'Чужое сообщение', attempts: 0, nextAttemptAt: new Date().toISOString() }, overrideAccess: false })).rejects.toMatchObject({ status: 403 })
  })

  it('сохраняет хвост очереди при достижении лимита отправки', async () => {
    vi.stubEnv('TELEGRAM_ADMIN_CHAT_ID', '42')
    const send = vi.spyOn(adminTelegramTransport, 'send').mockResolvedValue()
    await Promise.all(Array.from({ length: 42 }, (_, index) => notifyAdmins(payload, { title: `Заявка ${index}` })))
    await run()
    expect(send).toHaveBeenCalledTimes(40)
    await vi.waitFor(async () => expect((await payload.count({ collection: 'admin-telegram-deliveries' })).totalDocs).toBe(2))
  })
})

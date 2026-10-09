import { beforeAll, describe, expect, it } from 'vitest'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import { getTrainerAccess } from '@/server/trainer-access'
import { saveTrainerProgress } from '@/lib/trainer/save-progress'
import { interviewRequest } from '@/lib/trainer/interview-server'
import { POST as compile } from '@/app/api/trainer/compile/route'
import { POST as submit } from '@/app/api/trainer/submit/route'
import { GET as solution } from '@/app/api/trainer/solution/route'
import type { LearningTargetCollection } from '@/lib/learning-access'
import type { TrainerRunResult } from '@/lib/trainer/types'
import { createAdmin, createStudent, createSumTask, createTopic, getTestPayload, login, rest, type TestUser } from './helpers/payload'

let payload: Payload
let admin: TestUser
beforeAll(async () => { payload = await getTestPayload(); admin = await createAdmin(payload) })
async function grant(userId: number, target: LearningTargetCollection, value: number, effect: 'allow' | 'deny' = 'allow') {
  return payload.create({ collection: 'learning-access-grants', req: await createLocalReq({ user: admin }, payload), data: { user: userId, target: { relationTo: target, value }, effect, ruleKey: 'server-generated' } })
}
async function change(user: TestUser, data: { trainerAccessMode?: 'all' | 'assigned' | 'disabled'; learningCatalogVisibility?: 'catalog' | 'assigned' }) {
  await payload.update({ collection: 'users', id: user.id, data, req: await createLocalReq({ user: admin }, payload) })
}
function request(path: string, token: string, data?: unknown, method = data === undefined ? 'GET' : 'POST') {
  return new Request(`http://lms.test/api/trainer/${path}`, { method, headers: { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
}
const passed: TrainerRunResult = { status: 'passed', tests: [{ name: 'sum', passed: true, hidden: false, durationMs: 0 }], passedCount: 1, totalCount: 1, consoleOutput: [], totalMs: 0 }

async function roomCall(action: 'create' | 'read' | 'join' | 'update' | 'compile', token: string, room?: string, body?: unknown) {
  return interviewRequest(request(`interview${room ? `/${room}` : ''}`, token, body, action === 'read' ? 'GET' : action === 'update' ? 'PATCH' : 'POST'), action, room)
}

describe('персональный тренажёр: PostgreSQL, REST, маршруты и отозванные решения', () => {
  it('assigned без правил закрывает REST id/depth/select/find и compile/submit/solution', async () => {
    const user = await createStudent(payload, { trainerAccessMode: 'assigned', learningCatalogVisibility: 'assigned' })
    const token = await login(payload, user)
    const task = await createSumTask(payload, { solutionCode: 'PRIVATE_SOLUTION', setupCode: 'PRIVATE_SETUP' })
    for (const suffix of ['', '?depth=3', '?select[starterCode]=true']) expect((await rest('GET', `/trainer-tasks/${task.id}${suffix}`, { token })).status).toBe(404)
    expect((await rest('GET', `/trainer-tasks?where[id][equals]=${task.id}`, { token })).json.docs).toEqual([])
    expect((await rest('GET', `/trainer-topics/${typeof task.topic === 'object' ? task.topic.id : task.topic}`, { token })).status).toBe(404)
    expect((await compile(request('compile', token, { taskId: task.id, code: 'const n = 1' }))).status).toBe(403)
    expect((await submit(request('submit', token, { taskId: task.id, code: 'function sum(a,b){return a+b}' }))).status).toBe(403)
    expect((await solution(request(`solution?taskId=${task.id}`, token))).status).toBe(403)
    expect((await roomCall('create', token, undefined, {})).status).toBe(403)
    expect((await payload.findByID({ collection: 'users', id: user.id })).totalPoints).toBe(0)
  })

  it('topic allow, task deny и task exception работают без раскрытия hidden решений', async () => {
    const user = await createStudent(payload, { trainerAccessMode: 'assigned', learningCatalogVisibility: 'assigned' })
    const token = await login(payload, user)
    const topic = await createTopic(payload)
    const first = await createSumTask(payload, { topic: topic.id, solutionCode: 'PRIVATE_SOLUTION' })
    const second = await createSumTask(payload, { topic: topic.id })
    const topicGrant = await grant(user.id, 'trainer-topics', topic.id)
    expect((await getTrainerAccess(payload, user)).accessibleTaskIds).toEqual([first.id, second.id])
    const allowed = await rest('GET', `/trainer-tasks/${first.id}?depth=0`, { token })
    expect(allowed.status).toBe(200)
    expect(JSON.stringify(allowed.json)).not.toContain('PRIVATE_SOLUTION')
    await grant(user.id, 'trainer-tasks', first.id, 'deny')
    expect((await rest('GET', `/trainer-tasks/${first.id}`, { token })).status).toBe(404)
    expect((await rest('GET', `/trainer-tasks/${second.id}`, { token })).status).toBe(200)
    await payload.delete({ collection: 'learning-access-grants', id: topicGrant.id, req: await createLocalReq({ user: admin }, payload) })
    await grant(user.id, 'trainer-topics', topic.id, 'deny')
    await grant(user.id, 'trainer-tasks', second.id)
    expect((await getTrainerAccess(payload, user)).accessibleTaskIds).toEqual([second.id])
  })

  it('catalog возвращает только scope карточек; content REST остаётся закрытым', async () => {
    const user = await createStudent(payload, { trainerAccessMode: 'assigned', learningCatalogVisibility: 'catalog' })
    const token = await login(payload, user)
    const task = await createSumTask(payload)
    const scope = await getTrainerAccess(payload, user)
    expect(scope.canBrowseTask(task.id)).toBe(true)
    expect(scope.canAccessTask(task.id)).toBe(false)
    expect((await rest('GET', `/trainer-tasks/${task.id}`, { token })).status).toBe(404)
    await change(user, { trainerAccessMode: 'disabled' })
    expect((await getTrainerAccess(payload, user)).browseTaskIds).toEqual([])
  })

  it('старый успешный серверный вердикт после revoke не создаёт попытку, XP или награды', async () => {
    const user = await createStudent(payload, { trainerAccessMode: 'assigned' })
    const task = await createSumTask(payload, { pointsReward: 29 })
    const allowance = await grant(user.id, 'trainer-tasks', task.id)
    expect((await getTrainerAccess(payload, user)).canAccessTask(task.id)).toBe(true)
    await payload.delete({ collection: 'learning-access-grants', id: allowance.id, req: await createLocalReq({ user: admin }, payload) })
    await expect(saveTrainerProgress({ payload, user, task, language: 'js', code: 'stale solution', result: passed })).rejects.toMatchObject({ status: 403 })
    expect((await payload.count({ collection: 'user-trainer-progress', where: { user: { equals: user.id } } })).totalDocs).toBe(0)
    expect((await payload.count({ collection: 'points-transactions', where: { user: { equals: user.id } } })).totalDocs).toBe(0)
    expect((await payload.findByID({ collection: 'users', id: user.id })).totalPoints).toBe(0)
  })

  it.each([
    { name: 'отзыв доступа', data: { trainerAccessMode: 'disabled' as const } },
    { name: 'блокировка аккаунта', data: { isActive: false } },
  ])('$name: прямой PATCH сериализуется с проверенным решением до начисления XP', async ({ data }) => {
    const user = await createStudent(payload, { trainerAccessMode: 'all' })
    const task = await createSumTask(payload, { pointsReward: 31 })
    const req = await createLocalReq({ user: admin }, payload)
    let verdict: ReturnType<typeof saveTrainerProgress> | undefined
    try {
      expect(await initTransaction(req)).toBe(true)
      await payload.update({ collection: 'users', id: user.id, data, req })
      verdict = saveTrainerProgress({ payload, user, task, language: 'js', code: 'previously checked', result: passed })
      // Consume rejection immediately; the original promise remains available for the assertion.
      void verdict.catch(() => undefined)
      type LockExecutor = { execute: (query: ReturnType<typeof sql>) => Promise<{ rows: { count: number }[] }> }
      const adapter = payload.db as unknown as { drizzle: LockExecutor }
      let waiting = false
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        const locks = await adapter.drizzle.execute(sql`select count(*)::integer as count from pg_locks where locktype = 'advisory' and classid = 7204 and objid = ${user.id} and granted = false`)
        if ((locks.rows[0]?.count ?? 0) > 0) { waiting = true; break }
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      // This guards the order itself: a row-only PATCH would instead block the verdict on users.
      expect(waiting).toBe(true)
      await commitTransaction(req)
      await expect(verdict).rejects.toMatchObject({ status: 403 })
      expect((await payload.count({ collection: 'user-trainer-progress', where: { user: { equals: user.id } } })).totalDocs).toBe(0)
      expect((await payload.count({ collection: 'points-transactions', where: { user: { equals: user.id } } })).totalDocs).toBe(0)
    } finally {
      await killTransaction(req)
      await verdict?.catch(() => undefined)
    }
  })

  it('disabled и unpublished topic не обходятся старым DTO или explicittaskallow', async () => {
    const user = await createStudent(payload, { trainerAccessMode: 'assigned' })
    const topic = await createTopic(payload)
    const task = await createSumTask(payload, { topic: topic.id })
    await grant(user.id, 'trainer-tasks', task.id)
    await payload.update({ collection: 'trainer-topics', id: topic.id, data: { isPublished: false } })
    expect((await getTrainerAccess(payload, user)).canAccessTask(task.id)).toBe(false)
    await payload.update({ collection: 'trainer-topics', id: topic.id, data: { isPublished: true } })
    await change(user, { trainerAccessMode: 'disabled' })
    expect((await getTrainerAccess(payload, { ...user, role: 'admin' })).hasAccess).toBe(false)
    await expect(saveTrainerProgress({ payload, user, task, language: 'js', code: 'stale solution', result: passed })).rejects.toMatchObject({ status: 403 })
  })

  it('приглашение в комнату не даёт чужую задачу и после revoke закрывает API/REST/compile', async () => {
    const owner = await createStudent(payload, { trainerAccessMode: 'assigned' })
    const guest = await createStudent(payload, { trainerAccessMode: 'assigned' })
    const task = await createSumTask(payload)
    const otherTask = await createSumTask(payload)
    await grant(owner.id, 'trainer-tasks', task.id)
    await grant(guest.id, 'trainer-tasks', otherTask.id)
    const ownerToken = await login(payload, owner)
    const guestToken = await login(payload, guest)
    const created = await roomCall('create', ownerToken, undefined, { taskId: task.id })
    expect(created.status).toBe(201)
    const roomToken = (await created.json()).room.token as string
    expect((await roomCall('join', guestToken, roomToken, {})).status).toBe(403)
    const guestGrant = await grant(guest.id, 'trainer-tasks', task.id)
    expect((await roomCall('join', guestToken, roomToken, {})).status).toBe(200)
    expect((await roomCall('read', guestToken, roomToken)).status).toBe(200)
    await payload.delete({ collection: 'learning-access-grants', id: guestGrant.id, req: await createLocalReq({ user: admin }, payload) })
    for (const action of ['read', 'join', 'update', 'compile'] as const) expect((await roomCall(action, guestToken, roomToken, action === 'read' ? undefined : { code: 'const n = 1', version: 1 })).status).toBe(403)
    expect((await rest('GET', `/interview-rooms?where[token][equals]=${roomToken}`, { token: guestToken })).json.docs).toEqual([])
    // Immutable numeric origin survives deletion; copied text cannot become a custom room.
    await payload.delete({ collection: 'trainer-tasks', id: task.id, req: await createLocalReq({ user: admin }, payload) })
    expect((await roomCall('read', ownerToken, roomToken)).status).toBe(403)
  })

  it('неизвестный источник старой комнаты закрыт даже при all, новые custom разрешены при наличии назначений', async () => {
    const user = await createStudent(payload, { trainerAccessMode: 'assigned' })
    const task = await createSumTask(payload)
    const assignment = await grant(user.id, 'trainer-tasks', task.id)
    const token = await login(payload, user)
    const legacy = await payload.create({ collection: 'interview-rooms', data: { token: crypto.randomUUID(), owner: user.id, members: [user.id], title: 'Legacy', descriptionMd: 'Legacy source', language: 'js', version: 1 } })
    expect((await roomCall('read', token, legacy.token)).status).toBe(403)
    expect((await rest('GET', `/interview-rooms/${legacy.id}`, { token })).status).toBe(404)
    await payload.update({ collection: 'users', id: user.id, req: await createLocalReq({ user: admin }, payload), data: { trainerAccessMode: 'all' } })
    await payload.update({ collection: 'learning-access-grants', id: assignment.id, req: await createLocalReq({ user: admin }, payload), data: { effect: 'deny' } })
    expect((await roomCall('read', token, legacy.token)).status).toBe(403)
    expect((await rest('GET', `/interview-rooms/${legacy.id}`, { token })).status).toBe(404)
    const custom = await roomCall('create', token, undefined, {})
    expect(custom.status).toBe(201)
    expect((await roomCall('read', token, (await custom.json()).room.token)).status).toBe(200)
  })
})

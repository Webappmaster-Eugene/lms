import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { interviewRequest } from '@/lib/trainer/interview-server'
import { createStudent, createSumTask, getTestPayload, login, rest } from './helpers/payload'

let payload: Payload
let owner: string
let guest: string
let outsider: string
let inactive: string
const url = 'http://lms.test/api/trainer/interview'

async function call(action: 'create' | 'read' | 'join' | 'update' | 'compile', auth?: string, token?: string, data?: object) {
  const headers = new Headers()
  if (auth) headers.set('Authorization', `JWT ${auth}`)
  if (data) headers.set('Content-Type', 'application/json')
  return interviewRequest(new Request(`${url}${token ? `/${token}` : ''}`, {
    method: action === 'read' ? 'GET' : action === 'update' ? 'PATCH' : 'POST', headers,
    ...(data ? { body: JSON.stringify(data) } : {}),
  }), action, token)
}

beforeAll(async () => {
  payload = await getTestPayload()
  owner = await login(payload, await createStudent(payload))
  guest = await login(payload, await createStudent(payload))
  outsider = await login(payload, await createStudent(payload))
  const disabled = await createStudent(payload)
  inactive = await login(payload, disabled)
  await payload.update({ collection: 'users', id: disabled.id, data: { isActive: false }, context: { skipHooks: true } })
})

describe('совместное собеседование: настоящее хранилище и авторизация', () => {
  it('не создаёт комнаты для анонимных и неактивных пользователей; валидирует ввод и CSRF', async () => {
    expect((await call('create', undefined, undefined, {})).status).toBe(401)
    expect((await call('create', inactive, undefined, {})).status).toBe(403)
    expect((await call('create', owner, undefined, { taskId: 'wrong' })).status).toBe(400)
    expect((await call('create', owner, undefined, [])).status).toBe(400)
    const request = new Request(url, { method: 'POST', headers: { Cookie: `payload-token=${owner}`, Origin: 'https://foreign.test', 'Content-Type': 'application/json' }, body: '{}' })
    expect((await interviewRequest(request, 'create')).status).toBe(403)
  })

  it('создаёт комнату по задаче без эталонов и скрытых тестов, изолирует участников и сохраняет код', async () => {
    const task = await createSumTask(payload, { solutionCode: 'SOLUTION_SECRET', testCode: 'HIDDEN_TEST_SECRET', solutionNotes: 'NOTES_SECRET' })
    const response = await call('create', owner, undefined, { taskId: task.id })
    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.room).toMatchObject({ title: task.title, code: task.starterCode, descriptionMd: task.descriptionMd, version: 1 })
    expect(JSON.stringify(data)).not.toMatch(/SOLUTION_SECRET|HIDDEN_TEST_SECRET|NOTES_SECRET|expectedCode|solutionCode/)
    const token = data.room.token
    expect((await call('read', outsider, token)).status).toBe(403)
    expect((await call('update', outsider, token, { version: 1, code: 'foreign', language: 'js' })).status).toBe(403)
    expect((await call('compile', outsider, token, { code: 'const n: number = 1' })).status).toBe(403)
    expect((await call('join', guest, token, {})).status).toBe(200)
    const joined = await (await call('read', guest, token)).json()
    expect(joined.room.participants).toHaveLength(2)
    expect(JSON.stringify(joined.room.participants)).not.toContain('@lms.test')
    expect((await call('update', guest, token, { version: 1, code: 'console.log(42)', language: 'js' })).status).toBe(200)
    const reread = await (await call('read', owner, token)).json()
    expect(reread.room).toMatchObject({ code: 'console.log(42)', version: 2 })
    const rooms = await rest('GET', `/interview-rooms?where[token][equals]=${token}`, { token: outsider })
    expect(rooms.json.docs).toEqual([])
    const guestRooms = await rest('GET', `/interview-rooms?where[token][equals]=${token}&depth=0`, { token: guest })
    expect(guestRooms.json.docs).toHaveLength(1)
    const docs = guestRooms.json.docs as { id: number }[]
    expect((await rest('PATCH', `/interview-rooms/${docs[0].id}`, { token: guest, body: { code: 'bypass' } })).status).toBe(403)
  })

  it('две одновременные записи одной версии дают один успех и один конфликт без потери первого кода', async () => {
    const created = await (await call('create', owner, undefined, {})).json()
    const token = created.room.token
    await call('join', guest, token, {})
    const [a, b] = await Promise.all([
      call('update', owner, token, { version: 1, code: 'first', language: 'js' }),
      call('update', guest, token, { version: 1, code: 'second', language: 'ts' }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    const winner = await (a.status === 200 ? a : b).json()
    const conflict = await (a.status === 409 ? a : b).json()
    expect(conflict.room.code).toBe(winner.room.code)
    expect(conflict.room.version).toBe(2)
    const current = await (await call('read', owner, token)).json()
    expect(current.room.code).toBe(winner.room.code)
    const accepted = await call('update', guest, token, { version: 2, code: 'explicit resolution', language: 'js' })
    expect(accepted.status).toBe(200)
    expect((await accepted.json()).room.version).toBe(3)
  })

  it('только владелец завершает комнату, закрытая комната доступна участникам только для чтения', async () => {
    const created = await (await call('create', owner, undefined, {})).json()
    const token = created.room.token
    await call('join', guest, token, {})
    expect((await call('update', guest, token, { version: 1, end: true })).status).toBe(403)
    expect((await call('update', owner, token, { version: 1, end: true })).status).toBe(200)
    expect((await call('update', owner, token, { version: 2, code: 'late', language: 'js' })).status).toBe(410)
    expect((await call('join', outsider, token, {})).status).toBe(410)
    expect((await call('read', guest, token)).status).toBe(200)
    expect((await call('compile', guest, token, { code: 'const x = 1' })).status).toBe(410)
  })

  it('транспилирует TypeScript в существующем изолированном процессе, не пишет прогресс', async () => {
    const created = await (await call('create', owner, undefined, {})).json()
    const token = created.room.token
    const before = await payload.count({ collection: 'user-trainer-progress' })
    const good = await call('compile', owner, token, { code: 'const value: number = 42; console.log(value)' })
    expect(good.status).toBe(200)
    expect(await good.json()).toMatchObject({ js: expect.stringContaining('console.log(value)'), diagnostics: [] })
    const bad = await call('compile', owner, token, { code: 'const value: number = "wrong"' })
    expect((await bad.json()).diagnostics.length).toBeGreaterThan(0)
    expect((await payload.count({ collection: 'user-trainer-progress' })).totalDocs).toBe(before.totalDocs)
  })

  it('удаление владельца очищает комнату в общей транзакции и не упирается в обязательный FK', async () => {
    const user = await createStudent(payload)
    const auth = await login(payload, user)
    const created = await (await call('create', auth, undefined, {})).json()
    await call('join', guest, created.room.token, {})
    await payload.delete({ collection: 'users', id: user.id })
    expect((await call('read', guest, created.room.token)).status).toBe(404)
  })

  it('ограничивает число участников, размер кода и частоту создания комнат', async () => {
    const author = await login(payload, await createStudent(payload))
    const created = await (await call('create', author, undefined, {})).json()
    const token = created.room.token
    for (let i = 0; i < 7; i++) {
      const invitee = await login(payload, await createStudent(payload))
      expect((await call('join', invitee, token, {})).status).toBe(200)
    }
    expect((await call('join', outsider, token, {})).status).toBe(409)
    expect((await call('update', author, token, { version: 1, code: 'x'.repeat(100_001), language: 'js' })).status).toBe(400)
    expect((await call('update', author, token, { version: 1, code: '', language: 'python' })).status).toBe(400)
    expect((await call('update', author, token, { version: 1, code: 'x'.repeat(160_000), language: 'js' })).status).toBe(413)
    for (let i = 0; i < 9; i++) expect((await call('create', author, undefined, {})).status).toBe(201)
    expect((await call('create', author, undefined, {})).status).toBe(429)
  })
})

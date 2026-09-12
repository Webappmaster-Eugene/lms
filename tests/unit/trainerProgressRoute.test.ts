import { describe, it, expect, beforeEach, vi } from 'vitest'

const find = vi.fn()
const create = vi.fn()
const update = vi.fn()
const auth = vi.fn()

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ auth, find, create, update })),
}))

const { POST } = await import('@/app/api/trainer-progress/route')

const USER = { id: 'user-1' }
const TASK = { id: 17, expectedOutput: '42' }

function post(body: unknown, raw?: string): Request {
  return new Request('https://lms.nadtocheev.ru/api/trainer-progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  })
}

/** Ответ payload.find для задачи и для поиска существующего прогресса. */
function findResult(docs: unknown[]) {
  return { docs, totalDocs: docs.length }
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ user: USER })
  find.mockImplementation(async ({ collection }: { collection: string }) =>
    collection === 'trainer-tasks' ? findResult([TASK]) : findResult([]),
  )
  create.mockResolvedValue({ id: 'progress-1' })
  update.mockResolvedValue({ id: 'progress-1' })
})

describe('авторизация', () => {
  it('без сессии — 401 и никакой записи', async () => {
    auth.mockResolvedValue({ user: null })

    const response = await POST(post({ taskId: 'task-1', userCode: 'x', output: '42' }))

    expect(response.status).toBe(401)
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})

describe('проверка тела запроса', () => {
  it('битый JSON — 400, а не 500', async () => {
    const response = await POST(post(null, '{не json'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'Невалидный JSON' })
  })

  it.each([
    ['без taskId', { userCode: 'x', output: '42' }],
    ['без userCode', { taskId: 'task-1', output: '42' }],
    ['без output', { taskId: 'task-1', userCode: 'x' }],
    ['output не строка', { taskId: 'task-1', userCode: 'x', output: 42 }],
    ['пустой userCode', { taskId: 'task-1', userCode: '', output: '42' }],
  ])('%s — 400', async (_label, body) => {
    const response = await POST(post(body))

    expect(response.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })

  it('пустой output допустим — задача может не требовать вывода', async () => {
    find.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === 'trainer-tasks'
        ? findResult([{ id: 'task-1', expectedOutput: '' }])
        : findResult([]),
    )

    const response = await POST(post({ taskId: 'task-1', userCode: 'x', output: '' }))

    expect(response.status).toBe(200)
  })
})

describe('ограничения размера', () => {
  it('слишком длинный код отвергается до обращения к БД', async () => {
    const response = await POST(
      post({ taskId: 'task-1', userCode: 'x'.repeat(10001), output: '42' }),
    )

    expect(response.status).toBe(400)
    expect(find).not.toHaveBeenCalled()
  })

  it('код на границе допустим', async () => {
    const response = await POST(
      post({ taskId: 'task-1', userCode: 'x'.repeat(10000), output: '42' }),
    )

    expect(response.status).toBe(200)
  })

  it('слишком длинный вывод отвергается', async () => {
    const response = await POST(
      post({ taskId: 'task-1', userCode: 'x', output: 'y'.repeat(10241) }),
    )

    expect(response.status).toBe(400)
  })
})

describe('задача должна существовать и быть опубликованной', () => {
  it('несуществующая задача — 404', async () => {
    find.mockResolvedValue(findResult([]))

    const response = await POST(post({ taskId: 'нет-такой', userCode: 'x', output: '42' }))

    expect(response.status).toBe(404)
    expect(create).not.toHaveBeenCalled()
  })

  it('выборка задачи фильтрует по isPublished', async () => {
    await POST(post({ taskId: 'task-1', userCode: 'x', output: '42' }))

    const [[query]] = find.mock.calls
    expect(query.collection).toBe('trainer-tasks')
    expect(query.where).toMatchObject({ isPublished: { equals: true } })
  })
})

describe('серверная проверка вывода — защита от накрутки', () => {
  it('несовпадающий вывод не засчитывается', async () => {
    const response = await POST(post({ taskId: 'task-1', userCode: 'x', output: 'неправильно' }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ passed: false })
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('эталон берётся из БД, а не из запроса', async () => {
    const response = await POST(
      post({ taskId: 'task-1', userCode: 'x', output: 'что угодно', expectedOutput: 'что угодно' }),
    )

    expect(response.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })

  it('к выводу применяется та же нормализация, что и на клиенте', async () => {
    const response = await POST(post({ taskId: 'task-1', userCode: 'x', output: '\r\n 42  \n' }))

    expect(response.status).toBe(200)
  })
})

describe('запись прогресса', () => {
  it('первое решение создаёт запись с attempts = 1', async () => {
    const response = await POST(post({ taskId: 'task-1', userCode: 'решение', output: '42' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ success: true, created: true })

    const [[args]] = create.mock.calls
    expect(args.collection).toBe('user-trainer-progress')
    expect(args.data).toMatchObject({
      user: USER.id,
      isCompleted: true,
      userCode: 'решение',
      attempts: 1,
    })
    expect(args.data.completedAt).toEqual(expect.any(String))
  })

  it('id задачи пишется числом из БД, а не строкой из запроса', () => {
    // Поле связи в Postgres — integer: строка проходит проверку типов через
    // приведение, но Payload отвергает её при записи
    expect.hasAssertions()
    return POST(post({ taskId: String(TASK.id), userCode: 'x', output: '42' })).then(() => {
      const [[args]] = create.mock.calls
      expect(args.data.task).toBe(TASK.id)
      expect(typeof args.data.task).toBe('number')
    })
  })

  it('повторное решение обновляет запись и увеличивает счётчик попыток', async () => {
    find.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === 'trainer-tasks'
        ? findResult([TASK])
        : findResult([{ id: 'progress-1', attempts: 2 }]),
    )

    const response = await POST(post({ taskId: 'task-1', userCode: 'новое', output: '42' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ success: true, updated: true })
    expect(create).not.toHaveBeenCalled()

    const [[args]] = update.mock.calls
    expect(args.id).toBe('progress-1')
    expect(args.data).toMatchObject({ attempts: 3, isCompleted: true, userCode: 'новое' })
  })

  it('существующая запись ищется по паре пользователь+задача', async () => {
    await POST(post({ taskId: '17', userCode: 'x', output: '42' }))

    const progressQuery = find.mock.calls
      .map(([q]) => q)
      .find((q) => q.collection === 'user-trainer-progress')

    expect(progressQuery.where).toMatchObject({
      user: { equals: USER.id },
      task: { equals: '17' },
    })
  })

  it('запись всегда привязывается к пользователю из сессии', async () => {
    await POST(post({ taskId: 'task-1', userCode: 'x', output: '42', user: 'чужой-id' }))

    const [[args]] = create.mock.calls
    expect(args.data.user).toBe(USER.id)
  })
})

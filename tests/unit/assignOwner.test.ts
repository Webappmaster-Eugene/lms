import { describe, it, expect, vi } from 'vitest'

import { assignOwner } from '@/payload/hooks/assignOwner'

type HookArgs = Parameters<typeof assignOwner>[0]

async function run(args: {
  operation?: 'create' | 'update'
  user?: { id: number; role: string } | null
  data?: Record<string, unknown>
  originalDoc?: Record<string, unknown>
  skipHooks?: boolean
  actualRole?: string
}) {
  const data = args.data ?? {}
  return await assignOwner({
    operation: args.operation ?? 'create',
    data,
    originalDoc: args.originalDoc,
    req: { user: args.user ?? null, context: args.skipHooks ? { skipHooks: true } : {}, payload: { find: vi.fn(async () => ({ docs: [{ mode: 'assigned', role: args.actualRole ?? args.user?.role ?? 'student' }] })) } },
  } as unknown as HookArgs) as Record<string, unknown>
}

describe('владелец записи при создании', () => {
  it('студенту подставляется он сам', async () => {
    expect((await run({ user: { id: 5, role: 'student' } })).user).toBe(5)
  })

  it('админу тоже подставляется он сам — поле обязательное', async () => {
    expect((await run({ user: { id: 1, role: 'admin' } })).user).toBe(1)
  })

  it('админ может завести запись другому пользователю явно', async () => {
    expect((await run({ user: { id: 1, role: 'admin' }, data: { user: 42 } })).user).toBe(42)
  })

  it('студент не может записать прогресс на чужое имя', async () => {
    expect((await run({ user: { id: 5, role: 'student' }, data: { user: 42 } })).user).toBe(5)
  })
  it('устаревшая roleadmin не разрешает бывшему администратору подменить владельца', async () => {
    expect((await run({ user: { id: 5, role: 'admin' }, actualRole: 'student', data: { user: 42 } })).user).toBe(5)
  })
})

describe('владелец при обновлении', () => {
  it('студент не переписывает свою запись на другого пользователя', async () => {
    expect(
      (await run({ operation: 'update', user: { id: 5, role: 'student' }, data: { user: 42 }, originalDoc: { user: 5 } })).user,
    ).toBe(5)
  })

  it('владелец берётся из исходной записи, даже если она пришла развёрнутой', async () => {
    expect(
      (await run({ operation: 'update', user: { id: 5, role: 'student' }, data: { user: 42 }, originalDoc: { user: { id: 5 } } })).user,
    ).toBe(5)
  })

  it('админ может передать запись другому пользователю', async () => {
    expect(
      (await run({ operation: 'update', user: { id: 1, role: 'admin' }, data: { user: 42 }, originalDoc: { user: 5 } })).user,
    ).toBe(42)
  })

  it('обновление без поля user его не добавляет', async () => {
    expect((await run({ operation: 'update', user: { id: 5, role: 'student' }, data: { content: 'x' }, originalDoc: { user: 5 } }))).not.toHaveProperty('user')
  })
})

describe('когда хук не вмешивается', () => {
  it('вызовы из других хуков (skipHooks) проходят как есть', async () => {
    expect((await run({ user: { id: 5, role: 'student' }, data: { user: 42 }, skipHooks: true })).user).toBe(42)
  })

  it('без авторизации поле не заполняется — запись отвергнет валидация', async () => {
    expect((await run({ user: null })).user).toBeUndefined()
  })
})

import { describe, it, expect } from 'vitest'

import { assignOwner } from '@/payload/hooks/assignOwner'

type HookArgs = Parameters<typeof assignOwner>[0]

function run(args: {
  operation?: 'create' | 'update'
  user?: { id: number; role: string } | null
  data?: Record<string, unknown>
  skipHooks?: boolean
}) {
  const data = args.data ?? {}
  return assignOwner({
    operation: args.operation ?? 'create',
    data,
    req: { user: args.user ?? null, context: args.skipHooks ? { skipHooks: true } : {} },
  } as unknown as HookArgs) as Record<string, unknown>
}

describe('владелец записи при создании', () => {
  it('студенту подставляется он сам', () => {
    expect(run({ user: { id: 5, role: 'student' } }).user).toBe(5)
  })

  it('админу тоже подставляется он сам — поле обязательное', () => {
    expect(run({ user: { id: 1, role: 'admin' } }).user).toBe(1)
  })

  it('админ может завести запись другому пользователю явно', () => {
    expect(run({ user: { id: 1, role: 'admin' }, data: { user: 42 } }).user).toBe(42)
  })

  it('студент не может записать прогресс на чужое имя', () => {
    expect(run({ user: { id: 5, role: 'student' }, data: { user: 42 } }).user).toBe(5)
  })
})

describe('когда хук не вмешивается', () => {
  it('при обновлении владелец не переписывается', () => {
    expect(run({ operation: 'update', user: { id: 5, role: 'student' }, data: { user: 42 } }).user).toBe(42)
  })

  it('вызовы из других хуков (skipHooks) проходят как есть', () => {
    expect(run({ user: { id: 5, role: 'student' }, data: { user: 42 }, skipHooks: true }).user).toBe(42)
  })

  it('без авторизации поле не заполняется — запись отвергнет валидация', () => {
    expect(run({ user: null }).user).toBeUndefined()
  })
})

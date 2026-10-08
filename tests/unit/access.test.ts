import { describe, it, expect, vi } from 'vitest'
import type { Access } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'
import { isAuthenticated } from '@/payload/access/isAuthenticated'

type AccessArgs = Parameters<Access>[0]
type TestUser = { id: string | number; role?: string }

// Проверяемым функциям из PayloadRequest нужен только user
function args(user: TestUser | null, actualRole = user?.role === 'admin' ? 'admin' : 'student'): AccessArgs {
  return { req: { user, payload: { find: vi.fn(async () => ({ docs: [{ role: actualRole, mode: 'assigned' }] })) } } } as unknown as AccessArgs
}

describe('isAuthenticated', () => {
  it('аноним не проходит', () => {
    expect(isAuthenticated(args(null))).toBe(false)
  })

  it('любой вошедший пользователь проходит', () => {
    expect(isAuthenticated(args({ id: 1, role: 'student' }))).toBe(true)
  })

  it('возвращает boolean, а не сам объект пользователя', () => {
    expect(typeof isAuthenticated(args({ id: 1 }))).toBe('boolean')
  })
})

describe('isAdmin', () => {
  it('аноним не проходит', async () => {
    expect(await isAdmin(args(null))).toBe(false)
  })

  it('обычный пользователь не проходит', async () => {
    expect(await isAdmin(args({ id: 7, role: 'student' }))).toBe(false)
  })

  it('пользователь без роли не проходит', async () => {
    expect(await isAdmin(args({ id: 7 }))).toBe(false)
  })

  it('админ проходит', async () => {
    expect(await isAdmin(args({ id: 1, role: 'admin' }))).toBe(true)
  })

  it('старая roleadmin в Local DTO не отменяет текущую рольstudent в независимой политике', async () => {
    expect(await isAdmin(args({ id: 1, role: 'admin' }, 'student'))).toBe(false)
    expect(await isAdmin({ req: { user: { id: 1, role: 'admin' } } } as unknown as AccessArgs)).toBe(false)
  })
})

describe('isAdminOrSelf', () => {
  it('аноним не проходит', async () => {
    expect(await isAdminOrSelf(args(null))).toBe(false)
  })

  it('админ получает безусловный доступ', async () => {
    expect(await isAdminOrSelf(args({ id: 1, role: 'admin' }))).toBe(true)
  })

  it('обычный пользователь получает ограничение по своему id, а не true', async () => {
    const result = await isAdminOrSelf(args({ id: 42, role: 'student' }))

    expect(result).not.toBe(true)
    expect(result).toEqual({ user: { equals: 42 } })
  })

  it('ограничение строится по id из запроса', async () => {
    expect(await isAdminOrSelf(args({ id: 'abc', role: 'student' }))).toEqual({
      user: { equals: 'abc' },
    })
  })

  it('бывший админ получает только собственные записи, даже с устаревшим Local DTO', async () => {
    expect(await isAdminOrSelf(args({ id: 42, role: 'admin' }, 'student'))).toEqual({ user: { equals: 42 } })
  })
})

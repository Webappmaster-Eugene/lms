import { describe, it, expect } from 'vitest'
import type { Access } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'
import { isAuthenticated } from '@/payload/access/isAuthenticated'

type AccessArgs = Parameters<Access>[0]
type TestUser = { id: string | number; role?: string }

// Проверяемым функциям из PayloadRequest нужен только user
function args(user: TestUser | null): AccessArgs {
  return { req: { user } } as unknown as AccessArgs
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
  it('аноним не проходит', () => {
    expect(isAdmin(args(null))).toBe(false)
  })

  it('обычный пользователь не проходит', () => {
    expect(isAdmin(args({ id: 7, role: 'student' }))).toBe(false)
  })

  it('пользователь без роли не проходит', () => {
    expect(isAdmin(args({ id: 7 }))).toBe(false)
  })

  it('админ проходит', () => {
    expect(isAdmin(args({ id: 1, role: 'admin' }))).toBe(true)
  })
})

describe('isAdminOrSelf', () => {
  it('аноним не проходит', () => {
    expect(isAdminOrSelf(args(null))).toBe(false)
  })

  it('админ получает безусловный доступ', () => {
    expect(isAdminOrSelf(args({ id: 1, role: 'admin' }))).toBe(true)
  })

  it('обычный пользователь получает ограничение по своему id, а не true', () => {
    const result = isAdminOrSelf(args({ id: 42, role: 'student' }))

    expect(result).not.toBe(true)
    expect(result).toEqual({ user: { equals: 42 } })
  })

  it('ограничение строится по id из запроса', () => {
    expect(isAdminOrSelf(args({ id: 'abc', role: 'student' }))).toEqual({
      user: { equals: 'abc' },
    })
  })
})

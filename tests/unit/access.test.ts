import { describe, it, expect } from 'vitest'
import type { Access } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'
import { isAuthenticated } from '@/payload/access/isAuthenticated'

/**
 * Права доступа — единственный слой, отделяющий чужой прогресс, заметки и сертификаты
 * от произвольного пользователя. Ошибка здесь не роняет приложение и не видна глазами:
 * страница открывается, данные отдаются, просто не те. Поэтому проверяется не «функция
 * что-то вернула», а точная форма результата.
 *
 * Особенно важен `isAdminOrSelf`: в Payload разница между `true` и query-ограничением
 * `{ user: { equals: id } }` — это разница между «видит всё» и «видит своё». Обе формы
 * считаются успехом и обе пропускают запрос дальше, так что подмена одной на другую
 * тестом на «доступ разрешён» не ловится.
 */

type AccessArgs = Parameters<Access>[0]
type TestUser = { id: string | number; role?: string }

/**
 * PayloadRequest в рантайме — большой объект с БД, локалями и транспортом. Проверяемым
 * функциям из него нужен только `user`, поэтому подставляется минимум: собирать полный
 * запрос значило бы поднимать половину Payload ради трёх веток if.
 */
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

  it('возвращает именно boolean, а не сам объект пользователя', () => {
    // Функция построена на Boolean(user). Если её однажды упростят до `return user`,
    // истинность сохранится, а Payload получит объект вместо признака доступа.
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
    // Роль может отсутствовать у записи, созданной в обход формы (сид, миграция).
    // Отсутствие роли обязано читаться как «не админ», а не как «проверить нечего».
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

  it('ограничение строится по id из запроса, а не по фиксированному значению', () => {
    expect(isAdminOrSelf(args({ id: 'abc', role: 'student' }))).toEqual({
      user: { equals: 'abc' },
    })
  })
})

import { afterEach, expect, it, vi } from 'vitest'
import { contentKey } from '@/lib/content-management/keys'

afterEach(() => vi.unstubAllGlobals())

it('создаёт валидный UUIDv4 и без secure-context randomUUID, сохраняя энтропию', () => {
  let calls = 0
  vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => {
    calls += 1
    bytes.fill(calls)
    return bytes
  } })
  const first = contentKey()
  const second = contentKey()
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(second).not.toBe(first)
  expect(calls).toBe(2)
})

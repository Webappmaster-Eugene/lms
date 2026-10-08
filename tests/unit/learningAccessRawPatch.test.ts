import { describe, expect, it } from 'vitest'
import type { CollectionBeforeOperationHook, PayloadRequest } from 'payload'

import { captureRawCollectionPatch, consumeRawCollectionPatch } from '@/payload/hooks/rawCollectionPatch'

const capture = (req: PayloadRequest, collection: string, id: number | undefined, data: Record<string, unknown>, overrideAccess = false) => captureRawCollectionPatch({ req, collection: { slug: collection }, operation: 'update', args: { data, ...(id === undefined ? {} : { id }) }, overrideAccess } as unknown as Parameters<CollectionBeforeOperationHook>[0])

describe('исходные поля PATCH до fallback Payload', () => {
  it('помнит присутствие ключей без значений и исключает undefined', () => {
    const req = {} as PayloadRequest
    const data: Record<string, unknown> = { firstName: 'Имя', avatar: null, learningAccessMode: undefined }
    capture(req, 'users', 7, data)
    data.learningAccessMode = 'all'
    const raw = consumeRawCollectionPatch(req, 'users', 7)
    expect([...raw?.keys ?? []]).toEqual(['firstName', 'avatar'])
    expect(raw?.overrideAccess).toBe(false)
    expect(raw).not.toHaveProperty('data')
    expect(consumeRawCollectionPatch(req, 'users', 7)).toBeNull()
  })

  it('не смешивает запросы, коллекции и IDs при вложенных серверных операциях', () => {
    const req = {} as PayloadRequest
    const other = {} as PayloadRequest
    capture(req, 'users', 7, { firstName: 'Имя' })
    capture(req, 'learning-access-grants', 7, { note: 'Комментарий' }, true)
    capture(req, 'users', 8, { totalPoints: 10 }, true)
    expect(consumeRawCollectionPatch(other, 'users', 7)).toBeNull()
    expect([...consumeRawCollectionPatch(req, 'users', 7)?.keys ?? []]).toEqual(['firstName'])
    expect([...consumeRawCollectionPatch(req, 'users', 8)?.keys ?? []]).toEqual(['totalPoints'])
    expect(consumeRawCollectionPatch(req, 'learning-access-grants', 7)?.overrideAccess).toBe(true)
  })

  it('одни исходные поля bulkupdate применяются к каждому отдельному документу', () => {
    const req = {} as PayloadRequest
    capture(req, 'users', undefined, { firstName: 'Имя' })
    expect([...consumeRawCollectionPatch(req, 'users', 7)?.keys ?? []]).toEqual(['firstName'])
    expect([...consumeRawCollectionPatch(req, 'users', 8)?.keys ?? []]).toEqual(['firstName'])
  })
})

import { describe, it, expect } from 'vitest'
import type { PayloadRequest } from 'payload'
import { childReq, skipHooksReq } from '@/lib/payload-req'

/**
 * Заглушка запроса: важно, что часть свойств лежит на прототипе — как у настоящего
 * PayloadRequest, который наследует Web Request (headers, url, метод json()).
 */
function makeReq(context: Record<string, unknown> = {}): PayloadRequest {
  const proto = {
    url: 'https://lms.local/api/user-progress',
    headers: new Headers({ 'content-type': 'application/json' }),
    method: 'POST',
  }
  const req = Object.create(proto) as PayloadRequest & { transactionID?: string }
  req.context = context
  req.transactionID = 'tx-1'
  return req
}

describe('childReq', () => {
  it('не мутирует контекст родительского запроса', () => {
    const req = makeReq()
    const child = skipHooksReq(req)

    expect(child.context.skipHooks).toBe(true)
    expect(req.context.skipHooks).toBeUndefined()
  })

  it('повторная эмуляция Payload: мутация потомка не достаёт до родителя', () => {
    const req = makeReq()
    const child = skipHooksReq(req)

    // Payload внутри операции делает req.context = { ...req.context, ...context }
    child.context = { ...child.context, transactionScoped: true }

    expect(req.context).toEqual({})
  })

  it('сохраняет транзакцию и наследуемые через прототип свойства', () => {
    const req = makeReq()
    const child = skipHooksReq(req) as PayloadRequest & { transactionID?: string }

    expect(child.transactionID).toBe('tx-1')
    expect(child.url).toBe('https://lms.local/api/user-progress')
    expect(child.method).toBe('POST')
    expect(child.headers.get('content-type')).toBe('application/json')
  })

  it('сохраняет уже выставленный родителем контекст', () => {
    const req = makeReq({ importRun: 'yandex-disk' })
    const child = skipHooksReq(req)

    expect(child.context).toEqual({ importRun: 'yandex-disk', skipHooks: true })
  })

  it('childReq принимает произвольный контекст', () => {
    const req = makeReq()
    const child = childReq(req, { skipHooks: true, source: 'import' })

    expect(child.context).toEqual({ skipHooks: true, source: 'import' })
    expect(req.context).toEqual({})
  })
})

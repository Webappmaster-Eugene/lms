import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { runNext, handleNextProxy, closeNextLease, closeNextSessions } from '../next-runtime.mjs'

const enabled = process.env.TRAINER_RUNTIME_INTEGRATION === '1'

test('Next: SSR, hydration, route handlers, query, native CSS, hidden tests and leased preview', { skip: !enabled, timeout: 180_000 }, async () => {
  const files = {
    'app/layout.tsx': `import './globals.css'
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="ru"><body>{children}</body></html> }`,
    'app/globals.css': 'body { margin: 0 } button { cursor: pointer }',
    'components/Counter.module.css': '.nativeStyle { color: red; display: grid; gap: 16px }',
    'app/page.tsx': `import Counter from '../components/Counter'
export default async function Page() {
  await Promise.resolve()
  return <main><h1>SSR ready</h1><Counter /></main>
}`,
    'components/Counter.tsx': `"use client"
import { useEffect, useState } from 'react'
import styles from './Counter.module.css'
export default function Counter() {
  const [count, setCount] = useState(0)
  const [message, setMessage] = useState('waiting')
  useEffect(() => {
    window.getComputedStyle = (() => ({ getPropertyValue: () => 'rgb(0, 0, 255)' })) as unknown as typeof window.getComputedStyle
    CSSStyleDeclaration.prototype.getPropertyValue = () => 'rgb(0, 0, 255)'
  }, [])
  return <>
    <button id="counter" onClick={() => setCount(count + 1)}>{count}</button>
    <button id="request" onClick={async () => {
      const response = await fetch('/api/hello')
      setMessage((await response.json()).message)
    }}>API</button>
    <p id="api">{message}</p>
    <p id="native-style" className={styles.nativeStyle}>Native CSS</p>
  </>
}`,
    'app/api/hello/route.ts': `export async function GET() { return Response.json({ message: 'route works' }) }
export async function POST(request: Request) {
  const input = await request.json()
  return Response.json({ message: String(input.message).toUpperCase() })
}`,
    'app/details/page.tsx': `export default async function Details({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = await searchParams
  return <main><h1>Details: {query.q}</h1><div id="viewport" style={{ width: '100vw' }}>Viewport</div></main>
}`,
    'app/section/[...slug]/page.tsx': `export default async function Section({ params }: { params: Promise<{ slug: string[] }> }) {
  const input = await params
  return <h1>Section: {input.slug.join('/')}</h1>
}`,
  }
  let server
  try {
    const outcome = await runNext({ language: 'next', code: JSON.stringify(files), timeLimitMs: 5000, includePreview: true, cases: [
      { name: 'SSR, counter, API and native style', hidden: false, checks: [
        { selector: 'h1', text: 'SSR ready' },
        { selector: '#counter', action: 'click' },
        { selector: '#counter', text: '1' },
        { selector: '#request', action: 'click' },
        { selector: '#api', text: 'route works' },
        { selector: '#native-style', css: { color: 'rgb(255, 0, 0)', gap: '16px' } },
      ] },
      { name: 'Nested route and query', hidden: false, path: '/details?q=proof', viewport: { width: 480, height: 800 }, checks: [{ selector: 'h1', text: 'Details: proof' }, { selector: '#viewport', css: { width: '480px' } }] },
      { name: 'Catch-all route', hidden: false, path: '/section/one/two', checks: [{ selector: 'h1', text: 'Section: one/two' }] },
      { name: 'private-case-name', hidden: true, checks: [{ selector: '#native-style', css: { color: 'rgb(0, 0, 255)' } }, { selector: 'h1', text: 'private-expected-value' }] },
    ] })
    assert.equal(outcome.result.tests[0].passed, true, JSON.stringify(outcome.result.tests[0]))
    assert.equal(outcome.result.tests[1].passed, true, JSON.stringify(outcome.result.tests[1]))
    assert.equal(outcome.result.tests[2].passed, true, JSON.stringify(outcome.result.tests[2]))
    assert.equal(outcome.result.tests[3].passed, false)
    assert.equal(outcome.result.status, 'failed')
    assert.equal(outcome.result.passedCount, 3)
    assert.equal(outcome.result.totalCount, 4)
    assert.ok(!JSON.stringify(outcome.result).includes('private-case-name'))
    assert.ok(!JSON.stringify(outcome.result).includes('private-expected-value'))
    assert.match(outcome.preview.leaseToken, /^[a-f0-9]{64}$/)
    assert.ok(outcome.preview.expiresAt <= Date.now() + 60_000)

    server = createServer((request, response) => {
      void handleNextProxy(request, response).catch(() => { response.writeHead(500); response.end() })
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const prefix = `http://127.0.0.1:${address.port}/next/preview/${outcome.preview.leaseToken}`
    const preview = await fetch(prefix + '/')
    assert.equal(preview.status, 200)
    assert.match(await preview.text(), /SSR ready/)
    assert.equal(preview.headers.get('access-control-allow-origin'), 'null')
    assert.equal(preview.headers.get('set-cookie'), null)
    const api = await fetch(prefix + '/api/hello')
    assert.equal(api.status, 200)
    assert.deepEqual(await api.json(), { message: 'route works' })
    const post = await fetch(prefix + '/api/hello', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'posted' }) })
    assert.equal(post.status, 200)
    assert.deepEqual(await post.json(), { message: 'POSTED' })
    assert.equal(await closeNextLease(outcome.preview.leaseToken), true)
    assert.equal((await fetch(prefix + '/')).status, 404)
  } finally {
    await closeNextSessions()
    if (server) await new Promise((resolve) => server.close(resolve))
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { createRuntimeServer } from '../server.mjs'
import { runtimeConcurrency } from '../runtime-limits.mjs'

test('runtime concurrency only permits bounded host capacity', () => {
  assert.equal(runtimeConcurrency(''), 2)
  assert.equal(runtimeConcurrency('1'), 1)
  assert.equal(runtimeConcurrency('2'), 2)
  for (const value of ['0', '3', '-1', '1.5', 'NaN']) assert.throws(() => runtimeConcurrency(value))
})
import { sandboxArgs } from '../gateway.mjs'
import { InputError, parseFiles, validateRequest } from '../validation.mjs'
import { readFile } from 'node:fs/promises'

const token = 'local-test-token-only-01234567890123456789'
const goRequest = { language: 'go', code: 'package main\nfunc main(){}', cases: [{ name: 'Пусто', hidden: false, input: '', expected: '' }], timeLimitMs: 1000 }

test('job isolation has no network, privilege, writable root or host mounts', () => {
  const args = sandboxArgs('job', 'image')
  for (const [name, value] of [['--network', 'none'], ['--cap-drop', 'ALL'], ['--security-opt', 'no-new-privileges'], ['--user', '10001:10001'], ['--pids-limit', '128']]) assert.equal(args[args.indexOf(name) + 1], value)
  assert.ok(args.includes('--read-only'))
  assert.ok(args.includes('--memory'))
  assert.ok(args.includes('--cpus'))
  assert.equal(args.includes('--privileged'), false)
  assert.equal(args.includes('-v'), false)
  assert.equal(args.includes('--mount'), false)
})

test('all job entrypoints have an independent process lifetime watchdog', async () => {
  const base = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8')
  const next = await readFile(new URL('../Dockerfile.next', import.meta.url), 'utf8')
  for (const [source, worker] of [[base, 'go-worker.mjs'], [base, 'frontend-worker.mjs'], [next, 'next-worker.mjs']]) {
    assert.ok(source.includes(`ENTRYPOINT ["/usr/bin/timeout", "--signal=KILL", "180s", "node", "/runtime/${worker}"]`), worker)
  }
})

test('rejects traversal, secret filenames, oversized input and empty grading', () => {
  for (const file of ['../secret.js', '/etc/file.js', 'a/../../b.js', '.env']) {
    assert.throws(() => parseFiles(JSON.stringify({ [file]: '' })), InputError)
  }
  assert.throws(() => validateRequest({ ...goRequest, cases: [] }), InputError)
  assert.throws(() => validateRequest({ ...goRequest, code: 'x'.repeat(20001) }), InputError)
  assert.throws(() => validateRequest({ ...goRequest, timeLimitMs: 100000 }), InputError)
  assert.equal(validateRequest({ ...goRequest, cases: [], allowNoTests: true }).allowNoTests, true)
  assert.throws(() => validateRequest({ language: 'react', code: '{"App.jsx":""}', cases: [], allowNoTests: true }), InputError)
})

test('allows App Router dynamic segments but blocks network/import paths', () => {
  assert.deepEqual(parseFiles('{"app/(learn)/[slug]/page.tsx":"export default function P(){}"}'), { 'app/(learn)/[slug]/page.tsx': 'export default function P(){}' })
  assert.throws(() => parseFiles('{"https://evil.test/code.js":""}'), InputError)
  assert.deepEqual(parseFiles('{"components/Button.module.css":".button{color:red}"}'), { 'components/Button.module.css': '.button{color:red}' })
  for (const name of ['./App.jsx', 'components/../App.jsx', 'components/.private/App.jsx']) assert.throws(() => parseFiles(JSON.stringify({ [name]: '' })), InputError)
})

test('gateway authenticates before reading user code and propagates overload', async () => {
  let calls = 0
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const server = createRuntimeServer({ token, maxConcurrent: 1, run: async () => { calls += 1; await gate; return { status: 'passed' } } })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const endpoint = `http://127.0.0.1:${server.address().port}`
  try {
    const unauthorized = await fetch(`${endpoint}/run`, { method: 'POST', body: JSON.stringify(goRequest) })
    assert.equal(unauthorized.status, 401)
    assert.equal(calls, 0)
    const released = await fetch(`${endpoint}/next/lease/${'a'.repeat(64)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
    assert.equal(released.status, 200)
    assert.equal((await released.json()).released, false)
    const first = fetch(`${endpoint}/run`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(goRequest) })
    while (calls === 0) await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await fetch(`${endpoint}/run`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(goRequest) })
    assert.equal(second.status, 503)
    assert.equal((await second.json()).overloaded, true)
    release()
    assert.equal((await first).status, 200)
    const invalid = await fetch(`${endpoint}/run`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: '{}' })
    assert.equal(invalid.status, 400)
  } finally {
    release()
    await new Promise((resolve) => server.close(resolve))
  }
})

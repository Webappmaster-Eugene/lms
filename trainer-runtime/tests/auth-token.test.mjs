import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { initializeRuntimeToken, readRuntimeToken } from '../auth-token.mjs'

const owner = { uid: process.getuid(), gid: process.getgid() }
const tokenModule = fileURLToPath(new URL('../auth-token.mjs', import.meta.url))

function workspace(t) {
  const directory = mkdtempSync(join(os.tmpdir(), 'lms-token-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

test('private token is random, remains stable on redeploy and leaves no temporary files', t => {
  const directory = workspace(t)
  const file = join(directory, 'token')
  const first = initializeRuntimeToken(file, owner)
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.equal(initializeRuntimeToken(file, owner), first)
  assert.equal(readRuntimeToken(file), first)
  assert.equal(statSync(file).mode & 0o777, 0o440)
  assert.deepEqual(readdirSync(directory), ['token'])
  assert.notEqual(initializeRuntimeToken(join(directory, 'other'), owner), first)
})

for (const mode of [0o444, 0o460]) {
  test(`refuses token file with insecure permissions ${mode.toString(8)}`, t => {
    const file = join(workspace(t), 'token')
    initializeRuntimeToken(file, owner)
    chmodSync(file, mode)
    assert.throws(() => readRuntimeToken(file), /Недопустимый файл/)
  })
}

test('refuses symlink and preserves its external target', t => {
  const directory = workspace(t)
  const external = join(directory, 'external')
  initializeRuntimeToken(external, owner)
  const original = readFileSync(external, 'utf8')
  symlinkSync(external, join(directory, 'token'))
  assert.throws(() => initializeRuntimeToken(join(directory, 'token'), owner), /Недопустимый файл/)
  assert.equal(readFileSync(external, 'utf8'), original)
  assert.deepEqual(readdirSync(directory).sort(), ['external', 'token'])
})

test('refuses invalid existing key without replacing it or exposing its content', t => {
  const directory = workspace(t)
  const file = join(directory, 'token')
  const invalid = 'private-invalid-content'
  writeFileSync(file, invalid, { mode: 0o440 })
  assert.throws(() => initializeRuntimeToken(file, owner), error => error.message === 'Некорректный токен тренажёра' && !error.message.includes(invalid))
  assert.equal(readFileSync(file, 'utf8'), invalid)
  assert.deepEqual(readdirSync(directory), ['token'])
})

test('concurrent initializers atomically share one complete token', async t => {
  const directory = workspace(t)
  const file = join(directory, 'token')
  const source = `import {initializeRuntimeToken} from ${JSON.stringify(`file://${tokenModule}`)};initializeRuntimeToken(${JSON.stringify(file)},${JSON.stringify(owner)})`
  await Promise.all(Array.from({ length: 4 }, () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: 'ignore' })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Initializer failed')))
  })))
  assert.match(readRuntimeToken(file), /^[a-f0-9]{64}$/)
  assert.deepEqual(readdirSync(directory), ['token'])
})

function appFiles(directory) {
  const entry = join(directory, 'scripts', 'trainer-app-start.mjs')
  mkdirSync(dirname(entry), { recursive: true })
  mkdirSync(join(directory, 'trainer-runtime'))
  copyFileSync(fileURLToPath(new URL('../../scripts/trainer-app-start.mjs', import.meta.url)), entry)
  copyFileSync(tokenModule, join(directory, 'trainer-runtime', 'auth-token.mjs'))
  writeFileSync(join(directory, 'package.json'), '{"type":"module"}')
  return entry
}

test('application loads private key into env before starting the server without printing it', t => {
  const directory = workspace(t)
  const file = join(directory, 'token')
  initializeRuntimeToken(file, owner)
  const entry = appFiles(directory)
  writeFileSync(join(directory, 'server.js'), "import {readFileSync} from 'node:fs';process.stdout.write(process.env.TRAINER_RUNTIME_TOKEN===readFileSync(process.env.TRAINER_RUNTIME_TOKEN_FILE,'utf8').trim()?'ready':'wrong')")
  const result = spawnSync(process.execPath, [entry], { encoding: 'utf8', env: { TRAINER_RUNTIME_TOKEN_FILE: file } })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, 'ready')
  assert.equal(result.stderr, '')
})

test('explicit environment token retains precedence over file', t => {
  const directory = workspace(t)
  const entry = appFiles(directory)
  writeFileSync(join(directory, 'server.js'), "process.stdout.write(process.env.TRAINER_RUNTIME_TOKEN==='explicit-test-placeholder'?'ready':'wrong')")
  const result = spawnSync(process.execPath, [entry], { encoding: 'utf8', env: { TRAINER_RUNTIME_TOKEN: 'explicit-test-placeholder', TRAINER_RUNTIME_TOKEN_FILE: '/missing/private-file' } })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, 'ready')
})

test('invalid credential prevents server startup', t => {
  const directory = workspace(t)
  const entry = appFiles(directory)
  const marker = join(directory, 'started')
  writeFileSync(join(directory, 'server.js'), `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'yes')`)
  const result = spawnSync(process.execPath, [entry], { encoding: 'utf8', env: { TRAINER_RUNTIME_TOKEN_FILE: '/missing/private-file' } })
  assert.notEqual(result.status, 0)
  assert.equal(existsSync(marker), false)
  assert.equal(result.stdout, '')
})

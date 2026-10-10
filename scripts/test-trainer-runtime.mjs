import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRuntimeServer } from '../trainer-runtime/server.mjs'
import { closeNextSessions } from '../trainer-runtime/next-runtime.mjs'

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} завершился с кодом ${code}`)))
  })
}

let buildx
let server
try {
  if (process.argv.includes('--build')) {
    buildx = await mkdtemp(path.join(os.tmpdir(), 'lms-runtime-buildx-'))
    const env = { ...process.env, BUILDX_CONFIG: buildx }
    await run('docker', ['build', '--target', 'go-job', '-t', process.env.TRAINER_GO_JOB_IMAGE || 'lms-trainer-go:local', 'trainer-runtime'], env)
    await run('docker', ['build', '--target', 'frontend-job', '-t', process.env.TRAINER_FRONTEND_JOB_IMAGE || 'lms-trainer-frontend:local', 'trainer-runtime'], env)
    await run('docker', ['build', '-f', 'trainer-runtime/Dockerfile.next', '-t', process.env.TRAINER_NEXT_JOB_IMAGE || 'lms-trainer-next:local', 'trainer-runtime'], env)
  }
  const checks = (await readdir('trainer-runtime/tests')).filter((name) => name.endsWith('.test.mjs')).map((name) => `trainer-runtime/tests/${name}`)
  await run(process.execPath, ['--test', '--test-concurrency=1', ...checks], { ...process.env, TRAINER_RUNTIME_INTEGRATION: '1' })
  const token = randomBytes(32).toString('hex')
  server = createRuntimeServer({ token })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Не удалось открыть тестовый runtime')
  await run('pnpm', ['exec', 'vitest', 'run', '-c', 'vitest.runtime.config.ts', ...process.argv.slice(2).filter((value) => value !== '--build')], {
    ...process.env, TRAINER_RUNTIME_URL: `http://127.0.0.1:${address.port}`, TRAINER_RUNTIME_TOKEN: token,
  })
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Не удалось проверить runtime')
  process.exitCode = 1
} finally {
  await closeNextSessions()
  server?.closeAllConnections()
  if (server) await new Promise((resolve) => server.close(resolve))
  if (buildx) await rm(buildx, { recursive: true, force: true })
}

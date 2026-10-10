import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

export class InfrastructureError extends Error {}

const images = {
  go: process.env.TRAINER_GO_JOB_IMAGE || 'lms-trainer-go:local',
  frontend: process.env.TRAINER_FRONTEND_JOB_IMAGE || 'lms-trainer-frontend:local',
}

export function sandboxArgs(name, image, memory = '512m') {
  return ['run', '--rm', '--pull', 'never', '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '128', '--cpus', '1', '--memory', memory, '--memory-swap', memory, '--user', '10001:10001', '--tmpfs', '/tmp:rw,nosuid,nodev,exec,size=536870912,uid=10001,gid=10001', '--shm-size', '128m', '--log-driver', 'none', '-i', image]
}

async function removeContainer(name) {
  await new Promise((resolve) => {
    const cleanup = spawn('docker', ['rm', '-f', name], { stdio: 'ignore' })
    const timer = setTimeout(() => { cleanup.kill('SIGKILL'); resolve() }, 5000)
    cleanup.on('error', () => { clearTimeout(timer); resolve() })
    cleanup.on('close', () => { clearTimeout(timer); resolve() })
  })
}

export async function dockerJob(image, input, { timeoutMs = 15000, maxBytes = 512 * 1024, memory = '512m' } = {}) {
  const name = `lms-trainer-job-${randomUUID()}`
  const started = performance.now()
  const child = spawn('docker', sandboxArgs(name, image, memory), { stdio: ['pipe', 'pipe', 'pipe'] })
  const stdout = []
  const stderr = []
  let bytes = 0
  let timedOut = false
  let outputLimit = false
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); void removeContainer(name) }, timeoutMs)
  for (const [stream, chunks] of [[child.stdout, stdout], [child.stderr, stderr]]) {
    stream.on('data', (chunk) => {
      bytes += chunk.length
      if (bytes <= maxBytes) chunks.push(chunk)
      else if (!outputLimit) { outputLimit = true; child.kill('SIGKILL'); void removeContainer(name) }
    })
  }
  child.stdin.on('error', () => {})
  child.stdin.end(JSON.stringify(input))
  let exitCode
  try {
    exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve) })
  } catch {
    throw new InfrastructureError('Не удалось запустить Docker runtime')
  } finally {
    clearTimeout(timer)
    await removeContainer(name)
  }
  if ([125, 126, 127].includes(exitCode)) throw new InfrastructureError('Sandbox image недоступен или Docker не готов')
  return { stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), exitCode, timedOut, outputLimit, durationMs: performance.now() - started }
}

function result(status, tests, started, error, consoleOutput = []) {
  return { status, tests, passedCount: tests.filter((test) => test.passed).length, totalCount: tests.length, consoleOutput, totalMs: performance.now() - started, ...(error ? { error } : {}) }
}

async function runGo(job) {
  const started = performance.now()
  const compiled = await dockerJob(images.go, { mode: 'compile', code: job.code }, { timeoutMs: 60000, maxBytes: 16 * 1024 * 1024, memory: '768m' })
  if (compiled.timedOut || compiled.outputLimit || compiled.exitCode === 124) return result('compile_error', [], started, compiled.timedOut || compiled.exitCode === 124 ? 'Go: превышен лимит времени компиляции' : 'Go: слишком большой результат компиляции')
  if (compiled.exitCode !== 0) throw new InfrastructureError('Компилятор Go завершился некорректно')
  let output
  try { output = JSON.parse(compiled.stdout) } catch { throw new InfrastructureError('Компилятор Go вернул некорректный ответ') }
  if (typeof output.error === 'string') return result('compile_error', [], started, output.error.slice(0, 1000))
  if (typeof output.binary !== 'string' || !/^[a-zA-Z0-9+/]*={0,2}$/.test(output.binary)) throw new InfrastructureError('Компилятор Go не вернул бинарный файл')
  const tests = []
  const cases = job.cases.length > 0 ? job.cases : [{ input: '' }]
  for (const [index, item] of cases.entries()) {
    const executed = await dockerJob(images.go, { mode: 'execute', binary: output.binary, input: item.input ?? '', timeLimitMs: job.timeLimitMs }, { timeoutMs: job.timeLimitMs + 5000, maxBytes: 32000, memory: '256m' })
    const timeout = executed.timedOut || executed.exitCode === 124
    if (job.cases.length === 0) return result(timeout ? 'timeout' : executed.exitCode === 0 && !executed.outputLimit ? 'passed' : 'error', [], started, timeout ? 'Превышен лимит времени' : executed.outputLimit ? 'Превышен лимит вывода' : executed.exitCode !== 0 ? executed.stderr.slice(0, 1000) || 'Go: ошибка исполнения' : undefined, executed.stdout.slice(0, 20000).split('\n').slice(0, 100))
    const passed = !timeout && !executed.outputLimit && executed.exitCode === 0 && executed.stdout.trimEnd() === item.expected.trimEnd()
    tests.push({ name: item.hidden ? `Скрытый тест ${index + 1}` : item.name, hidden: item.hidden, passed, durationMs: executed.durationMs,
      ...(!item.hidden ? { input: item.input ?? '', expected: item.expected, actual: executed.stdout.slice(0, 8000) } : {}),
      ...(!passed ? { message: item.hidden ? 'Скрытая проверка не пройдена' : timeout ? 'Превышен лимит времени' : executed.outputLimit ? 'Превышен лимит вывода' : executed.exitCode !== 0 ? executed.stderr.slice(0, 600) || 'Go: ошибка исполнения' : 'Вывод не совпадает с ожидаемым' } : {}),
    })
    if (performance.now() - started > 110000) {
      for (const remaining of job.cases.slice(index + 1)) tests.push({ name: remaining.hidden ? 'Скрытый тест' : remaining.name, hidden: remaining.hidden, passed: false, durationMs: 0, message: 'Превышен общий лимит времени' })
      return result('timeout', tests, started, 'Превышен общий лимит времени проверки')
    }
  }
  return result(tests.every((test) => test.passed) ? 'passed' : 'failed', tests, started)
}

async function runFrontend(job, preview) {
  const executed = await dockerJob(images.frontend, { ...job, files: JSON.parse(job.code), code: undefined, preview }, { timeoutMs: Math.min(115000, 10000 + job.cases.length * (job.timeLimitMs + 1000)), memory: '1024m', maxBytes: preview || job.includePreview ? 2 * 1024 * 1024 : 128 * 1024 })
  if (executed.timedOut || executed.outputLimit) return result('timeout', [], performance.now(), 'Превышен лимит времени или размера результата')
  if (executed.exitCode !== 0) throw new InfrastructureError('Браузерный runtime завершился некорректно')
  try { return JSON.parse(executed.stdout) } catch { throw new InfrastructureError('Браузерный runtime вернул некорректный ответ') }
}

export async function runJob(job, preview = false) {
  if (job.language === 'next') {
    const next = await import('./next-runtime.mjs')
    return preview ? next.previewNext(job, dockerJob) : next.runNext(job, dockerJob)
  }
  return job.language === 'go' ? runGo(job) : runFrontend(job, preview)
}

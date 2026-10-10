import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'

let input = ''
for await (const chunk of process.stdin) input += chunk
const job = JSON.parse(input)
// PID 1 watchdog remains independent if the gateway or this worker stops.
const hardTimer = setTimeout(() => process.exit(124), 65000)
hardTimer.unref()

await writeFile('/tmp/main.py', job.code)
const python = '/usr/local/bin/python3'
const isolatedOptions = ['-I', '-S', '-X', 'utf8']

if (job.mode === 'compile') {
  // Syntax validation must not execute top-level student statements.
  const child = spawn(python, [...isolatedOptions, '-c', 'compile(open("/tmp/main.py", encoding="utf-8").read(), "main.py", "exec")'], { cwd: '/tmp', env: {}, stdio: ['ignore', 'pipe', 'pipe'] })
  let diagnostic = ''
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { diagnostic = (diagnostic + chunk).slice(0, 8000) })
  const exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve) })
  process.stdout.write(JSON.stringify(exitCode === 0 ? { ok: true } : { error: diagnostic || 'Python: ошибка синтаксиса' }))
} else if (job.mode === 'execute') {
  const child = spawn(python, [...isolatedOptions, '-u', '/tmp/main.py'], { cwd: '/tmp', env: {}, stdio: ['pipe', 'inherit', 'inherit'] })
  child.stdin.on('error', () => {})
  child.stdin.end(job.input ?? '')
  const timer = setTimeout(() => { child.kill('SIGKILL'); process.exitCode = 124 }, job.timeLimitMs)
  child.on('error', (error) => { process.stderr.write(error.message); process.exitCode = 1 })
  child.on('exit', (code) => { clearTimeout(timer); if (process.exitCode !== 124) process.exitCode = code ?? 1 })
} else {
  throw new Error('Неизвестное задание Python')
}

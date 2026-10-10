import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

let input = ''
for await (const chunk of process.stdin) input += chunk
const job = JSON.parse(input)
// A gateway crash must not leave a compiler consuming runner resources forever.
const hardTimer = setTimeout(() => process.exit(124), 65000)
hardTimer.unref()

if (job.mode === 'compile') {
  await mkdir('/tmp/go-cache')
  const cache = spawn('cp', ['-as', '/opt/go-cache/.', '/tmp/go-cache'], { stdio: 'ignore' })
  const cacheStatus = await new Promise((resolve, reject) => { cache.on('error', reject); cache.on('exit', resolve) })
  if (cacheStatus !== 0) throw new Error('Не удалось подготовить кеш Go')
  await writeFile('/tmp/main.go', job.code)
  const child = spawn('go', ['build', '-trimpath', '-ldflags=-s -w', '-o', '/tmp/solution', '/tmp/main.go'], { cwd: '/tmp', stdio: ['ignore', 'pipe', 'pipe'] })
  let diagnostic = ''
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { diagnostic = (diagnostic + chunk).slice(0, 8000) })
  const exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve) })
  process.stdout.write(JSON.stringify(exitCode === 0 ? { binary: (await readFile('/tmp/solution')).toString('base64') } : { error: diagnostic || 'Go: ошибка компиляции' }))
} else if (job.mode === 'execute') {
  await writeFile('/tmp/solution', Buffer.from(job.binary, 'base64'), { mode: 0o700 })
  const child = spawn('/tmp/solution', [], { cwd: '/tmp', env: {}, stdio: ['pipe', 'inherit', 'inherit'] })
  child.stdin.on('error', () => {})
  child.stdin.end(job.input ?? '')
  const timer = setTimeout(() => { child.kill('SIGKILL'); process.exitCode = 124 }, job.timeLimitMs)
  child.on('error', (error) => { process.stderr.write(error.message); process.exitCode = 1 })
  child.on('exit', (code) => { clearTimeout(timer); if (process.exitCode !== 124) process.exitCode = code ?? 1 })
} else {
  throw new Error('Неизвестное задание Go')
}

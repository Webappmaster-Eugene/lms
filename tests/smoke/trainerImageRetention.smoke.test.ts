import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const compose = readFileSync(new URL('../../docker-compose.yml', import.meta.url), 'utf8')
const keeper = compose.match(/^x-trainer-image:[\s\S]*?(?=^services:)/m)?.[0] ?? ''

describe('сохранение образов сред тренажёра', () => {
  it('команда держателя остаётся запущенной и защищает образ от очистки неиспользуемых', async () => {
    const raw: unknown = JSON.parse(keeper.match(/entrypoint:\s*(\[[^\n]*\])/)?.[1] ?? 'null')
    if (!Array.isArray(raw) || !raw.every((value: unknown): value is string => typeof value === 'string') || raw[0] !== 'node') {
      throw new Error('У держателя образа нет команды Node')
    }
    const child = spawn(process.execPath, raw.slice(1), { stdio: 'ignore' })
    const closed = new Promise<void>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', () => resolve())
    })
    try {
      const state = await Promise.race([
        closed.then(() => 'exited'),
        new Promise<string>((resolve) => setTimeout(() => resolve('running'), 300)),
      ])
      expect(state).toBe('running')
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
      await closed
    }
    expect(keeper).toMatch(/restart:\s*unless-stopped/)
    expect(keeper).toMatch(/network_mode:\s*none/)
    expect(keeper).toMatch(/read_only:\s*true/)
  })

  it('gateway ждёт старта четырёх держателей, сохраняя ожидание инициализации авторизации', () => {
    const gateway = compose.match(/^ {2}lms-mentor-trainer-runtime:[\s\S]*?(?=^ {2}[a-z]|^volumes:)/m)?.[0] ?? ''
    for (const name of ['go', 'python', 'frontend', 'next']) {
      expect(gateway).toMatch(new RegExp(`lms-mentor-trainer-${name}-image:\\s*\\n\\s*condition:\\s*service_started`))
    }
    expect(gateway).toMatch(/lms-mentor-trainer-auth:\s*\n\s*condition:\s*service_completed_successfully/)
  })
})

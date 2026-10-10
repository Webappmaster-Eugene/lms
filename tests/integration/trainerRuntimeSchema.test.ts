import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { createAdmin, createStudent, createSumTask, getTestPayload, login, rest } from './helpers/payload'
import { saveTrainerProgress } from '@/lib/trainer/save-progress'
import type { TrainerLanguage, TrainerRunResult } from '@/lib/trainer/types'

let payload: Payload
beforeAll(async () => { payload = await getTestPayload() })

describe('миграция Go/frontend: PostgreSQL и настоящие field access Payload', () => {
  it('ученик получает шаблоны и public cases, скрытые данные и эталоны закрыты', async () => {
    const user = await createStudent(payload)
    const token = await login(payload, user)
    const task = await createSumTask(payload, {
      checkMode: 'dom', languages: ['html', 'react', 'next'],
      starterFiles: { 'index.html': '<h1>Шаблон</h1>' },
      solutionFiles: { 'index.html': '<h1>PRIVATE_FRONTEND_SOLUTION</h1>' },
      solutionCodeGo: 'PRIVATE_GO_SOLUTION',
      runtimeCases: [
        { name: 'Открытая проверка', hidden: false, checks: [{ selector: 'h1', text: 'Открыто' }], viewport: { width: 375, height: 640 }, path: '/' },
        { name: 'Скрытая проверка', hidden: true, input: 'PRIVATE_RUNTIME_INPUT', expected: 'PRIVATE_RUNTIME_EXPECTED', checks: [{ selector: '.PRIVATE_SELECTOR', text: 'PRIVATE_DOM_EXPECTED' }], viewport: { width: 640, height: 480 }, path: '/PRIVATE_PATH' },
      ],
    })
    const response = await rest('GET', `/trainer-tasks/${task.id}?depth=0`, { token })
    expect(response.status).toBe(200)
    const text = JSON.stringify(response.json)
    expect(text).not.toContain('PRIVATE_')
    expect(response.json).toMatchObject({ starterFiles: { 'index.html': '<h1>Шаблон</h1>' }, runtimeCases: [
      expect.objectContaining({ name: 'Открытая проверка', checks: [{ selector: 'h1', text: 'Открыто' }], path: '/' }),
      expect.objectContaining({ name: 'Скрытая проверка', hidden: true }),
    ] })
    const admin = await login(payload, await createAdmin(payload))
    const full = await rest('GET', `/trainer-tasks/${task.id}?depth=0`, { token: admin })
    expect(JSON.stringify(full.json)).toContain('PRIVATE_RUNTIME_EXPECTED')
    expect(JSON.stringify(full.json)).toContain('PRIVATE_FRONTEND_SOLUTION')
  })

  it.each<TrainerLanguage>(['go', 'html', 'react', 'next'])('сохраняет новый язык %s и начисляет баллы только один раз', async (language) => {
    const user = await createStudent(payload)
    const task = await createSumTask(payload, { languages: [language], checkMode: language === 'go' ? 'program' : 'dom', pointsReward: 17 })
    const result: TrainerRunResult = { status: 'passed', tests: [{ name: 'Серверная проверка', hidden: false, passed: true, durationMs: 1 }], passedCount: 1, totalCount: 1, consoleOutput: [], totalMs: 1 }
    const code = language === 'go' ? 'package main\nfunc main() {}' : '{"index.html":"<h1>Код</h1>"}'
    expect((await saveTrainerProgress({ payload, user, task, language, code, result })).awardedPoints).toBe(17)
    expect((await saveTrainerProgress({ payload, user, task, language, code, result })).awardedPoints).toBeNull()
    const rows = await payload.find({ collection: 'user-trainer-progress', where: { user: { equals: user.id }, task: { equals: task.id } }, depth: 0 })
    expect(rows.docs).toHaveLength(1)
    expect(rows.docs[0]).toMatchObject({ language, userCode: code, verifiedBy: 'server', isCompleted: true, attempts: 2 })
    expect((await payload.findByID({ collection: 'users', id: user.id })).totalPoints).toBe(17)
  })
})

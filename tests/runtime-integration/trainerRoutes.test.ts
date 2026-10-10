import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, type Payload } from 'payload'

import { POST as run } from '@/app/api/trainer/run/route'
import { POST as submit } from '@/app/api/trainer/submit/route'
import { createAdmin, createStudent, createSumTask, getTestPayload, login } from '../integration/helpers/payload'
import type { TrainerTask } from '@/payload-types'
import type { SubmitResponse } from '@/lib/trainer/api'
import type { TrainerLanguage, TrainerRunResult } from '@/lib/trainer/types'

let payload: Payload
let go: TrainerTask
let html: TrainerTask
let react: TrainerTask

const sum = 'package main\nimport "fmt"\nfunc main(){var a,b int;fmt.Scan(&a,&b);fmt.Println(a+b)}'
const fixed = 'package main\nimport "fmt"\nfunc main(){fmt.Println(3)}'
const htmlCode = JSON.stringify({ 'index.html': '<main><h1>Команда</h1><style>main {display:flex}</style></main>' })
const reactCode = JSON.stringify({ 'App.jsx': 'import {useState} from "react"; export default function App(){const[n,setN]=useState(0);return <main><output>{n}</output><button onClick={()=>setN(n+1)}>Плюс</button></main>}' })

function request(token: string | undefined, task: TrainerTask, language: TrainerLanguage, code: string, extra: Record<string, unknown> = {}) {
  return new Request('http://lms.test/api/trainer/submit', {
    method: 'POST', headers: { Origin: 'http://lms.test', 'Content-Type': 'application/json', ...(token ? { Authorization: `JWT ${token}` } : {}) },
    body: JSON.stringify({ taskId: task.id, language, code, ...extra }),
  })
}
async function student() {
  const user = await createStudent(payload)
  return { user, token: await login(payload, user) }
}
async function progress(user: number, task: number) {
  return payload.find({ collection: 'user-trainer-progress', depth: 0, where: { and: [{ user: { equals: user } }, { task: { equals: task } }] } })
}
async function ledger(user: number, task: number) {
  return payload.find({ collection: 'points-transactions', depth: 0, where: { and: [{ user: { equals: user } }, { reason: { equals: 'trainer_task_completed' } }, { relatedEntity: { equals: String(task) } }] } })
}

beforeAll(async () => {
  if (!process.env.TRAINER_RUNTIME_URL || !process.env.TRAINER_RUNTIME_TOKEN) throw new Error('Запустите pnpm test:integration:runtime: необходим настоящий HTTP gateway и Docker jobs')
  payload = await getTestPayload()
  go = await createSumTask(payload, { checkMode: 'program', languages: ['go'], pointsReward: 17, runtimeCases: [
    { name: 'Открытая сумма', hidden: false, input: '1 2', expected: '3\n' },
    { name: 'PRIVATE_CASE_NAME', hidden: true, input: '931399 57853 PRIVATE_INPUT_ONLY', expected: '989252\n' },
  ] })
  html = await createSumTask(payload, { checkMode: 'dom', languages: ['html'], pointsReward: 19, runtimeCases: [
    { name: 'Заголовок', hidden: false, checks: [{ selector: 'h1', text: 'Команда' }] },
    { name: 'PRIVATE_DOM_CASE', hidden: true, checks: [{ selector: 'main', css: { display: 'flex' } }] },
  ] })
  react = await createSumTask(payload, { checkMode: 'dom', languages: ['react'], pointsReward: 23, runtimeCases: [
    { name: 'Начальное значение', hidden: false, checks: [{ selector: 'output', text: '0' }] },
    { name: 'PRIVATE_INTERACTION', hidden: true, checks: [{ selector: 'button', action: 'click' }, { selector: 'button', action: 'click' }, { selector: 'output', text: '2' }] },
  ] })
})
afterAll(async () => {
  vi.unstubAllEnvs()
  await payload?.destroy()
})

describe('route handlers → HTTP gateway → изолят → настоящая PostgreSQL', () => {
  it('Go: публичные и собственные проверки исполняются, успех не пишет прогресс и XP', async () => {
    const { user, token } = await student()
    const response = await run(request(token, go, 'go', sum, { customCases: [{ name: 'Мой ввод', input: '3 4', expected: '7\n' }] }))
    expect(response.status).toBe(200)
    const body = await response.json() as { result: TrainerRunResult }
    expect(body.result).toMatchObject({ status: 'passed', totalCount: 2, passedCount: 2 })
    expect(body.result.tests.map(test => test.name)).toEqual(['Открытая сумма', 'Мой ввод'])
    expect((await progress(user.id, go.id)).totalDocs).toBe(0)
    expect((await ledger(user.id, go.id)).totalDocs).toBe(0)
    expect((await payload.findByID({ collection: 'users', id: user.id })).totalPoints).toBe(0)
  })

  it('Go: присланный passed не обходит скрытый тест; последующий настоящий успех начисляет XP однократно', async () => {
    const { user, token } = await student()
    const forged = await submit(request(token, go, 'go', fixed, { result: { status: 'passed' }, customCases: [], runtimeCases: [] }))
    expect(forged.status).toBe(200)
    const failed = await forged.json() as SubmitResponse
    expect(failed.result).toMatchObject({ status: 'failed', totalCount: 2, passedCount: 1 })
    expect(failed.completed).toBe(false)
    expect(failed.awardedPoints).toBeNull()
    expect(JSON.stringify(failed)).not.toMatch(/PRIVATE_CASE_NAME|PRIVATE_INPUT_ONLY|989252/)
    expect((await progress(user.id, go.id)).docs[0]).toMatchObject({ isCompleted: false, attempts: 1, failedAttempts: 1 })
    expect((await ledger(user.id, go.id)).totalDocs).toBe(0)
    for (const reward of [17, null]) {
      const response = await submit(request(token, go, 'go', sum))
      expect(response.status).toBe(200)
      const result = await response.json() as SubmitResponse
      expect(result.result.status).toBe('passed')
      expect(result.awardedPoints).toBe(reward)
    }
    expect((await progress(user.id, go.id)).docs).toEqual([expect.objectContaining({ language: 'go', verifiedBy: 'server', isCompleted: true, attempts: 3, failedAttempts: 1 })])
    expect((await ledger(user.id, go.id)).docs).toEqual([expect.objectContaining({ amount: 17 })])
    expect((await payload.findByID({ collection: 'users', id: user.id })).totalPoints).toBe(17)
  })

  it('HTML/CSS: preview не даёт зачёт, скрытый computed CSS проверяется сервером', async () => {
    const { user, token } = await student()
    const preview = await run(request(token, html, 'html', htmlCode))
    expect(preview.status).toBe(200)
    const output = await preview.json() as { result: TrainerRunResult; preview: { html: string } }
    expect(output.result).toMatchObject({ status: 'passed', totalCount: 1 })
    expect(output.preview.html).toContain('Команда')
    expect((await progress(user.id, html.id)).totalDocs).toBe(0)
    const wrong = JSON.stringify({ 'index.html': '<main><h1>Команда</h1></main>' })
    const failed = await submit(request(token, html, 'html', wrong, { result: { status: 'passed' } }))
    expect(failed.status).toBe(200)
    expect((await failed.json() as SubmitResponse).result).toMatchObject({ status: 'failed', totalCount: 2, passedCount: 1 })
    expect((await ledger(user.id, html.id)).totalDocs).toBe(0)
    const correct = await submit(request(token, html, 'html', htmlCode))
    expect(correct.status).toBe(200)
    expect(await correct.json()).toMatchObject({ completed: true, awardedPoints: 19, result: { status: 'passed' } })
    expect((await progress(user.id, html.id)).docs[0]).toMatchObject({ language: 'html', verifiedBy: 'server' })
  })

  it('React: Chromium исполняет обработчики, а скрытые клики определяют серверный зачёт', async () => {
    const { user, token } = await student()
    const inert = JSON.stringify({ 'App.jsx': 'export default function App(){return <main><output>0</output><button>Плюс</button></main>}' })
    const publicResult = await run(request(token, react, 'react', inert))
    expect(publicResult.status).toBe(200)
    expect((await publicResult.json()).result.status).toBe('passed')
    const rejected = await submit(request(token, react, 'react', inert))
    expect(rejected.status).toBe(200)
    expect((await rejected.json() as SubmitResponse).result.status).toBe('failed')
    expect((await ledger(user.id, react.id)).totalDocs).toBe(0)
    const accepted = await submit(request(token, react, 'react', reactCode))
    expect(accepted.status).toBe(200)
    expect(await accepted.json()).toMatchObject({ completed: true, awardedPoints: 23, result: { status: 'passed', totalCount: 2 } })
    expect((await progress(user.id, react.id)).docs[0]).toMatchObject({ language: 'react', verifiedBy: 'server' })
  })

  it('сбой конфигурации или HTTP auth gateway не превращается в прогресс или баллы', async () => {
    const { user, token } = await student()
    const previous = process.env.TRAINER_RUNTIME_TOKEN
    try {
      vi.stubEnv('TRAINER_RUNTIME_TOKEN', '')
      expect((await submit(request(token, go, 'go', sum))).status).toBe(503)
      expect((await run(request(token, html, 'html', htmlCode))).status).toBe(503)
      vi.stubEnv('TRAINER_RUNTIME_TOKEN', 'wrong-test-runtime-token-01234567890123456789')
      expect((await submit(request(token, go, 'go', sum))).status).toBe(503)
    } finally { vi.stubEnv('TRAINER_RUNTIME_TOKEN', previous) }
    expect((await progress(user.id, go.id)).totalDocs).toBe(0)
    expect((await progress(user.id, html.id)).totalDocs).toBe(0)
    expect((await ledger(user.id, go.id)).totalDocs).toBe(0)
    expect((await payload.findByID({ collection: 'users', id: user.id })).totalPoints).toBe(0)
  })

  it('auth, закрытые задачи и несовместимые языки отклоняются до выполнения', async () => {
    expect((await run(request(undefined, go, 'go', sum))).status).toBe(401)
    const { user, token } = await student()
    const draft = await createSumTask(payload, { isPublished: false, languages: ['go'], checkMode: 'program' })
    expect((await submit(request(token, draft, 'go', sum))).status).toBe(403)
    expect((await run(request(token, html, 'go', sum))).status).toBe(400)
    const admin = await createAdmin(payload)
    await payload.update({ collection: 'users', id: user.id, req: await createLocalReq({ user: admin }, payload), data: { trainerAccessMode: 'disabled' } })
    expect((await payload.findByID({ collection: 'users', id: user.id })).trainerAccessMode).toBe('disabled')
    expect((await run(request(token, go, 'go', sum))).status).toBe(403)
    expect((await submit(request(token, go, 'go', sum))).status).toBe(403)
    expect((await progress(user.id, go.id)).totalDocs).toBe(0)
  })
})

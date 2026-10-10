import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, type Payload } from 'payload'
import { POST } from '@/app/api/manage/trainer/metadata/route'
import { backfillTrainerMetadata } from '@/server/trainer/metadata-backfill'
import { createAdmin, createStudent, createSumTask, getTestPayload, login, rest } from './helpers/payload'

let payload: Payload
beforeAll(async () => { payload = await getTestPayload() })

describe('Python и метаданные: настоящий REST и PostgreSQL', () => {
  it('публичные метаданные и шаблон видны, Python-эталон и скрытый ввод закрыты', async () => {
    const user = await createStudent(payload)
    const token = await login(payload, user)
    const task = await createSumTask(payload, {
      languages: ['python'], checkMode: 'program', starterCodePython: 'print(0)', solutionCodePython: 'SECRET_PYTHON_REFERENCE',
      tags: ['python', 'hash-table'], companies: ['microsoft'], interviewFormat: 'algorithms', recommendedMinutes: 25,
      companyEvidence: [{ company: 'microsoft', kind: 'preparation', url: 'https://careers.microsoft.com/', note: 'Учебная адаптация, точная задача компании не подтверждена.', checkedAt: '2026-10-10' }],
      runtimeCases: [{ name: 'Пример', hidden: false, input: '[2,3]', expected: '5' }, { name: 'SECRET_NAME', hidden: true, input: 'SECRET_INPUT', expected: 'SECRET_EXPECTED' }],
    })
    const response = await rest('GET', `/trainer-tasks/${task.id}?depth=0`, { token })
    expect(response.status).toBe(200)
    expect(response.json).toMatchObject({ languages: ['python'], starterCodePython: 'print(0)', tags: ['python', 'hash-table'], interviewFormat: 'algorithms', recommendedMinutes: 25 })
    expect(JSON.stringify(response.json)).not.toMatch(/SECRET_PYTHON_REFERENCE|SECRET_INPUT|SECRET_EXPECTED/)
    const adminToken = await login(payload, await createAdmin(payload))
    const full = await rest('GET', `/trainer-tasks/${task.id}?depth=0`, { token: adminToken })
    expect(full.json).toMatchObject({ solutionCodePython: 'SECRET_PYTHON_REFERENCE' })
    expect((await rest('PATCH', `/trainer-tasks/${task.id}`, { token, body: { tags: ['go'] } })).status).toBe(403)
  })

  it.each([
    [{ company: 'microsoft', kind: 'official', url: 'javascript:alert(1)', note: 'Источник', checkedAt: '2026-10-10' }],
    [{ company: 'invented-company', kind: 'official', url: 'https://example.com/', note: 'Источник', checkedAt: '2026-10-10' }],
    [{ company: 'avito', kind: 'official', note: 'Нет ссылки', checkedAt: '2026-10-10' }],
    [{ company: 'avito', kind: 'unverified', note: 'Неверная дата', checkedAt: '2026-02-31' }],
  ])('отклоняет неверное подтверждение компании %j', async (companyEvidence) => {
    const task = await createSumTask(payload)
    const token = await login(payload, await createAdmin(payload))
    const response = await rest('PATCH', `/trainer-tasks/${task.id}`, { token, body: { companyEvidence } })
    expect(response.status).toBe(400)
    expect((await payload.findByID({ collection: 'trainer-tasks', id: task.id })).companyEvidence).toBeNull()
  })

  it('аудит заполняет метаданные атомарно, сохраняет код, ID, публикацию и историю', async () => {
    const admin = await createAdmin(payload)
    const user = await createStudent(payload)
    const task = await createSumTask(payload, { tags: [], companies: ['avito'], sourceUrl: 'https://example.com/kept', solutionCode: 'function sum(a,b){return a+b}', descriptionMd: 'Сохранить это условие', isPublished: false })
    const progress = await payload.create({ collection: 'user-trainer-progress', data: { user: user.id, task: task.id, userCode: 'MY_SAVED_CODE', language: 'js', attempts: 7, isCompleted: false } })
    const req = () => createLocalReq({ user: admin }, payload)
    const before = await payload.findByID({ collection: 'trainer-tasks', id: task.id })
    const preview = await backfillTrainerMetadata(await req(), true)
    expect(preview.changes).toContainEqual(expect.objectContaining({ id: task.id, fields: expect.arrayContaining(['tags', 'interviewFormat', 'companyEvidence']) }))
    expect(await payload.findByID({ collection: 'trainer-tasks', id: task.id })).toEqual(before)
    await backfillTrainerMetadata(await req(), false)
    const after = await payload.findByID({ collection: 'trainer-tasks', id: task.id })
    expect(after).toMatchObject({ id: before.id, slug: before.slug, descriptionMd: before.descriptionMd, starterCode: before.starterCode, solutionCode: before.solutionCode, testCases: before.testCases, isPublished: false, sourceUrl: 'https://example.com/kept', tags: ['livecoding'], interviewFormat: 'livecoding', recommendedMinutes: 15 })
    expect(after.companyEvidence).toEqual([{ company: 'avito', kind: 'unverified', checkedAt: '2026-10-10', note: expect.stringContaining('частота неизвестна') }])
    expect(await payload.findByID({ collection: 'user-trainer-progress', id: progress.id })).toMatchObject({ userCode: 'MY_SAVED_CODE', language: 'js', attempts: 7, isCompleted: false })
    expect((await backfillTrainerMetadata(await req(), true)).changed).toBe(0)
  })

  it('ошибка посередине обновления откатывает уже записанные метаданные', async () => {
    const admin = await createAdmin(payload)
    const first = await createSumTask(payload, { tags: [] })
    const second = await createSumTask(payload, { tags: [] })
    const originalUpdate = payload.update.bind(payload)
    const spy = vi.spyOn(payload, 'update').mockImplementation(async (options) => {
      if (options.collection === 'trainer-tasks' && 'id' in options && options.id === second.id) throw new Error('Controlled persistence failure')
      return originalUpdate(options)
    })
    try { await expect(backfillTrainerMetadata(await createLocalReq({ user: admin }, payload), false)).rejects.toThrow('Controlled persistence failure') }
    finally { spy.mockRestore() }
    const current = await payload.findByID({ collection: 'trainer-tasks', id: first.id })
    expect(current.tags).toEqual([])
    expect(current.interviewFormat).toBeNull()
  })

  it('повторный аудит известной задачи учитывает JSONB и сохраняет заметку редактора без подтверждённого источника', async () => {
    const admin = await createAdmin(payload)
    const task = await createSumTask(payload, { slug: 'avito-event-bus', companies: ['avito', 'vk'], tags: [] })
    const req = () => createLocalReq({ user: admin }, payload)
    await backfillTrainerMetadata(await req(), false)
    expect((await backfillTrainerMetadata(await req(), true)).changes.some((row) => row.id === task.id)).toBe(false)
    const notes = [
      { company: 'avito', kind: 'unverified', checkedAt: '2026-10-09', note: 'Редактор ещё проверяет эту историческую метку.' },
      { company: 'vk', kind: 'unverified', checkedAt: '2026-10-09', note: 'Публичного подтверждения пока нет.' },
    ]
    await payload.update({ collection: 'trainer-tasks', id: task.id, data: { companyEvidence: notes } })
    await backfillTrainerMetadata(await req(), false)
    expect((await payload.findByID({ collection: 'trainer-tasks', id: task.id })).companyEvidence).toEqual(notes)
    expect((await backfillTrainerMetadata(await req(), true)).changes.some((row) => row.id === task.id)).toBe(false)
  })

  it('административный endpoint закрыт для гостя, ученика и чужого Origin', async () => {
    const request = (token?: string, origin = 'http://lms.test', body: unknown = { dryRun: true }) => new Request('http://lms.test/api/manage/trainer/metadata', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: `JWT ${token}` } : {}) }, body: JSON.stringify(body) })
    expect((await POST(request())).status).toBe(401)
    expect((await POST(request(await login(payload, await createStudent(payload))))).status).toBe(403)
    const token = await login(payload, await createAdmin(payload))
    expect((await POST(request(token, 'https://foreign.test'))).status).toBe(403)
    expect((await POST(request(token, 'http://lms.test', {}))).status).toBe(400)
    expect((await POST(request(token, 'http://lms.test', { dryRun: true, code: 'not allowed' }))).status).toBe(400)
    const response = await POST(request(token))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ dryRun: true, inspected: expect.any(Number) })
  })

  it('сохраняет источник CMS-задачи без отдельной метки компании и делает компанию доступной для фильтра', async () => {
    const admin = await createAdmin(payload)
    const evidence = [{ company: 'microsoft', kind: 'preparation', url: 'https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing', note: 'Источник уже сохранён редактором.', checkedAt: '2026-10-09' }]
    const task = await createSumTask(payload, { companies: [], companyEvidence: evidence })
    const req = () => createLocalReq({ user: admin }, payload)
    await backfillTrainerMetadata(await req(), false)
    const current = await payload.findByID({ collection: 'trainer-tasks', id: task.id })
    expect(current.companies).toEqual(['microsoft'])
    expect(current.companyEvidence).toEqual(evidence)
    expect((await backfillTrainerMetadata(await req(), true)).changes.some((row) => row.id === task.id)).toBe(false)
  })
})

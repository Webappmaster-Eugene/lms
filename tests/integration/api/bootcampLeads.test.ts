import { existsSync } from 'node:fs'

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import type { BootcampLead } from '@/payload-types'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { GET as downloadEntryTask } from '@/app/(entry-task)/entry-task/[token]/download/route'
import { POST } from '@/app/api/bootcamp/leads/route'
import { POST as checkEntry } from '@/app/api/entry-task/[token]/check/route'
import { POST as submitEntry } from '@/app/api/entry-task/[token]/submit/route'
import { ENTRY_TASKS } from '@/data/bootcamp-entry/tasks'
import { ENTRY_TASK_MAX_SUBMISSIONS } from '@/lib/bootcamp-entry-task'
import { logger } from '@/lib/telemetry'
import { ENTRY_TASK_RESEND_AFTER_MS, sendEntryTask } from '@/server/bootcamp-entry-task'
import { captureEmails, createAdmin, createStudent, getTestPayload, login, rest, uid, type TestUser } from '../helpers/payload'
import { LEAD_BODY_MAX_BYTES, LEAD_RESUME_MAX_BYTES, LEAD_RESUMES_MAX_TOTAL_BYTES } from '@/lib/bootcamp-leads'
import { LEAD_ANSWERS, LEAD_DOCX, LEAD_DOCX_WITH_MACROS, LEAD_DOCX_WORD_ONLINE, LEAD_PDF, leadFormData } from '../../fixtures/bootcampLead'
import { zipOf } from '../../fixtures/zip'

let payload: Payload
let admin: TestUser
let adminToken: string
let studentToken: string
let ipSeq = 0
let entryTaskFile = ''
const previousTrustProxy = process.env.LMS_TRUST_PROXY

const ENTRY_TASK_ZIP = zipOf('README.md', '# Входное задание')

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  adminToken = await login(payload, admin)
  studentToken = await login(payload, await createStudent(payload))
  const task = await payload.create({
    collection: 'bootcamp-entry-tasks',
    data: { program: 'nodejs', active: true, readme: '# Входное задание\n\nТри задачи на TypeScript.' },
    file: { data: ENTRY_TASK_ZIP, mimetype: 'application/zip', name: `${uid('entry')}.zip`, size: ENTRY_TASK_ZIP.length },
    overrideAccess: true,
  })
  entryTaskFile = task.filename ?? ''
  // Лимит считается по адресу клиента, который подставляет Traefik.
  process.env.LMS_TRUST_PROXY = 'true'
})

afterAll(() => {
  if (previousTrustProxy === undefined) delete process.env.LMS_TRUST_PROXY
  else process.env.LMS_TRUST_PROXY = previousTrustProxy
})

/** Новый адрес клиента на каждый вызов: тесты не делят лимит частоты. */
const nextIp = () => `198.51.100.${(ipSeq += 1)}`

function send(body: Record<string, unknown> | undefined, { ip = nextIp(), headers = {} as Record<string, string>, raw, resume }: { ip?: string; headers?: Record<string, string>; raw?: string; resume?: File } = {}) {
  return POST(new Request('http://info.test/api/bootcamp/leads', {
    method: 'POST',
    headers: { 'X-Forwarded-For': ip, 'X-Forwarded-Host': 'info.test', Origin: 'http://info.test', 'Sec-Fetch-Site': 'same-origin', ...headers },
    body: raw ?? leadFormData(body, resume),
  }))
}

/** Программа для тестов: те же условия, что у nodejs, свой ключ. */
const programData = (key: string) => ({
  key, title: `Программа ${key}`, shortTitle: key, isActive: true, landingUrl: `https://info.test/bootcamp/${key}/`,
  priceKopecks: 3_000_000, paymentDueDays: 5, offerUrl: `https://info.test/bootcamp/${key}/offer/`, offerVersion: '2026-11-01',
  receiptItemName: `Буткемп ${key}`, gitlabCourseProject: 'bootcamp/course', gitlabStreamGroup: 'nodejs-bootcamp', gradingProject: 'bootcamp-staff/grading', entryTaskSet: 'rental-js',
})

const lead = (email: string, extra: Record<string, unknown> = {}) => ({ ...LEAD_ANSWERS, program: 'nodejs', email, consent: true, consentVersion: '2026-10-26', ...extra })

type EntryRoute = (request: Request, context: { params: Promise<{ token: string }> }) => Promise<Response>

function entryRequest(route: EntryRoute, token: string, body: unknown, headers: Record<string, string> = {}) {
  return route(new Request(`http://lms.test/api/entry-task/${token}/x`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Host: 'lms.test', Origin: 'http://lms.test', 'Sec-Fetch-Site': 'same-origin', ...headers },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ token }) })
}

async function stored(email: string) {
  return (await payload.find({ collection: 'bootcamp-leads', where: { email: { equals: email } }, depth: 0, overrideAccess: true })).docs
}

/** Кнопка «Отправить входное задание» в карточке: сама заявка задание не отправляет. */
async function sendTask(email: string) {
  const [row] = await stored(email)
  await sendEntryTask(payload, row as BootcampLead)
}

describe('POST /api/bootcamp/leads: предзапись с лендинга', () => {
  it('сохраняет заявку, отвечает только после записи и пишет команде', async () => {
    const mail = captureEmails(payload)
    try {
      const email = `${uid('lead')}@mail.test`
      const response = await send(lead(email.toUpperCase(), { utm: { utm_source: 'habr' }, referrer: 'https://habr.com/ru/articles/1' }))
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({ ok: true })
      const [row] = await stored(email)
      expect(row).toMatchObject({ email, name: 'Иван', program: 'nodejs', status: 'new', submissionCount: 1, consentVersion: '2026-10-26', source: { utmSource: 'habr', referrerHost: 'habr.com' } })
      expect(row?.consentAt).toBeTruthy()
      expect(row).toMatchObject({
        telegram: '@ivan_petrov', reason: 'switch-or-grow', problem: LEAD_ANSWERS.problem, story: LEAD_ANSWERS.story, goal: LEAD_ANSWERS.goal,
        urgency: 'soon', hoursPerWeek: '10-20', fillSeconds: 20, wroteTelegram: false,
      })
      await vi.waitFor(async () => expect((await stored(email))[0]?.notifiedAt).toBeTruthy())
      const letter = mail.sent.find((message) => message.to === admin.email && message.subject.includes(email))
      expect(letter?.text).toContain(`/admin/collections/bootcamp-leads/${row?.id}`)
      expect(letter?.text).toContain('habr')
      // Анкету владелец читает прямо в письме: заявку должно быть можно оценить, не открывая CMS.
      for (const answer of ['@ivan_petrov', 'Сменить работу или вырасти в грейде', LEAD_ANSWERS.problem, LEAD_ANSWERS.story, LEAD_ANSWERS.goal, '1-3 месяца', '10-20']) expect(letter?.text).toContain(answer)
    } finally {
      mail.restore()
    }
  })

  it('повтор того же адреса не создаёт вторую заявку и не подменяет первую', async () => {
    const email = `${uid('repeat')}@mail.test`
    expect((await send(lead(email))).status).toBe(200)
    // Письмо о первой отправке уходит в фоне: ждём его, чтобы не принять за письмо о повторе.
    await vi.waitFor(async () => expect((await stored(email))[0]?.notifiedAt).toBeTruthy())
    const mail = captureEmails(payload)
    try {
      const again = await send(lead(email, { name: 'Другой человек' }))
      expect(again.status).toBe(200)
      expect(await again.json()).toEqual({ ok: true })
      const rows = await stored(email)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ name: 'Иван', submissionCount: 2 })
      expect(mail.sent.filter((message) => message.subject.includes(email))).toHaveLength(0)
    } finally {
      mail.restore()
    }
  })

  it('параллельные отправки одного адреса дают одну заявку', async () => {
    const email = `${uid('race')}@mail.test`
    const responses = await Promise.all(Array.from({ length: 5 }, () => send(lead(email))))
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200])
    const rows = await stored(email)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.submissionCount).toBeGreaterThanOrEqual(2)
  })

  it('ошибки ввода объясняет и ничего не пишет', async () => {
    const email = `${uid('bad')}@mail.test`
    const noConsent = await send(lead(email, { consent: false }))
    expect(noConsent.status).toBe(400)
    expect((await noConsent.json()).error).toMatch(/согласие/)
    expect((await send(lead('not-an-email'))).status).toBe(400)
    expect((await send(undefined, { raw: 'не форма', headers: { 'Content-Type': 'multipart/form-data; boundary=x' } })).status).toBe(400)
    const longName = await send(lead(email, { name: 'x'.repeat(5000) }))
    expect(longName.status).toBe(400)
    expect(await longName.json()).toMatchObject({ field: 'name' })
    // Страница, открытая до выката, шлёт JSON: человеку надо знать, что делать.
    const old = await send(undefined, { raw: JSON.stringify(lead(email)), headers: { 'Content-Type': 'application/json' } })
    expect(old.status).toBe(415)
    expect((await old.json()).error).toMatch(/Обновите страницу/)
    expect((await send(lead(email), { raw: 'x', headers: { 'Content-Type': 'text/plain' } })).status).toBe(415)
    const fast = await send(lead(email, { fillMs: '3000' }))
    expect(fast.status).toBe(400)
    expect((await fast.json()).error).toMatch(/слишком быстро/)
    const empty = await send(lead(email, { problem: 'Хочу работу' }))
    expect(empty.status).toBe(400)
    expect(await empty.json()).toMatchObject({ field: 'problem' })
    expect(await stored(email)).toHaveLength(0)
  })

  it('заявка только в существующую программу, которая принимает заявки', async () => {
    const email = `${uid('prog')}@mail.test`
    const unknown = await send(lead(email, { program: 'no-such-program' }))
    expect(unknown.status).toBe(400)
    expect((await unknown.json()).error).toMatch(/Такой программы нет/)
    expect((await send(lead(email, { program: 'Bad Key!' }))).status).toBe(400)
    const closed = await payload.create({ collection: 'bootcamp-programs', data: { ...programData(`closed-${Date.now().toString(36)}`), isActive: false }, overrideAccess: true })
    const rejected = await send(lead(email, { program: closed.key }))
    expect(rejected.status).toBe(400)
    expect((await rejected.json()).error).toMatch(/Набор на буткемп .* сейчас закрыт/)
    expect(await stored(email)).toHaveLength(0)

    // Набор закрыли после заявки: повтор («письмо не пришло») принимается, новой записи нет.
    const open = await payload.create({ collection: 'bootcamp-programs', data: programData(`later-${Date.now().toString(36)}`), overrideAccess: true })
    expect((await send(lead(email, { program: open.key }))).status).toBe(200)
    await payload.update({ collection: 'bootcamp-programs', id: open.id, data: { isActive: false }, overrideAccess: true })
    expect((await send(lead(email, { program: open.key }))).status).toBe(200)
    const [row] = await stored(email)
    expect(row?.submissionCount).toBe(2)
    expect((await send(lead(`${uid('late')}@mail.test`, { program: open.key }))).status).toBe(400)
  })

  it('вторая программа: своя заявка на тот же адрес и своё название в письме', async () => {
    const mail = captureEmails(payload)
    try {
      const program = await payload.create({ collection: 'bootcamp-programs', data: { ...programData(`python-${Date.now().toString(36)}`), shortTitle: 'Python' }, overrideAccess: true })
      const email = `${uid('two')}@mail.test`
      expect((await send(lead(email))).status).toBe(200)
      expect((await send(lead(email, { program: program.key }))).status).toBe(200)
      const rows = await stored(email)
      expect(rows.map((row) => row.program).sort()).toEqual(['nodejs', program.key].sort())
      for (const row of rows) await sendEntryTask(payload, row)
      expect(mail.sent.filter((message) => message.to === email)).toHaveLength(2)
      expect(mail.sent.filter((message) => message.to === email).map((message) => message.subject).sort())
        .toEqual(['Входное задание буткемпа Node.js', 'Входное задание буткемпа Python'])
    } finally {
      mail.restore()
    }
  })

  it('программу с заявками удалить нельзя, ключ после создания не меняется', async () => {
    const program = await payload.create({ collection: 'bootcamp-programs', data: programData(`keep-${Date.now().toString(36)}`), overrideAccess: true })
    expect((await send(lead(`${uid('keep')}@mail.test`, { program: program.key }))).status).toBe(200)
    await expect(payload.delete({ collection: 'bootcamp-programs', id: program.id, overrideAccess: true })).rejects.toThrow(/есть заявки/)
    const renamed = await rest('PATCH', `/bootcamp-programs/${program.id}`, { token: adminToken, body: { key: 'renamed-key', title: 'Новое название' } })
    expect(renamed.status).toBe(200)
    const after = await payload.findByID({ collection: 'bootcamp-programs', id: program.id, depth: 0, overrideAccess: true })
    expect(after.key).toBe(program.key)
    expect(after.title).toBe('Новое название')
  })

  it('робот со скрытым полем получает обычный ответ, но заявки нет', async () => {
    const email = `${uid('bot')}@mail.test`
    // Ответ тот же и без анкеты: тексты проверок подсказали бы роботу, как пройти.
    expect((await send({ website: 'https://spam.example', email })).status).toBe(200)
    const response = await send(lead(email, { website: 'https://spam.example' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(await stored(email)).toHaveLength(0)
  })

  it('чужая страница не отправит заявку руками посетителя', async () => {
    const email = `${uid('foreign')}@mail.test`
    expect((await send(lead(email), { headers: { Origin: 'https://evil.test' } })).status).toBe(403)
    expect((await send(lead(email), { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
    expect(await stored(email)).toHaveLength(0)
  })

  it('ограничивает частоту отправок с одного адреса', async () => {
    const ip = nextIp()
    for (let attempt = 0; attempt < 5; attempt += 1) expect((await send(lead(`${uid('limit')}@mail.test`), { ip })).status).toBe(200)
    const limited = await send(lead(`${uid('limit')}@mail.test`), { ip })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('600')
    expect((await send(lead(`${uid('limit')}@mail.test`))).status).toBe(200)
  })

  it('сбой письма команде не теряет заявку', async () => {
    const failure = vi.spyOn(payload, 'sendEmail').mockRejectedValue(new Error('SMTP недоступен'))
    const logged = vi.spyOn(logger, 'error')
    try {
      const email = `${uid('smtp')}@mail.test`
      expect((await send(lead(email))).status).toBe(200)
      await vi.waitFor(() => expect(logged).toHaveBeenCalledWith('Bootcamp lead notification failed', expect.any(Error), expect.anything()))
      const [row] = await stored(email)
      expect(row).toMatchObject({ email, notifiedAt: null })
    } finally {
      failure.mockRestore()
      logged.mockRestore()
    }
  })

  it('заявка задание не отправляет: сначала анкету читает владелец', async () => {
    const mail = captureEmails(payload)
    try {
      const email = `${uid('task')}@mail.test`
      expect((await send(lead(email))).status).toBe(200)
      await vi.waitFor(async () => expect((await stored(email))[0]?.notifiedAt).toBeTruthy())
      const [before] = await stored(email)
      expect(before?.entryTaskSentAt ?? null).toBeNull()
      expect(before?.entryTaskToken).toMatch(/^[A-Za-z0-9_-]{32}$/)
      expect(mail.sent.filter((message) => message.to === email)).toHaveLength(0)

      await sendTask(email)

      const [row] = await stored(email)
      expect(Date.parse(row?.entryTaskDueAt ?? '') - Date.now()).toBeGreaterThan(6 * 24 * 60 * 60_000)
      const letter = mail.sent.find((message) => message.to === email)
      expect(letter?.subject).toBe('Входное задание буткемпа Node.js')
      expect(letter?.text).toContain(`/entry-task/${row?.entryTaskToken}`)
      expect(letter?.text).toContain('в течение 5 дней')
    } finally {
      mail.restore()
    }
  })

  it('по личной ссылке отдаётся архив задания, по чужой и кривой - 404', async () => {
    const email = `${uid('download')}@mail.test`
    expect((await send(lead(email))).status).toBe(200)
    const [row] = await stored(email)
    const download = (token: string) => downloadEntryTask(new Request(`http://lms.test/entry-task/${token}/download`), { params: Promise.resolve({ token }) })
    const response = await download(row?.entryTaskToken ?? '')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(Buffer.from(await response.arrayBuffer()).equals(ENTRY_TASK_ZIP)).toBe(true)
    expect((await download('A'.repeat(32))).status).toBe(404)
    expect((await download('../../etc/passwd')).status).toBe(404)
  })

  it('заявка со старой формы получает анкету при повторе, а заполненную анкету повтор не заменяет', async () => {
    const email = `${uid('old-form')}@mail.test`
    const old = await payload.create({ collection: 'bootcamp-leads', overrideAccess: true, data: { program: 'nodejs', email, status: 'new', consentVersion: '2026-10-31', consentAt: new Date().toISOString(), submissionCount: 1, lastSubmittedAt: new Date().toISOString() } })

    expect((await send(lead(email), { resume: new File([LEAD_PDF], 'cv.pdf') })).status).toBe(200)

    const [filled] = await stored(email)
    expect(filled).toMatchObject({ id: old.id, telegram: '@ivan_petrov', reason: 'switch-or-grow', problem: LEAD_ANSWERS.problem, story: LEAD_ANSWERS.story, urgency: 'soon', hoursPerWeek: '10-20', fillSeconds: 20, submissionCount: 2 })
    expect(filled?.resume).toBeTruthy()

    expect((await send(lead(email, { telegram: '@another_person', problem: `Другое описание. ${LEAD_ANSWERS.problem}` }))).status).toBe(200)

    const [again] = await stored(email)
    expect(again).toMatchObject({ telegram: '@ivan_petrov', problem: LEAD_ANSWERS.problem, submissionCount: 3 })
    expect(again?.resume).toBe(filled?.resume)
  })

  it('заявку в работе повтор анкетой не дополняет: адрес не подтверждён', async () => {
    const email = `${uid('old-admitted')}@mail.test`
    await payload.create({ collection: 'bootcamp-leads', overrideAccess: true, data: { program: 'nodejs', email, status: 'contacted', consentVersion: '2026-10-31', consentAt: new Date().toISOString(), submissionCount: 1, lastSubmittedAt: new Date().toISOString() } })
    expect((await send(lead(email))).status).toBe(200)
    const [row] = await stored(email)
    expect(row?.problem ?? null).toBeNull()
    expect(row?.consentVersion).toBe('2026-10-31')
  })

  it('повтор заявки не выдаёт задание, пока его не отправил владелец', async () => {
    const email = `${uid('resend-first')}@mail.test`
    expect((await send(lead(email))).status).toBe(200)
    const [row] = await stored(email)
    await payload.update({ collection: 'bootcamp-leads', id: Number(row?.id), data: { createdAt: new Date(Date.now() - ENTRY_TASK_RESEND_AFTER_MS - 60_000).toISOString() }, overrideAccess: true })
    const mail = captureEmails(payload)
    try {
      expect((await send(lead(email))).status).toBe(200)
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(mail.sent.filter((message) => message.to === email)).toHaveLength(0)
      expect((await stored(email))[0]?.entryTaskSentAt ?? null).toBeNull()
    } finally {
      mail.restore()
    }
  })

  it('повтор заявки сразу после письма его не дублирует, а позже присылает ту же ссылку с прежним сроком', async () => {
    const email = `${uid('resend')}@mail.test`
    expect((await send(lead(email))).status).toBe(200)
    await sendTask(email)
    const mail = captureEmails(payload)
    try {
      expect((await send(lead(email))).status).toBe(200)
      expect(mail.sent.filter((message) => message.to === email)).toHaveLength(0)
      const [first] = await stored(email)
      const earlier = new Date(Date.now() - ENTRY_TASK_RESEND_AFTER_MS - 60_000).toISOString()
      await payload.update({ collection: 'bootcamp-leads', id: Number(first?.id), data: { entryTaskSentAt: earlier }, overrideAccess: true })
      expect((await send(lead(email))).status).toBe(200)
      await vi.waitFor(() => expect(mail.sent.filter((message) => message.to === email)).toHaveLength(1))
      const [again] = await stored(email)
      expect(again?.entryTaskToken).toBe(first?.entryTaskToken)
      expect(again?.entryTaskDueAt).toBe(first?.entryTaskDueAt)
      expect(mail.sent.find((message) => message.to === email)?.text).toContain(`/entry-task/${first?.entryTaskToken}`)
    } finally {
      mail.restore()
    }
  })

  it('«Проверить» прогоняет тесты задачи на сервере и ничего не пишет в заявку', async () => {
    const email = `${uid('check')}@mail.test`
    expect((await send(lead(email))).status).toBe(200)
    const [row] = await stored(email)
    const token = row?.entryTaskToken ?? ''
    const [price] = ENTRY_TASKS
    const solved = await entryRequest(checkEntry, token, { task: price?.slug, code: price?.solutionCode })
    expect(solved.status).toBe(200)
    const body = await solved.json() as { result: { status: string, passedCount: number } }
    expect(body.result.status).toBe('passed')
    expect(body.result.passedCount).toBe(price?.cases.length)
    const wrong = await (await entryRequest(checkEntry, token, { task: price?.slug, code: 'function rentalPrice(p, d) { return p * d }' })).json() as { result: { status: string } }
    expect(wrong.result.status).toBe('failed')
    expect((await entryRequest(checkEntry, token, { task: 'nope', code: 'x' })).status).toBe(400)
    expect((await entryRequest(checkEntry, token, { task: price?.slug, code: '   ' })).status).toBe(400)
    expect((await entryRequest(checkEntry, 'A'.repeat(32), { task: price?.slug, code: price?.solutionCode })).status).toBe(404)
    expect((await entryRequest(checkEntry, token, { task: price?.slug, code: price?.solutionCode }, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
    expect((await stored(email))[0]?.entrySubmittedAt).toBeFalsy()
  })

  it('«Отправить решение» пишет в заявку код и итог, команде уходит письмо, повтор заменяет прежний код', async () => {
    const email = `${uid('submit')}@mail.test`
    expect((await send(lead(email))).status).toBe(200)
    await sendTask(email)
    const [row] = await stored(email)
    const token = row?.entryTaskToken ?? ''
    const [price, overlap, summary] = ENTRY_TASKS
    expect((await entryRequest(submitEntry, token, { solutions: {} })).status).toBe(400)
    const mail = captureEmails(payload)
    try {
      const first = await entryRequest(submitEntry, token, { solutions: { [price?.slug ?? '']: price?.solutionCode, [overlap?.slug ?? '']: 'function overlaps(a, b) { return false }' } })
      expect(first.status).toBe(200)
      const result = await first.json() as { passed: number, total: number, tasks: { slug: string, attempted: boolean, passed: number }[] }
      const total = ENTRY_TASKS.reduce((sum, task) => sum + task.cases.length, 0)
      expect(result.total).toBe(total)
      expect(result.tasks.find((task) => task.slug === price?.slug)?.passed).toBe(price?.cases.length)
      expect(result.tasks.find((task) => task.slug === summary?.slug)?.attempted).toBe(false)
      const [saved] = await stored(email)
      expect(saved?.entrySubmissionCount).toBe(1)
      expect(saved?.entryPassed).toBe(result.passed)
      expect(saved?.entryTotal).toBe(total)
      expect(saved?.entrySolution).toContain('return false')
      expect(saved?.entryResult).toContain('Сводка по каталогу: не решалась')
      expect((saved?.entrySolutions as Record<string, string>)[overlap?.slug ?? '']).toContain('return false')
      // Заявка не потеряла поля, которые пишут другие процессы.
      expect(saved?.entryTaskToken).toBe(token)
      expect(saved?.entryTaskSentAt).toBe(row?.entryTaskSentAt)
      await vi.waitFor(() => expect(mail.sent.find((message) => message.to === admin.email)?.subject).toBe(`Решение входного задания: ${email}, ${result.passed} из ${total}`))

      const again = await entryRequest(submitEntry, token, { solutions: { [overlap?.slug ?? '']: overlap?.solutionCode } })
      expect(again.status).toBe(200)
      const [replaced] = await stored(email)
      expect(replaced?.entrySubmissionCount).toBe(2)
      expect(replaced?.entrySolution).not.toContain('return false')
      expect(replaced?.entrySolution).toContain('// 1. Стоимость аренды: не решалась')
    } finally {
      mail.restore()
    }
  })

  it('решение принимается не больше трёх раз, одновременные отправки предел не обходят', async () => {
    const email = `${uid('limit')}@mail.test`
    expect((await send(lead(email))).status).toBe(200)
    await sendTask(email)
    const token = (await stored(email))[0]?.entryTaskToken ?? ''
    const [price] = ENTRY_TASKS
    const solution = (code: string) => ({ solutions: { [price?.slug ?? '']: code } })
    const subject = (message: { subject?: string }) => message.subject?.startsWith(`Решение входного задания: ${email},`)
    const mail = captureEmails(payload)
    try {
      for (let sent = 1; sent < ENTRY_TASK_MAX_SUBMISSIONS; sent += 1) {
        const response = await entryRequest(submitEntry, token, solution(`function rentalPrice(p, d) { return ${sent} }`))
        expect(response.status).toBe(200)
        expect((await response.json() as { submissionsLeft: number }).submissionsLeft).toBe(ENTRY_TASK_MAX_SUBMISSIONS - sent)
      }
      // Обе прошли раннюю проверку по счётчику заявки; последнее место достаётся одной.
      const pair = await Promise.all([1, 2].map(() => entryRequest(submitEntry, token, solution(price?.solutionCode ?? ''))))
      expect(pair.map((response) => response.status).sort()).toEqual([200, 409])
      const won = pair.find((response) => response.status === 200)
      expect((await won?.json() as { submissionsLeft: number }).submissionsLeft).toBe(0)
      const lost = await pair.find((response) => response.status === 409)?.json() as { error: string }
      expect(lost.error).toContain('больше отправок нет')

      const late = await entryRequest(submitEntry, token, solution('function rentalPrice() { return 0 }'))
      expect(late.status).toBe(409)
      const [saved] = await stored(email)
      expect(saved?.entrySubmissionCount).toBe(ENTRY_TASK_MAX_SUBMISSIONS)
      expect(saved?.entryPassed).toBe(price?.cases.length)
      expect(saved?.entrySolution).not.toContain('return 0')
      await vi.waitFor(() => expect(mail.sent.filter((message) => message.to === admin.email && subject(message))).toHaveLength(ENTRY_TASK_MAX_SUBMISSIONS))
    } finally {
      mail.restore()
    }
  })

  it('архив задания через REST Payload видит только администратор', async () => {
    expect((await rest('GET', '/bootcamp-entry-tasks')).status).toBe(403)
    expect((await rest('GET', '/bootcamp-entry-tasks', { token: studentToken })).status).toBe(403)
    expect((await rest('GET', `/bootcamp-entry-tasks/file/${entryTaskFile}`)).status).toBe(403)
    expect((await rest('GET', `/bootcamp-entry-tasks/file/${entryTaskFile}`, { token: studentToken })).status).toBe(403)
    expect((await rest('GET', '/bootcamp-entry-tasks', { token: adminToken })).status).toBe(200)
  })

  describe('резюме', () => {
    const PDF = LEAD_PDF
    const pdf = (name = 'Иван резюме.pdf') => new File([PDF], name, { type: 'application/pdf' })
    const resumes = async () => (await payload.count({ collection: 'bootcamp-lead-resumes', overrideAccess: true })).totalDocs

    it('файл видит только администратор, другие маршруты его не отдают, а удаляется он с заявкой', async () => {
      const email = `${uid('cv')}@mail.test`
      expect((await send(lead(email), { resume: pdf() })).status).toBe(200)
      const [row] = await stored(email)
      const id = Number(row?.resume)
      const doc = await payload.findByID({ collection: 'bootcamp-lead-resumes', id, overrideAccess: true })
      expect(doc.originalName).toBe('Иван резюме.pdf')
      // Имя на диске своё: по адресу файла не должно быть видно, чьё это резюме.
      expect(doc.filename).toMatch(/^resume-[0-9a-f-]{36}\.pdf$/)
      const file = `/bootcamp-lead-resumes/file/${doc.filename}`
      expect((await rest('GET', file)).status).toBe(403)
      expect((await rest('GET', file, { token: studentToken })).status).toBe(403)
      const download = await rest('GET', file, { token: adminToken })
      expect(download.status).toBe(200)
      expect(download.headers.get('cache-control')).toBe('private, no-store')
      expect(download.headers.get('x-content-type-options')).toBe('nosniff')
      expect(download.headers.get('content-disposition')).toMatch(/^attachment/)
      expect(existsSync(`media/bootcamp-lead-resumes/${doc.filename}`)).toBe(true)
      expect((await rest('GET', '/bootcamp-lead-resumes', { token: studentToken })).status).toBe(403)
      // Каталог лежит внутри media: публичная медиатека не должна отдавать его по вложенному пути.
      expect((await rest('GET', `/media/file/bootcamp-lead-resumes%2F${doc.filename}`, { token: studentToken })).status).not.toBe(200)
      expect((await rest('GET', `/media/file/bootcamp-lead-resumes/${doc.filename}`, { token: studentToken })).status).not.toBe(200)
      expect((await rest('POST', '/bootcamp-lead-resumes', { token: adminToken, body: {} })).status).toBe(403)

      await payload.delete({ collection: 'bootcamp-leads', id: Number(row?.id), overrideAccess: true })

      await expect(payload.findByID({ collection: 'bootcamp-lead-resumes', id, overrideAccess: true })).rejects.toThrow()
      expect((await rest('GET', file, { token: adminToken })).status).not.toBe(200)
      expect(existsSync(`media/bootcamp-lead-resumes/${doc.filename}`)).toBe(false)
    })

    it.each([['из Word', LEAD_DOCX], ['из Word Online', LEAD_DOCX_WORD_ONLINE]])('принимает настоящий DOCX %s', async (_label, file) => {
      const email = `${uid('docx')}@mail.test`
      expect((await send(lead(email), { resume: new File([new Uint8Array(file)], 'cv.docx') })).status).toBe(200)
      const [row] = await stored(email)
      const doc = await payload.findByID({ collection: 'bootcamp-lead-resumes', id: Number(row?.resume), overrideAccess: true })
      expect(doc.filename).toMatch(/\.docx$/)
    })

    it.each([
      ['исполняемый файл с именем pdf', () => new File(['MZ исполняемый'], 'cv.pdf', { type: 'application/pdf' }), /PDF или DOCX/],
      ['архив с именем docx', () => new File([new Uint8Array(zipOf('a.txt', 'x'))], 'cv.docx'), /PDF или DOCX/],
      ['документ с макросами', () => new File([new Uint8Array(LEAD_DOCX_WITH_MACROS)], 'cv.docx'), /PDF или DOCX/],
      ['пустой файл', () => new File([], 'cv.pdf'), /пустой/],
      ['файл больше 5 МБ', () => new File([new Uint8Array(LEAD_RESUME_MAX_BYTES + 1)], 'cv.pdf'), /больше 5 МБ/],
    ])('%s: отказ с объяснением, заявка и файл не сохраняются', async (_label, file, message) => {
      const email = `${uid('bad-cv')}@mail.test`
      const before = await resumes()
      const response = await send(lead(email), { resume: file() })
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.field).toBe('resume')
      expect(body.error).toMatch(message)
      expect(await stored(email)).toHaveLength(0)
      expect(await resumes()).toBe(before)
    })

    it('тело больше предела отклоняется при чтении, до разбора формы', async () => {
      const response = await send(lead(`${uid('huge')}@mail.test`), { resume: new File([new Uint8Array(LEAD_BODY_MAX_BYTES + 1)], 'cv.pdf') })
      expect(response.status).toBe(413)
      expect(await response.json()).toMatchObject({ field: 'resume' })
    })

    it('файлов уже на общий предел: заявка сохраняется без файла', async () => {
      const drizzle = (payload.db as unknown as { drizzle: { execute: (query: unknown) => Promise<{ rows: { id: number }[] }> } }).drizzle
      const { rows } = await drizzle.execute(sql`insert into bootcamp_lead_resumes (filename, filesize, updated_at, created_at) values ('заглушка-предела.pdf', ${LEAD_RESUMES_MAX_TOTAL_BYTES}, now(), now()) returning id`)
      try {
        const email = `${uid('full')}@mail.test`
        const before = await resumes()
        expect((await send(lead(email), { resume: pdf() })).status).toBe(200)
        expect((await stored(email))[0]?.resume ?? null).toBeNull()
        expect(await resumes()).toBe(before)
      } finally {
        await drizzle.execute(sql`delete from bootcamp_lead_resumes where id = ${rows[0]?.id}`)
      }
    })

    it('восемь чтений идут одновременно, девятая заявка получает просьбу повторить, а после чтений форма снова работает', async () => {
      const controllers: ReadableStreamDefaultController<Uint8Array>[] = []
      const pending = Array.from({ length: 8 }, () => POST(new Request('http://info.test/api/bootcamp/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data; boundary=x', 'X-Forwarded-For': nextIp(), 'X-Forwarded-Host': 'info.test', Origin: 'http://info.test', 'Sec-Fetch-Site': 'same-origin' },
        body: new ReadableStream<Uint8Array>({ start: (controller) => { controllers.push(controller) } }),
        duplex: 'half',
      } as RequestInit)))
      await new Promise((resolve) => setTimeout(resolve, 50))
      const email = `${uid('busy')}@mail.test`
      const busy = await send(lead(email))
      expect(busy.status).toBe(503)
      expect(busy.headers.get('retry-after')).toBe('60')
      expect((await busy.json()).error).toMatch(/через минуту/)
      expect(await stored(email)).toHaveLength(0)
      for (const controller of controllers) controller.close()
      await Promise.all(pending)
      expect((await send(lead(email))).status).toBe(200)
    })

    it('поле без выбранного файла заявке не мешает', async () => {
      const email = `${uid('no-cv')}@mail.test`
      expect((await send(lead(email), { resume: new File([], '') })).status).toBe(200)
      expect((await stored(email))[0]?.resume ?? null).toBeNull()
    })

    it('повтор заявки второй файл не сохраняет и первый не заменяет', async () => {
      const email = `${uid('repeat-cv')}@mail.test`
      expect((await send(lead(email), { resume: pdf('первый.pdf') })).status).toBe(200)
      const before = await resumes()
      const [first] = await stored(email)
      expect((await send(lead(email), { resume: pdf('второй.pdf') })).status).toBe(200)
      expect(await resumes()).toBe(before)
      expect((await stored(email))[0]?.resume).toBe(first?.resume)
    })
  })

  it('отметку «Написал в Telegram» администратор ставит, ответы анкеты в карточке не меняются', async () => {
    const email = `${uid('wrote')}@mail.test`
    expect((await send(lead(email))).status).toBe(200)
    const [row] = await stored(email)
    const changed = await rest('PATCH', `/bootcamp-leads/${row?.id}`, { token: adminToken, body: { wroteTelegram: true, problem: 'подмена', telegram: '@another_person' } })
    expect(changed.status).toBe(200)
    const [fresh] = await stored(email)
    expect(fresh).toMatchObject({ wroteTelegram: true, problem: LEAD_ANSWERS.problem, telegram: '@ivan_petrov' })
  })

  it('заявки читает и меняет только администратор', async () => {
    const email = `${uid('access')}@mail.test`
    expect((await send(lead(email))).status).toBe(200)
    expect((await rest('GET', '/bootcamp-leads')).status).toBe(403)
    expect((await rest('GET', '/bootcamp-leads', { token: studentToken })).status).toBe(403)
    expect((await rest('POST', '/bootcamp-leads', { body: lead(`${uid('direct')}@mail.test`) })).status).toBe(403)
    const [row] = await stored(email)
    expect((await rest('PATCH', `/bootcamp-leads/${row?.id}`, { token: studentToken, body: { status: 'admitted' } })).status).toBe(403)
    const listed = await rest('GET', `/bootcamp-leads?where[email][equals]=${encodeURIComponent(email)}`, { token: adminToken })
    expect(listed.status).toBe(200)
    expect((listed.json.docs as { email: string }[]).map((doc) => doc.email)).toEqual([email])
  })
})

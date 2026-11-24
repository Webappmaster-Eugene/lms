import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chromium, expect, request } from '@playwright/test'
import { JSDOM } from 'jsdom'
import { APP_PORT, E2E_SECRET, USERS } from '../../../tests/e2e/fixtures/data.ts'
import { courses, localRevision, prepareReadings, responseJson } from './fixtures.mjs'

const root = path.resolve(process.env.TUTORING_QA_EXPORT ?? '../bootcamp/live-lessons/dist-v9')
const port = process.argv.includes('--visual-port') ? Number(process.env.VISUAL_APP_PORT) : APP_PORT
const origin = 'http://localhost:' + port
const resultsDir = await mkdtemp(path.join(os.tmpdir(), 'mc-tutoring-journey-'))
const manifest = JSON.parse(await readFile(path.join(root, 'meetings.json'), 'utf8'))
assert.equal(manifest.edition, 9)
assert.equal(manifest.meetings.length, 56)
assert(port >= 4000 && port < 5000, 'Репетиция запускается только из выделенного worktree')
assert(!process.env.E2E_BASE_URL || process.env.E2E_BASE_URL === origin, 'Только локальный e2e сервер')
const options = { baseURL: origin, extraHTTPHeaders: { Origin: origin, 'Sec-Fetch-Site': 'same-origin' } }
const worker = {
  'x-lms-worker-key': createHmac('sha256', E2E_SECRET).update('lms-bootcamp-enroll-worker-v1').digest('hex'),
}
const results = {
  mode: 'localhost, ответы исполнителя и webhook GitLab смоделированы, нет внешней почты',
  meetings: [],
  partial: true,
}
const checkpoint = () =>
  writeFile(path.join(resultsDir, 'result.json'), JSON.stringify(results, null, 2), { mode: 0o600 })
const adminApi = await request.newContext(options)
const guest = await request.newContext(options)
const api = async (client, method, route, data, headers = {}) =>
  responseJson(
    await client[method]('/api/' + route, { data, headers: { ...options.extraHTTPHeaders, ...headers } }),
    route,
  )
const collection = (client, route) => api(client, 'get', route)
const digest = (data) => createHash('sha256').update(data).digest('hex')
async function login(client, account, role) {
  const login = await api(client, 'post', 'users/login', { email: account.email, password: account.password })
  assert.equal(login.user.role, role)
  assert.equal((await collection(client, 'users/me')).user.id, login.user.id)
}

async function fileAt(client, route, filename) {
  const response = await client.get(route, { headers: options.extraHTTPHeaders })
  assert.equal(response.status(), 200, route)
  const bytes = await response.body()
  assert(bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
  assert.equal(digest(bytes), digest(await readFile(path.join(root, filename))))
}

async function denied(client, route, file = false) {
  const res = await client.get(route, { maxRedirects: 0, headers: options.extraHTTPHeaders })
  if (file) {
    assert([401, 403, 404].includes(res.status()), route + ' ' + res.status())
    return
  }
  if ([401, 403, 404].includes(res.status())) return
  // Стриминг Next иногда отправляет заголовки 200 до вызова notFound().
  const body = await res.text()
  assert.equal(res.status(), 200)
  assert(
    body.includes('NEXT_HTTP_ERROR_FALLBACK;404') || body.includes('Страница не найдена'),
    route + ': открыта постороннему посетителю',
  )
  assert(!body.includes('data-slide-deck') && !body.includes('id="meeting-title"'))
}

function checkReadingHTML(html, expectedPath) {
  const dom = new JSDOM(html)
  try {
    const article = dom.window.document.querySelector('article')
    assert(article && article.querySelector('h1') && article.textContent.trim().length > 250, expectedPath)
  } finally {
    dom.window.close()
  }
}

async function checkReadings(client, page, tasks) {
  const links = await page
    .getByRole('region', { name: 'Домашнее задание' })
    .getByRole('link')
    .evaluateAll((anchors) => anchors.map((a) => ({ path: new URL(a.href).pathname, text: a.textContent.trim() })))
  assert.equal(links.length, tasks.length * 3)
  for (const [i, task] of tasks.entries()) {
    const practice = new URL(task.practice).pathname.split('/').at(-1)
    const row = links.slice(i * 3, i * 3 + 3)
    assert.deepEqual(
      row.map((link) => link.text),
      ['Теория', 'Практикум', 'Самопроверка'],
    )
    await Promise.all(
      row.map(async (link, n) => {
        assert(link.path.endsWith('/' + practice.replace(/-practice$/, '-' + ['theory', 'practice', 'check'][n])))
        const res = await client.get(link.path, { headers: options.extraHTTPHeaders })
        assert.equal(res.status(), 200, link.path)
        checkReadingHTML(await res.text(), link.path)
      }),
    )
  }
  return links
}

async function screenshot(page, selector, slug) {
  const el = page.locator(selector).first()
  await page.evaluate(() => document.fonts.ready)
  assert.match(await el.evaluate((element) => getComputedStyle(element).fontFamily), /Inter/)
  await el.scrollIntoViewIfNeeded()
  await el.screenshot({ path: path.join(resultsDir, slug + '.png') })
}

async function runProgram(browser, mentor, program, outsider) {
  const course = courses[program]
  const ms = manifest.meetings.filter((m) => m.program === program).sort((a, b) => a.number - b.number)
  const account = { email: 'journey-' + program + '-' + randomUUID() + '@lms.test', password: randomUUID() + 'aA1!' }
  const { doc: user } = await api(adminApi, 'post', 'users', {
    ...account,
    firstName: 'Ученик',
    lastName: course.label,
    role: 'student',
    isActive: true,
    learningAccessMode: 'assigned',
    trainerAccessMode: 'assigned',
  })
  const student = await browser.newContext({ baseURL: origin, viewport: { width: 1340, height: 950 }, locale: 'ru-RU' })
  const learner = await student.newPage()
  const base = '/tutoring/' + program
  const admin = await mentor.newPage()
  try {
    await login(student.request, account, 'student')
    await denied(student.request, base + '/introduction')
    const { doc: stream } = await api(adminApi, 'post', 'tutoring-streams', {
      title: 'Учебная репетиция ' + course.label,
      program,
      startsAt: '2028-01-11T17:00:00.000Z',
      introductionStartsAt: '2028-01-10T17:00:00.000Z',
      status: 'draft',
      currentMeeting: 1,
      awaitingFirstLecture: true,
    })
    const room = base + '/streams/' + stream.id
    const { doc: member } = await api(adminApi, 'post', 'tutoring-participants', {
      stream: stream.id,
      student: user.id,
      active: true,
      currentMeeting: 1,
    })
    await denied(student.request, room)
    await api(adminApi, 'patch', 'tutoring-streams/' + stream.id, { status: 'active' })
    const profile = room + '?participant=' + member.id
    const { job, webhook } = await api(guest, 'post', 'internal/tutoring-projects/claim', {}, worker)
    assert.equal(job.email, account.email)
    assert.equal(job.group, program + '-bootcamp/mentoring-' + program)
    assert.equal(job.autoResolveUsername, true)
    const git = 'https://gitlab.test/' + job.group + '/' + job.username
    const glid = 80000 + job.id
    await api(
      guest,
      'post',
      'internal/tutoring-projects/' + job.id + '/report',
      { lease: job.lease, status: 'done', gitlabUserId: 90000 + user.id, gitlabProjectId: glid, gitlabProjectUrl: git },
      worker,
    )
    await learner.goto('/tutoring')
    await learner
      .getByRole('link', { name: new RegExp('Учебная репетиция') })
      .first()
      .click()
    await expect(learner.getByRole('link', { name: 'Открыть учебный проект GitLab' })).toHaveAttribute('href', git)
    await denied(student.request, base + '/lectures/1')
    assert.equal(await learner.getByLabel('Ссылка на работу').count(), 0)
    const introLink = learner.locator('a[href="' + base + '/introduction"]').first()
    await introLink.click()
    await expect(learner.getByRole('link', { name: 'Скачать PDF' })).toBeVisible()
    assert.equal(await learner.getByText('Сценарий и заметки ведущего').count(), 0)
    assert.equal(await learner.locator('form:has(input[name="rate"])').count(), 0)
    const introMR = git + '/-/merge_requests/999'
    const trial = learner.locator('#intro-practice-' + stream.id)
    await trial.locator('input[name="submission"]').fill(introMR)
    await trial.getByRole('button', { name: 'Отправить пробную работу' }).click()
    await expect(trial.getByRole('link', { name: 'Открыть пробную работу' })).toHaveAttribute('href', introMR)
    assert.equal((await collection(adminApi, 'tutoring-reviews?where[participant][equals]=' + member.id)).totalDocs, 0)
    const intros = (await collection(adminApi, 'tutoring-introductions?where[program][equals]=' + program + '&depth=1'))
      .docs
    assert.equal(intros.length, 1)
    const intro = intros[0]
    const projected =
      manifest.introductions ?? JSON.parse(await readFile(path.join(root, 'introductions.json'), 'utf8')).introductions
    const files = Array.isArray(projected) ? projected : Object.values(projected)
    const introduction = files.find((item) => item.program === program)
    assert(introduction)
    const introPDF = await learner.getByRole('link', { name: 'Скачать PDF' }).getAttribute('href')
    await fileAt(student.request, introPDF, introduction.presentation)
    await denied(guest, introPDF, true)
    await denied(outsider, introPDF, true)
    await denied(student.request, '/api/tutoring-deck-files/file/' + encodeURIComponent(intro.deckPptx.filename), true)
    await admin.goto(profile)
    await expect(admin.getByRole('link', { name: 'Открыть пробную работу вводной встречи' })).toHaveAttribute(
      'href',
      introMR,
    )
    await admin.getByRole('button', { name: 'Открыть первую лекцию', exact: true }).click()
    await expect(admin.getByRole('button', { name: 'Открыть первую лекцию', exact: true })).toHaveCount(0)
    const docs = (
      await collection(adminApi, 'tutoring-meetings?where[program][equals]=' + program + '&depth=1&limit=64')
    ).docs
    assert.equal(docs.length, course.length)
    const byNumber = new Map(docs.map((doc) => [doc.number, doc]))
    let tailReading = ''
    for (const m of ms) {
      const n = m.number
      if (n > 1) {
        await admin.goto(profile)
        await admin.getByLabel('Текущая встреча ученика').selectOption(String(n))
        await admin.getByRole('button', { name: 'Сохранить отметку' }).click()
        await expect(admin.getByText('Отметка сохранена', { exact: true })).toBeVisible()
      }
      await learner.goto(room + '?meeting=' + n)
      await expect(learner.getByRole('heading', { name: m.presentationTitle, exact: true })).toBeVisible()
      assert.equal(await learner.getByText('Сценарий и заметки ведущего').count(), 0)
      assert.equal(await learner.getByRole('link', { name: 'Скачать редактируемый PPTX' }).count(), 0)
      const pdf = await learner.getByRole('link', { name: 'Скачать PDF' }).getAttribute('href')
      await fileAt(student.request, pdf, m.presentation)
      if (n === 1 || n === ms.length) {
        await denied(outsider, room + '?meeting=' + n)
        await denied(outsider, pdf, true)
        await denied(
          student.request,
          '/api/tutoring-deck-files/file/' + encodeURIComponent(byNumber.get(n).deckPptx.filename),
          true,
        )
      }
      if (n < ms.length) {
        const next = byNumber.get(n + 1)
        await denied(student.request, room + '?meeting=' + (n + 1))
        await denied(
          student.request,
          '/api/tutoring-deck-files/file/' + encodeURIComponent(next.deckPdf.filename),
          true,
        )
      }
      if (n === 1) await screenshot(learner, '#homework', program + '-assignment')
      const links = await checkReadings(student.request, learner, m.homework)
      tailReading = links[1].path.split('/').at(-1)
      const evidence = m.homework.map((task) => localRevision(program, task.stage))
      const mrIid = 2 * n
      const mr = git + '/-/merge_requests/' + mrIid
      const previousMR = evidence.length === 2 ? git + '/-/merge_requests/' + (mrIid - 1) : null
      // В тестовом браузере открываются карточки запросов на слияние с хешами реальных снимков.
      const workCard = (item, previous = '') =>
        '<h1>Работа по этапу ' + item.stage + '</h1><p>Коммит ' + item.sha + '</p>' + previous
      if (previousMR) {
        await student.route(previousMR, (route) =>
          route.fulfill({ contentType: 'text/html; charset=utf-8', body: workCard(evidence[0]) }),
        )
      }
      const previous = previousMR ? '<a href="' + previousMR + '">Работа по первому этапу</a>' : ''
      await student.route(mr, (route) =>
        route.fulfill({ contentType: 'text/html; charset=utf-8', body: workCard(evidence.at(-1), previous) }),
      )
      const submit = async () => {
        await learner.getByLabel('Ссылка на работу').fill(mr)
        await learner.getByRole('button', { name: 'Сдать работу' }).click()
        await expect(learner.getByText('На проверке', { exact: true }).first()).toBeVisible()
      }
      const grade = async (status, feedback) => {
        await admin.goto(profile + '&review=' + n + '#homework')
        const form = admin
          .locator('form')
          .filter({ has: admin.getByRole('button', { name: 'Сохранить результат проверки' }) })
        await form.getByLabel('Статус').selectOption(status)
        await form.getByLabel('Комментарий ученику').fill(feedback)
        await form.getByRole('button', { name: 'Сохранить результат проверки' }).click()
        await expect(admin.getByText('Результат проверки сохранён', { exact: true })).toBeVisible()
      }
      await submit()
      const work = await student.newPage()
      try {
        await work.goto(mr)
        await expect(work.locator('body')).toContainText(evidence.at(-1).sha)
        if (previousMR) {
          await work.getByRole('link', { name: 'Работа по первому этапу' }).click()
          await expect(work.locator('body')).toContainText(evidence[0].sha)
        }
      } finally {
        await work.close()
      }
      if (n === 1) {
        const feedback = 'Покажите, как проверить результат на данных проекта.'
        await grade('changes', feedback)
        await learner.reload()
        await expect(learner.getByText(feedback, { exact: true })).toBeVisible()
        await screenshot(learner, '#homework', program + '-revision')
        await submit()
        const note = {
          user: { id: 58741, username: 'qa_grader_bot' },
          project: { id: glid },
          merge_request: { iid: mrIid, url: mr },
          object_attributes: {
            noteable_type: 'MergeRequest',
            updated_at: new Date().toISOString(),
            note: '<!-- grader:01:5d1444952459 -->\n**Доверенная проверка: неделя 1 - пройдена**\nПрошло проверок: 1 из 1.',
          },
        }
        const observed = await api(guest, 'post', 'tutoring/gitlab-events?project=' + job.id, note, {
          'x-gitlab-token': webhook.token,
          'x-gitlab-event': 'Note Hook',
        })
        assert.equal(observed.recorded, true)
      }
      await grade('accepted', 'Разбор проверен на встрече ' + n + '.')
      await learner.reload()
      await expect(learner.locator('#homework').getByText('Принято', { exact: true })).toBeVisible()
      await expect(
        learner.locator('#homework').getByRole('link', { name: 'Открыть отправленную работу' }),
      ).toHaveAttribute('href', mr)
      if (n === 1) {
        await expect(learner.locator('#homework')).toContainText('пройдена')
        await screenshot(learner, '#homework', program + '-accepted')
      }
      results.meetings.push({
        program,
        meeting: n,
        title: m.presentationTitle,
        stream: stream.id,
        participant: member.id,
        stages: evidence,
        readings: links.length,
        status: 'accepted',
        trialGitlabNote: n === 1,
        revisionRequested: n === 1,
        localMr: mrIid,
        relatedMr: previousMR ? mrIid - 1 : null,
      })
      await checkpoint()
      process.stdout.write(program + ' ' + n + '/' + ms.length + '\n')
    }
    await admin.goto(profile)
    await admin.getByRole('button', { name: 'Завершить обучение', exact: true }).click()
    await expect(admin.getByText('Обучение завершено', { exact: true }).first()).toBeVisible()
    await api(adminApi, 'patch', 'tutoring-streams/' + stream.id, { status: 'archived' })
    await api(student.request, 'post', 'users/logout', {})
    await login(student.request, account, 'student')
    await learner.goto(base + '/materials')
    await expect(learner.getByRole('heading', { name: 'Мои материалы' })).toBeVisible()
    for (const number of [1, ms.length]) {
      await learner
        .locator('a[href="' + base + '/lectures/' + number + '"]')
        .first()
        .click()
      await fileAt(
        student.request,
        await learner.getByRole('link', { name: 'Скачать PDF' }).getAttribute('href'),
        ms[number - 1].presentation,
      )
      assert.equal(await learner.getByText('Сценарий и заметки ведущего').count(), 0)
      await learner.goto(base + '/materials')
    }
    const readingPath = base + '/lectures/' + ms.length + '/readings/' + tailReading
    checkReadingHTML(
      await (await student.request.get(readingPath, { headers: options.extraHTTPHeaders })).text(),
      readingPath,
    )
    await fileAt(student.request, introPDF, introduction.presentation)
    await learner.goto(room)
    await expect(learner.getByRole('heading', { name: 'Мои материалы' })).toBeVisible()
    assert.equal(await learner.getByRole('button', { name: 'Сдать работу' }).count(), 0)
    await denied(outsider, base + '/materials')
    const revoked = await api(guest, 'post', 'internal/tutoring-projects/claim', {}, worker)
    assert(revoked.job?.revoke && revoked.job.id === job.id)
    await api(
      guest,
      'post',
      'internal/tutoring-projects/' + job.id + '/report',
      { lease: revoked.job.lease, status: 'revoked' },
      worker,
    )
    await screenshot(learner, 'main', program + '-library')
    results[program] = {
      graduate: true,
      archived: true,
      introPdf: true,
      firstAndLast: true,
      graduateReading: tailReading,
      charges: (await collection(adminApi, 'tutoring-charges?where[participant][equals]=' + member.id)).totalDocs,
    }
    assert.equal(results[program].charges, 0)
    await checkpoint()
  } finally {
    await student.close()
    await admin.close()
  }
}

process.stdout.write('Отчет ' + resultsDir + '\n')
let browser, mentor, outsider
try {
  await login(adminApi, USERS.admin, 'admin')
  for (const p of Object.keys(courses)) await prepareReadings(adminApi, manifest.meetings, p)
  const env = {
    ...process.env,
    LMS_URL: origin,
    LMS_ADMIN_EMAIL: USERS.admin.email,
    LMS_ADMIN_PASSWORD: USERS.admin.password,
  }
  execFileSync(
    process.execPath,
    [
      'scripts/import-tutoring-meetings.mjs',
      root,
      '--node-practice',
      courses.nodejs.readings,
      '--react-practice',
      courses['react-next'].readings,
      '--apply',
    ],
    { env, stdio: 'inherit' },
  )
  const localWS = process.env.TUTORING_QA_BROWSER_WS
  if (localWS) {
    const url = new URL(localWS)
    assert(url.protocol === 'ws:' && url.hostname === '127.0.0.1')
    browser = await chromium.connect(localWS, { exposeNetwork: '<loopback>' })
  } else {
    const yandex = '/Applications/Yandex.app/Contents/MacOS/Yandex'
    browser = await chromium.launch(existsSync(yandex) ? { executablePath: yandex } : undefined)
  }
  mentor = await browser.newContext({ baseURL: origin, storageState: await adminApi.storageState() })
  outsider = await request.newContext(options)
  await login(outsider, USERS.student, 'student')
  for (const program of Object.keys(courses)) await runProgram(browser, mentor, program, outsider)
  assert.equal(results.meetings.length, 56)
  assert.equal(
    results.meetings.reduce((n, row) => n + row.stages.length, 0),
    84,
  )
  results.partial = false
  await checkpoint()
  const csv = [
    [
      'Курс',
      'Встреча',
      'Лекция',
      'Этапы',
      'Открыто ссылок на чтение',
      'Запрос на слияние (модель)',
      'Связанный запрос (модель)',
      'Коммиты заданий',
      'Решение наставника',
      'Доработка и повтор',
      'Вердикт из тестового webhook',
    ],
    ...results.meetings.map((row) => [
      courses[row.program].label,
      row.meeting,
      row.title,
      row.stages.map((item) => (item.stage === 0 ? 'Подготовка' : item.stage)).join(' / '),
      row.readings,
      row.localMr,
      row.relatedMr ?? '',
      row.stages.map((item) => item.sha).join(' / '),
      'Принято',
      row.revisionRequested ? 'Проверено' : '',
      row.trialGitlabNote ? 'Получен' : '',
    ]),
  ]
  const cell = (value) => '"' + String(value).replaceAll('"', '""') + '"'
  await writeFile(
    path.join(resultsDir, 'meetings.csv'),
    '\ufeff' + csv.map((columns) => columns.map(cell).join(',')).join('\r\n') + '\r\n',
    { mode: 0o600 },
  )
  process.stdout.write('Два выпускника, 56 встреч, 84 назначения и 252 чтения. Отчет ' + resultsDir + '\n')
} finally {
  await Promise.allSettled([
    mentor?.close(),
    outsider?.dispose(),
    browser?.close(),
    adminApi.dispose(),
    guest.dispose(),
  ])
}

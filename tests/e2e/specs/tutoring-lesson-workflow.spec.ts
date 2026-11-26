import { randomUUID } from 'node:crypto'
import { expect, test, type APIResponse } from '@playwright/test'
import { blankPDF } from '../../fixtures/blank-pdf'
import { createAccount, deleteAccount, signedInContext } from '../fixtures/accounts'
import { CONTENT } from '../fixtures/data'
import { storageStateOf } from '../fixtures/env'

test.use({ storageState: storageStateOf('admin') })

async function documentOf(response: APIResponse) {
  expect(response.ok(), `HTTP ${response.status()} ${new URL(response.url()).pathname}`).toBe(true)
  return response.json()
}

test('ментор ведет группу от приглашения до выпуска одного ученика', async ({ page, browser }) => {
  test.setTimeout(180_000)
  const admin = page.request
  const [course] = (await documentOf(await admin.get(`/api/courses?where[slug][equals]=${CONTENT.bootcamp.slug}&depth=0`))).docs
  const [existingProgram] = (await documentOf(await admin.get('/api/bootcamp-programs?where[key][equals]=react-next&depth=0'))).docs
  const program = existingProgram ?? (await documentOf(await admin.post('/api/bootcamp-programs', { data: {
    key: 'react-next', title: 'React', shortTitle: 'React', landingUrl: 'https://example.test/react',
    priceKopecks: 10000, paymentDueDays: 7, offerUrl: 'https://example.test/offer', offerVersion: '1', receiptItemName: 'Курс React',
    entryTaskSet: 'rental-js', gitlabStreamGroup: 'react-bootcamp/mass', gitlabCourseProject: 'react-bootcamp/course',
    gradingProject: 'react-staff/grading', mentoringGitlabGroup: 'react-bootcamp/mentoring', mentoringGraderUserId: 34,
  } }))).doc
  const programPath = `/api/bootcamp-programs/${program.id}`
  const present = await createAccount(admin, { firstName: 'Ирина', lastName: 'Морозова', learningAccessMode: 'assigned' })
  const absent = await createAccount(admin, { firstName: 'Анна', lastName: 'Орлова', learningAccessMode: 'assigned' })
  const pupil = await signedInContext(browser, present)
  const lessons: number[] = []
  let streamId: number | undefined
  try {
    await documentOf(await admin.patch(programPath, { data: { manualsCourse: course.id } }))
    const existing = (await documentOf(await admin.get('/api/tutoring-meetings?where[program][equals]=react-next&limit=24&depth=0'))).docs as { number: number }[]
    const pdf = blankPDF(1, 160, 90)
    for (let number = 1; number <= 24; number++) {
      if (existing.some(m => m.number === number)) continue
      const result = await documentOf(await admin.post('/api/tutoring-meetings', { multipart: {
        _payload: JSON.stringify({ program: 'react-next', number, title: `Компоненты. Встреча ${number}`, homework: [{ stage: 1, description: 'Подготовить компонент каталога' }] }),
        file: { name: `react-workflow-${number}.pdf`, mimeType: 'application/pdf', buffer: pdf },
      } }))
      lessons.push(result.doc.id)
    }
    const streams = '/tutoring/react-next/streams'
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(streams)
    const form = page.getByRole('form', { name: 'Создать поток' })
    const title = `Группа ${randomUUID().slice(0, 8)}`
    await form.getByLabel('Название', { exact: true }).fill(title)
    await form.getByLabel('Первый вторник').fill('2025-04-01')
    await form.locator('[name="rate"]').fill('1800')
    await form.locator('[name="inviteEmails"]').fill([present.email, absent.email].join('\n'))
    await form.getByRole('button', { name: 'Открыть поток и пригласить' }).click()
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    streamId = Number(new URL(page.url()).pathname.split('/').at(-1))
    expect(streamId).toBeGreaterThan(0)
    const room = `${streams}/${streamId}`
    await page.getByRole('button', { name: 'Открыть первую лекцию' }).click()
    const attendance = page.locator('#attendance')
    await attendance.getByRole('checkbox', { name: present.name }).check()
    await attendance.getByLabel('Фактическое время, мин').fill('75')
    await attendance.getByRole('button', { name: 'Завершить встречу' }).click()
    await expect(page.getByRole('status').filter({ hasText: /^Встреча завершена$/ })).toBeVisible()
    const members = (await documentOf(await admin.get(`/api/tutoring-participants?where[stream][equals]=${streamId}&depth=0`))).docs as { id: number; student: number; currentMeeting: number }[]
    const member = members.find(m => m.student === present.id)
    expect(member?.currentMeeting).toBe(2)
    expect(members.find(m => m.student === absent.id)?.currentMeeting).toBe(1)
    const learner = await pupil.newPage()
    await learner.goto('/')
    const menu = learner.locator('aside').getByRole('navigation', { name: 'Меню платформы' })
    await menu.getByRole('link', { name: 'Менторство', exact: true }).click()
    await expect(learner.getByRole('heading', { level: 1, name: 'Менторство' })).toBeVisible()
    await expect(learner.locator('main a[href="/manage"]')).toHaveCount(0)
    await learner.getByRole('region', { name: 'Мои потоки' }).getByRole('link', { name: new RegExp(title) }).click()
    await expect(learner).toHaveURL(new RegExp(room + '$'))
    const pendingPayment = learner.getByRole('region', { name: 'Оплата занятий' })
    await expect(pendingPayment).toContainText(/2\s?250/)
    await expect(learner.getByRole('link', { name: 'Сдать работу за встречу 1' })).toBeVisible()
    await pendingPayment.getByRole('link', { name: /Встреча 1/ }).click()
    await expect(learner.getByRole('region', { name: 'Оплата встречи' })).toContainText(/К оплате.*2\s?250/)

    await page.goto(streams)
    await page.locator('#tasks a[href$="review=1#payment"]').filter({ hasText: present.email }).click()
    await expect(page).toHaveURL(/review=1#payment$/)
    await page.locator('#payment').getByRole('button', { name: 'Отметить оплату' }).click()
    await expect(page.getByRole('status').filter({ hasText: /^Оплата встречи сохранена$/ })).toBeVisible()
    await learner.reload()
    await expect(learner.getByRole('region', { name: 'Оплата встречи' })).toContainText(/Оплачено.*2\s?250/)
    await page.goto(`${room}?participant=${member?.id}#student`)
    await page.getByRole('button', { name: 'Завершить обучение' }).click()
    await expect(page.getByText(/Обучение завершено\. Доступны материалы по встречу 2/)).toBeVisible()
    await learner.goto(room)
    await expect(learner).toHaveURL(/\/materials$/)
    await expect(learner.locator('a[href$="/lectures/2"]')).toBeVisible()
    await expect(learner.locator('a[href$="/lectures/3"]')).toHaveCount(0)
    await learner.locator('a[href$="/lectures/2"]').click()
    await expect(learner.getByRole('heading', { name: /Встреча 2/ }).first()).toBeVisible()
    await expect(learner.getByRole('button', { name: 'Сдать работу' })).toHaveCount(0)
    const pdfLink = await learner.getByRole('link', { name: 'Скачать PDF' }).getAttribute('href')
    if (!pdfLink) throw new Error('У выпускника нет ссылки на презентацию')
    const presentation = await learner.request.get(new URL(pdfLink, learner.url()).href)
    expect(presentation.status()).toBe(200)
    expect((await presentation.body()).subarray(0, 5).toString('ascii')).toBe('%PDF-')
    expect(await learner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await pupil.close()
    if (streamId) await admin.delete(`/api/tutoring-streams/${streamId}`)
    for (const id of lessons) await admin.delete(`/api/tutoring-meetings/${id}`)
    await deleteAccount(admin, present)
    await deleteAccount(admin, absent)
    if (existingProgram) await admin.patch(programPath, { data: { manualsCourse: existingProgram.manualsCourse ?? null } })
    else await admin.delete(programPath)
  }
})

test('старый адрес получает приглашение после сверки наставником и повторной отправки', async ({ page }) => {
  const admin = page.request
  const email = `identity-${randomUUID()}@lms.test`
  // В разделе управления создается аккаунт без письма для установки пароля.
  const account = (await documentOf(await admin.post('/api/manage/students', {
    data: { firstName: 'Инна', lastName: 'Тихонова', email },
  }))).student
  const [course] = (await documentOf(await admin.get(`/api/courses?where[slug][equals]=${CONTENT.bootcamp.slug}&depth=0`))).docs
  const [program] = (await documentOf(await admin.get('/api/bootcamp-programs?where[key][equals]=nodejs&depth=0'))).docs
  let streamId: number | undefined
  try {
    await documentOf(await admin.patch(`/api/bootcamp-programs/${program.id}`, { data: { manualsCourse: course.id } }))
    const created = (await documentOf(await admin.post('/api/tutoring-streams', {
      data: { title: 'Сверка перед приглашением', program: 'nodejs', startsAt: '2027-02-16T17:00:00Z', status: 'active', awaitingFirstLecture: true, currentMeeting: 1 },
    }))).doc
    streamId = created.id
    const room = '/tutoring/nodejs/streams/' + streamId
    const countMembers = async () => (await documentOf(await admin.get(`/api/tutoring-participants?depth=0&where[stream][equals]=${streamId}`))).totalDocs

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(room)
    await page.locator('form').filter({ has: page.getByRole('button', { name: 'Добавить в поток' }) }).getByRole('textbox').fill(email)
    await page.getByRole('button', { name: 'Добавить в поток' }).click()
    const waiting = page.getByRole('region', { name: 'Нужно сверить почту' })
    await expect(waiting).toContainText(email)
    expect(await countMembers()).toBe(0)
    await waiting.getByRole('link', { name: /Сверить адрес/ }).click()
    await expect(page).toHaveURL(new RegExp('learning-access\\?user=' + account.id + '#enrollment-identity$'))
    const identity = page.locator('#enrollment-identity')
    await expect(identity.getByRole('button', { name: 'Сверить адрес для зачисления' })).toHaveAttribute('aria-expanded', 'true')
    await expect(identity).toContainText(email)
    await identity.getByRole('button', { name: 'Подтвердить адрес ученика' }).click()
    await expect(identity).toHaveText(/Адрес для зачисления подтвержден/)
    expect(await countMembers()).toBe(0)
    await page.goto(room)
    await waiting.getByRole('button', { name: 'Повторить приглашения' }).click()
    await expect(page.getByRole('status').filter({ hasText: /^Приглашения проверены$/ })).toBeVisible()
    await expect(waiting).toHaveCount(0)
    expect(await countMembers()).toBe(1)
  } finally {
    if (streamId) await admin.delete(`/api/tutoring-streams/${streamId}`)
    await admin.patch(`/api/bootcamp-programs/${program.id}`, { data: { manualsCourse: program.manualsCourse ?? null } })
    await admin.delete(`/api/users/${account.id}`)
  }
})

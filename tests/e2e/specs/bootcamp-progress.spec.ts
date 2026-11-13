import { createHmac } from 'node:crypto'
import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { APP_URL, storageStateOf } from '../fixtures/env'
import { E2E_SECRET } from '../fixtures/data'
import { query } from '../fixtures/db'

const DAY = 86_400_000
const gitlabDate = (ms: number) => new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')

test('администратор видит недели потока по событиям GitLab; ученику экран закрыт', async ({ browser }, testInfo) => {
  const admin = await browser.newContext({ storageState: storageStateOf('admin') })
  const student = await browser.newContext({ storageState: storageStateOf('student') })
  const suffix = Date.now().toString(36)
  const group = `e2e-stream-${suffix}`
  const username = `e2e-student-${suffix}`
  let streamId: number | undefined
  let leadId: number | undefined
  let enrollmentId: number | undefined
  try {
    const now = Date.now()
    const stream = await admin.request.post(`${APP_URL}/api/bootcamp-streams`, { data: { title: `Поток e2e ${suffix}`, program: 'nodejs', gitlabGroup: group, startsAt: new Date(now - 14 * DAY).toISOString(), weeks: [{ week: 1, dueAt: new Date(now - 3 * DAY).toISOString() }, { week: 2, dueAt: new Date(now + 4 * DAY).toISOString() }] } })
    expect(stream.status()).toBe(201)
    streamId = (await stream.json()).doc.id as number
    // Зачисление заводит исполнитель в VM GitLab: у теста этого канала нет, поэтому строки - прямо в базе.
    ;[{ id: leadId }] = await query<{ id: number }>(`insert into bootcamp_leads (email, name, program, status, consent_version, consent_at) values ($1, 'Ева Сдающая', 'nodejs', 'enrolled', '2026-10-26', now()) returning id`, [`${username}@mail.test`])
    ;[{ id: enrollmentId }] = await query<{ id: number }>(`insert into bootcamp_enrollments (lead_id, email, first_name, last_name, gitlab_username, stream_group, status, gitlab_project_id) values ($1, $2, 'Ева', 'Сдающая', $3, $4, 'done', $5) returning id`, [leadId, `${username}@mail.test`, username, group, 700_000 + Math.floor(Math.random() * 100_000)])

    const project = { path_with_namespace: `${group}/${username}`, web_url: `https://git.test/${group}/${username}` }
    const mr = { iid: 1, title: 'Неделя 1', url: `${project.web_url}/-/merge_requests/1`, source_branch: 'week-01' }
    const token = createHmac('sha256', E2E_SECRET).update('lms-gitlab-webhook-v1').digest('hex')
    const hook = (event: string, data: unknown) => admin.request.post(`${APP_URL}/api/bootcamp/gitlab-events`, { headers: { 'X-Gitlab-Event': event, 'X-Gitlab-Token': token }, data })
    expect((await hook('Merge Request Hook', { project, user: { username }, object_attributes: { ...mr, action: 'open', target_branch: 'main', created_at: gitlabDate(now - 6 * DAY) } })).status()).toBe(200)
    const note = '<!-- grader:01:5d144495245925e03934d5445e6f059c9b19c79d -->\n**Доверенная проверка: неделя 1 - пройдена**\n\nКоммит `5d1444952459`, попытка 1. Прошло проверок: 26 из 26.'
    expect((await hook('Note Hook', { project, user: { username: 'group_5_bot_e2e', name: 'grader-bot' }, merge_request: mr, object_attributes: { noteable_type: 'MergeRequest', note, created_at: gitlabDate(now - 5 * DAY), updated_at: gitlabDate(now - 5 * DAY) } })).status()).toBe(200)

    const page = await admin.newPage()
    await page.goto(`/admin/bootcamp-progress?stream=${streamId}`)
    await expect(page.getByRole('heading', { name: 'Учёба буткемпа', level: 1 })).toBeVisible()
    await expect(page.getByLabel('Итоги потока')).toContainText('Ревью дольше 3 дней1')
    const row = page.getByRole('region', { name: 'Недели учеников' }).getByRole('row', { name: /Ева Сдающая/ })
    const week = row.getByRole('link', { name: /^Неделя 1: ждёт ревью, ждёт 5 дней, проверок 26 из 26, .*срок прошёл, ревью дольше 3 дней$/ })
    await expect(week).toHaveText('5 дн')
    await expect(week).toHaveAttribute('href', mr.url)
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 920 })
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => { document.documentElement.dataset.theme = value }, theme)
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        const accessibility = await new AxeBuilder({ page }).include('.bootcamp-progress').withRules(['color-contrast', 'label', 'button-name', 'link-name', 'scrollable-region-focusable']).analyze()
        expect(accessibility.violations).toEqual([])
      }
    }
    await page.setViewportSize({ width: 1440, height: 920 })
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
    await page.locator('.bootcamp-progress').screenshot({ path: testInfo.outputPath('bootcamp-progress.png') })
    expect((await student.request.get(`${APP_URL}/api/manage/bootcamp-progress`)).status()).toBe(403)
  } finally {
    if (enrollmentId) await admin.request.delete(`${APP_URL}/api/bootcamp-enrollments/${enrollmentId}`)
    if (leadId) await admin.request.delete(`${APP_URL}/api/bootcamp-leads/${leadId}`)
    if (streamId) await admin.request.delete(`${APP_URL}/api/bootcamp-streams/${streamId}`)
    await student.close()
    await admin.close()
  }
})

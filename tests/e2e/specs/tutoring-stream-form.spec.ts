import { expect, test } from '@playwright/test'

import { CONTENT } from '../fixtures/data'
import { storageStateOf } from '../fixtures/env'

test.use({ storageState: storageStateOf('admin') })

test('длинное название календаря не растягивает поля формы создания потока', async ({ page }) => {
  const { request } = page
  const programs = await request.get('/api/bootcamp-programs?where[key][equals]=nodejs&depth=0')
  const courses = await request.get(`/api/courses?where[slug][equals]=${CONTENT.bootcamp.slug}&depth=0`)
  expect(programs.ok() && courses.ok()).toBe(true)
  const [program] = (await programs.json()).docs
  const [course] = (await courses.json()).docs
  const programUrl = `/api/bootcamp-programs/${program.id}`
  const title = 'Вечерний поток разработки на Node.js для опытных фронтенд-разработчиков'
  const calendar = await request.post('/api/bootcamp-streams', { data: {
    title, program: 'nodejs', gitlabGroup: `layout-${Date.now()}`, startsAt: '2027-02-16T17:00:00Z',
    weeks: [{ week: 1, dueAt: '2027-02-23T17:00:00Z' }],
  } })
  expect(calendar.ok(), await calendar.text()).toBe(true)
  const { doc } = await calendar.json()
  const draftTitle = `Черновик с приглашениями ${Date.now()}`
  try {
    expect((await request.patch(programUrl, { data: { manualsCourse: course.id } })).ok()).toBe(true)
    await page.goto('/tutoring/nodejs/streams')
    const form = page.getByRole('form', { name: 'Создать поток' })
    await expect(form.getByRole('button', { name: 'Открыть поток и пригласить' })).toBeVisible()
    await expect(form.getByRole('button', { name: 'Сохранить черновик' })).toBeVisible()
    await form.getByLabel('Ставка за час').fill('1800,50')
    await form.getByLabel('Кого пригласить').fill('Ирина Белова <irina@example.test>\nstudent@example.test')
    await form.getByLabel('Взять календарь буткемпа').selectOption(String(doc.id))
    for (const width of [320, 390, 768, 1024, 1451]) {
      await page.setViewportSize({ width, height: 900 })
      const card = await form.boundingBox()
      if (!card) throw new Error('Форма не отображается')
      expect(card.x).toBeGreaterThanOrEqual(0)
      expect(card.x + card.width).toBeLessThanOrEqual(width + 1)
      const overflow = await form.evaluate(card => {
        const rect = card.getBoundingClientRect()
        const style = getComputedStyle(card)
        const left = rect.left + card.clientLeft + parseFloat(style.paddingLeft)
        const right = rect.left + card.clientLeft + card.clientWidth - parseFloat(style.paddingRight)
        return [...card.querySelectorAll('input:not([type=hidden]), textarea, select, button')].filter(control => {
          const box = control.getBoundingClientRect()
          return box.left < left - 1 || box.right > right + 1
        }).map(control => control.getAttribute('name') ?? control.textContent)
      })
      expect(overflow, `Границы полей при ширине ${width}`).toEqual([])
      if (width === 320 || width === 1451) {
        const date = await form.getByLabel('Первый вторник').boundingBox()
        const time = await form.getByLabel('Время МСК').boundingBox()
        if (!date || !time) throw new Error('Дата или время не отображается')
        if (width === 320) expect(time.y).toBeGreaterThanOrEqual(date.y + date.height)
        else expect(time.y).toBe(date.y)
      }
    }
    await form.getByLabel('Название', { exact: true }).fill(draftTitle)
    await form.getByLabel('Кого пригласить').fill('неверный адрес')
    await form.getByRole('button', { name: 'Открыть поток и пригласить' }).click()
    await expect(form.getByRole('alert')).toContainText('Проверьте почту')
    await expect(form.getByLabel('Название', { exact: true })).toHaveValue(draftTitle)
    await expect(form.getByLabel('Взять календарь буткемпа')).toHaveValue(String(doc.id))
    await expect(form.getByLabel('Ставка за час')).toHaveValue('1800,50')
    await form.getByLabel('Кого пригласить').fill('Ирина Белова <irina@example.test>')
    await form.getByRole('button', { name: 'Сохранить черновик' }).click()
    await expect(page).toHaveURL(/\/tutoring\/nodejs\/streams\/\d+\?saved=/)
    const result = await request.get(`/api/tutoring-streams?depth=0&where[title][equals]=${encodeURIComponent(draftTitle)}`)
    expect((await result.json()).docs).toMatchObject([{ status: 'draft', hourlyKopecks: 180050, pendingInviteEmails: 'Ирина Белова <irina@example.test>' }])
  } finally {
    const drafts = await request.get(`/api/tutoring-streams?depth=0&where[title][equals]=${encodeURIComponent(draftTitle)}`)
    if (drafts.ok()) for (const draft of (await drafts.json()).docs) await request.delete(`/api/tutoring-streams/${draft.id}`)
    await request.delete(`/api/bootcamp-streams/${doc.id}`)
    await request.patch(programUrl, { data: { manualsCourse: program.manualsCourse ?? null } })
  }
})

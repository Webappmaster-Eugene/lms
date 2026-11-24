import { expect, test, type APIResponse } from '@playwright/test'
import { readFile } from 'node:fs/promises'

import { blankPDF } from '../../fixtures/blank-pdf'
import { CONTENT } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

test.use({ storageState: storageStateOf('admin') })

async function json(response: APIResponse) {
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}

test('в лекции наставник рисует и печатает, ученику доступен исходный PDF', async ({ browser, page }, testInfo) => {
  const course = await json(await page.request.get(`/api/courses?where[slug][equals]=${CONTENT.bootcamp.slug}&depth=0`))
  const programs = await json(await page.request.get('/api/bootcamp-programs?where[key][equals]=nodejs&depth=0'))
  const program = programs.docs[0]
  await json(await page.request.patch(`/api/bootcamp-programs/${program.id}`, { data: { manualsCourse: course.docs[0].id } }))
  const original = blankPDF(4, 160, 90)
  const snippet = "const response = await fetch('/catalog/42')\nconst item = await response.json()"
  const notes = ['## Заметки для наставника', '### Код запроса', '```js\n' + snippet + '\n```',
    '### Вывод', '```text\n200\nДрель\n```'].join('\n\n')
  const meetings = await json(await page.request.get('/api/tutoring-meetings?where[program][equals]=nodejs&where[number][equals]=1&depth=0'))
  const meeting = meetings.docs[0] ?? (await json(await page.request.post('/api/tutoring-meetings', { multipart: {
    _payload: JSON.stringify({ program: 'nodejs', number: 1, title: 'Два запроса к серверу', instructorNotes: notes,
      homework: [{ stage: 1, description: 'Проверить два запроса' }] }),
    file: { name: 'original-lecture.pdf', mimeType: 'application/pdf', buffer: original },
  } }))).doc
  expect(meeting.title).toBe('Два запроса к серверу')
  const student = await browser.newContext({ storageState: storageStateOf('student') })
  try {
    const learner = await json(await student.request.get(`${APP_URL}/api/users/me`, { headers: { Origin: APP_URL } }))
    const stream = await json(await page.request.post('/api/tutoring-streams', { data: {
      program: 'nodejs', title: 'Контроль показа', startsAt: '2027-02-16T17:00:00.000Z', status: 'active', currentMeeting: 1,
    } }))
    await json(await page.request.post('/api/tutoring-participants', { data: {
      student: learner.user.id, stream: stream.doc.id, active: true, currentMeeting: 1,
    } }))

    await page.setViewportSize({ width: 1440, height: 950 })
    await page.goto('/tutoring/nodejs/lectures/1')
    const summary = page.getByText('Сценарий и заметки ведущего', { exact: true })
    await summary.click()
    await expect(page.getByRole('heading', { name: 'Код запроса' })).toBeVisible()
    expect(await page.locator('pre code.language-js').textContent()).toBe(snippet + '\n')
    expect(await page.locator('pre code.language-text').textContent()).toBe('200\nДрель\n')
    await summary.click()
    const tools = page.getByRole('group', { name: 'Пометки на слайде' })
    const pen = tools.getByRole('button', { name: 'Карандаш' })
    const text = tools.getByRole('button', { name: 'Текст', exact: true })
    const undo = tools.getByRole('button', { name: 'Отменить', exact: true })
    const redo = tools.getByRole('button', { name: 'Вернуть', exact: true })
    const clear = tools.getByRole('button', { name: 'Очистить слайд' })
    const previous = page.getByRole('button', { name: 'Предыдущая страница' })
    const next = page.getByRole('button', { name: 'Следующая страница' })
    const downloadLink = page.getByRole('link', { name: 'Скачать PDF' })
    const drawing = page.locator('svg[viewBox="0 0 1000 1000"]').first()
    const toolbarRows = () => tools.evaluate(group => {
      const deck = group.closest('[data-slide-deck]')
      const y = (label: string) => {
        const control = deck?.querySelector(`[aria-label="${label}"]`)
        if (!control) throw new Error(`Нет кнопки ${label}`)
        return Math.round(control.getBoundingClientRect().y)
      }
      const navigation = y('Предыдущая страница')
      return { fileBesideNavigation: y('Скачать PDF') === navigation, toolsBelow: y('Карандаш') > navigation }
    })
    await expect(pen).toBeVisible()
    await expect.poll(toolbarRows).toEqual({ fileBesideNavigation: true, toolsBelow: false })
    await pen.click()
    await expect(pen).toHaveAttribute('aria-pressed', 'true')
    await expect(drawing).toBeVisible()
    const area = await drawing.boundingBox()
    if (!area) throw new Error('Нет области рисования')
    await page.mouse.move(area.x + area.width * 0.3, area.y + area.height * 0.35)
    await page.mouse.down()
    await page.mouse.move(area.x + area.width * 0.55, area.y + area.height * 0.62, { steps: 7 })
    await page.mouse.up()
    await expect(drawing.locator('polyline')).toHaveCount(2)
    await page.keyboard.press('Control+z')
    await expect(drawing.locator('polyline')).toHaveCount(0)
    await page.keyboard.press('Control+y')
    await expect(drawing.locator('polyline')).toHaveCount(2)
    await page.evaluate(() => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'я', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true,
    })))
    await expect(drawing.locator('polyline')).toHaveCount(0)
    await page.keyboard.press('Control+Shift+z')
    await expect(drawing.locator('polyline')).toHaveCount(2)

    await page.getByRole('button', { name: 'Развернуть на весь экран' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(drawing.locator('polyline')).toHaveCount(2)
    await text.click()
    await page.getByRole('button', { name: 'Добавить подпись в центре слайда' }).press('Enter')
    const input = page.getByRole('textbox', { name: 'Текст подписи' })
    await input.fill('Ждём ответа')
    await input.press('Control+z')
    await input.press('Meta+z')
    await expect(drawing.locator('polyline')).toHaveCount(2)
    await input.fill('Ждём ответа')
    await input.press('ArrowRight')
    await input.press('End')
    await input.press('Enter')
    await expect(page.getByText('Ждём ответа')).toBeVisible()
    await next.press('End')
    await expect(page.getByText('Ждём ответа')).toHaveCount(0)
    await expect(undo).toBeDisabled()
    await expect(redo).toBeDisabled()
    await next.press('Control+z')
    await previous.press('Home')
    await expect(page.getByText('Ждём ответа')).toBeVisible()

    await undo.click()
    await expect(page.getByText('Ждём ответа')).toHaveCount(0)
    await expect(drawing.locator('polyline')).toHaveCount(2)
    await undo.press('Meta+z')
    await expect(drawing.locator('polyline')).toHaveCount(0)
    await undo.press('Meta+Shift+z')
    await expect(drawing.locator('polyline')).toHaveCount(2)
    await redo.click()
    await expect(page.getByText('Ждём ответа')).toBeVisible()
    await clear.click()
    await expect(drawing.locator('polyline')).toHaveCount(0)
    await undo.click()
    await expect(page.getByText('Ждём ответа')).toBeVisible()
    await expect(drawing.locator('polyline')).toHaveCount(2)
    await redo.click()
    await expect(drawing.locator('polyline')).toHaveCount(0)

    await undo.click()
    await page.getByRole('button', { name: 'Добавить подпись в центре слайда' }).press('Enter')
    await input.fill('Новый шаг')
    await input.press('Enter')
    await expect(page.getByText('Новый шаг')).toBeVisible()
    await expect(redo).toBeDisabled()
    await clear.click()
    await page.getByRole('button', { name: 'Добавить подпись в центре слайда' }).press('Enter')
    await input.press('Escape')
    await expect(input).toHaveCount(0)
    await expect(page.getByRole('dialog')).toBeVisible()

    const download = page.waitForEvent('download')
    await downloadLink.click()
    const saved = testInfo.outputPath('original.pdf')
    await (await download).saveAs(saved)
    expect(await readFile(saved)).toEqual(original)

    await page.getByRole('button', { name: 'Свернуть презентацию' }).click()
    await page.setViewportSize({ width: 390, height: 760 })
    await expect.poll(toolbarRows).toEqual({ fileBesideNavigation: true, toolsBelow: true })
    await pen.click()
    const pdfBounds = await page.getByRole('img', { name: 'Два запроса к серверу, страница 1' }).boundingBox()
    const touchBounds = await drawing.boundingBox()
    if (!touchBounds || !pdfBounds) throw new Error('Нет размера PDF после изменения окна')
    expect(touchBounds.width).toBeCloseTo(pdfBounds.width, 0)
    expect(touchBounds.height).toBeCloseTo(pdfBounds.height, 0)
    const cdp = await page.context().newCDPSession(page)
    try {
      const tx = touchBounds.x + touchBounds.width / 4
      const ty = touchBounds.y + touchBounds.height / 3
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx + 30, y: ty + 20 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await expect(drawing.locator('polyline')).toHaveCount(2)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tx, y: ty, button: 'left', buttons: 1, pointerType: 'pen', clickCount: 1 })
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tx + 52, y: ty + 40, buttons: 1, pointerType: 'pen' })
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tx + 52, y: ty + 40, button: 'left', pointerType: 'pen', clickCount: 1 })
      await expect(drawing.locator('polyline')).toHaveCount(4)
    } finally {
      await cdp.detach()
    }
    await page.reload()
    await expect(pen).toHaveAttribute('aria-pressed', 'false')
    await expect(drawing.locator('polyline')).toHaveCount(0)

    const viewer = await student.newPage()
    await viewer.goto(`${APP_URL}/tutoring/nodejs/streams/${stream.doc.id}`)
    await expect(viewer.getByRole('img', { name: 'Два запроса к серверу, страница 1' })).toBeVisible()
    await expect(viewer.getByRole('button', { name: 'Карандаш' })).toHaveCount(0)
    await expect(viewer.getByText('Заметки для наставника')).toHaveCount(0)
    const file = await student.request.get(`${APP_URL}/api/tutoring-meetings/file/${meeting.filename}`, { headers: { Origin: APP_URL } })
    expect(file.status()).toBe(200)
    expect(await file.body()).toEqual(original)
  } finally {
    await student.close()
    await json(await page.request.patch(`/api/bootcamp-programs/${program.id}`, { data: { manualsCourse: program.manualsCourse ?? null } }))
  }
})

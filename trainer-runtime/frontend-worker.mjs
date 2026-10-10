import { chromium } from 'playwright'
import { buildPreview } from './frontend.mjs'
import { createNativeStyleReader } from './native-style.mjs'

let body = ''
for await (const chunk of process.stdin) body += chunk
const job = JSON.parse(body)
const hardTimer = setTimeout(() => process.exit(124), 120000)
hardTimer.unref()
let html
try {
  html = await buildPreview(job.language, job.files)
} catch (error) {
  process.stdout.write(JSON.stringify({ status: 'compile_error', tests: [], consoleOutput: [], error: String(error.message).slice(0, 1000), totalMs: 0 }))
  process.exit(0)
}
if (job.preview) {
  process.stdout.write(JSON.stringify({ html }))
  process.exit(0)
}

const started = performance.now()
// Browser processes see only the document; assertions stay in this trusted Node process.
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--disable-background-networking'] })
const tests = []
const consoleOutput = []
try {
  for (const [index, item] of job.cases.entries()) {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: item.viewport ?? { width: 1280, height: 720 } })
    await context.route('**/*', (route) => route.abort())
    await context.routeWebSocket('**/*', (socket) => socket.close())
    const page = await context.newPage()
    let pageError
    page.on('pageerror', (error) => { pageError = error.message })
    if (!item.hidden) page.on('console', (message) => { if (consoleOutput.length < 100) consoleOutput.push(message.text().slice(0, 2000)) })
    page.setDefaultTimeout(job.timeLimitMs)
    const caseStarted = performance.now()
    let timer
    try {
      const checked = async () => {
        await page.setContent('<style>html,body{margin:0;width:100%;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe id="solution" sandbox="allow-scripts allow-forms"></iframe>')
        await page.locator('#solution').evaluate((frame, document) => { frame.srcdoc = document }, html)
        const frame = page.frameLocator('#solution')
        const readStyle = createNativeStyleReader(context, page)
        for (const check of item.checks) {
          const locator = frame.locator(check.selector)
          if (check.action === 'click') await locator.click()
          if (check.action === 'fill') await locator.fill(check.value ?? '')
          if (check.action === 'press') await locator.press(check.value)
          // Poll assertions: React updates and fonts/layout settle asynchronously.
          const deadline = caseStarted + job.timeLimitMs
          let error
          do {
            error = await mismatch(locator, check, readStyle)
            if (!error) break
            await new Promise((resolve) => setTimeout(resolve, 20))
          } while (performance.now() < deadline)
          if (error) throw new Error(error)
        }
      }
      await Promise.race([checked(), new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Превышен лимит времени теста')), job.timeLimitMs) })])
      tests.push({ name: item.hidden ? `Скрытый тест ${index + 1}` : item.name, hidden: item.hidden, passed: true, durationMs: performance.now() - caseStarted })
    } catch (error) {
      tests.push({ name: item.hidden ? `Скрытый тест ${index + 1}` : item.name, hidden: item.hidden, passed: false, durationMs: performance.now() - caseStarted, message: item.hidden ? 'Скрытая проверка не пройдена' : String(pageError || error.message).slice(0, 600) })
    } finally {
      clearTimeout(timer)
      await context.close()
    }
  }
} finally {
  await browser.close()
}
const passedCount = tests.filter((item) => item.passed).length
const result = { status: passedCount === tests.length && tests.length > 0 ? 'passed' : 'failed', tests, passedCount, totalCount: tests.length, consoleOutput, totalMs: performance.now() - started }
process.stdout.write(JSON.stringify(job.includePreview ? { result, preview: { html } } : result))

async function mismatch(locator, check, readStyle) {
  if (check.count !== undefined && await locator.count() !== check.count) return `Количество элементов ${check.selector} должно быть ${check.count}`
  if (check.visible !== undefined && await locator.first().isVisible() !== check.visible) return `Видимость ${check.selector} не соответствует условию`
  if (check.text !== undefined && (await locator.first().textContent())?.trim() !== check.text.trim()) return `Текст ${check.selector} должен быть: ${check.text}`
  if (check.attribute && await locator.first().getAttribute(check.attribute.name) !== check.attribute.value) return `Атрибут ${check.attribute.name} у ${check.selector} должен быть: ${check.attribute.value}`
  if (check.css) {
    await locator.first().waitFor({ state: 'attached' })
    for (const [name, value] of Object.entries(check.css)) {
      const actual = await readStyle(check.selector, name)
      if (actual?.trim() !== value.trim()) return `CSS ${name} у ${check.selector} должен быть: ${value}`
    }
  }
  return null
}

/**
 * Картинки буткемпа для соцсетей и мессенджеров (1200 на 630): главная и программа.
 * Факты берутся из данных лендинга, поэтому при смене сроков картинку пересобирают,
 * а не правят руками: прежняя месяц показывала «20 недель» после перехода на 12.
 *
 * pnpm exec tsx scripts/bootcamp-og.ts
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

import { PROGRAM_WEEKS, START_DAY, WEEKS } from '../landing/src/data/bootcamp'
import { PROGRAM_WEEKS_DETAILED, QUESTIONS_TEXT } from '../landing/src/data/bootcamp-program'

const root = path.resolve(import.meta.dirname, '..')
const fonts = path.join(root, 'landing/public/fonts')
const out = path.join(root, 'landing/public/bootcamp')
const font = (family: string, weight: number, file: string) =>
  `@font-face { font-family: '${family}'; font-weight: ${weight}; src: url('${pathToFileURL(path.join(fonts, file)).href}') format('woff2'); }`

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function page({ tape, title, lede, panel }: { tape: string; title: string; lede: string; panel: string }): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
${font('Golos Text', 400, 'golos-text-400-cyrillic.woff2')}
${font('Golos Text', 800, 'golos-text-800-cyrillic.woff2')}
${font('Golos Text', 400, 'golos-text-400-latin.woff2')}
${font('Golos Text', 800, 'golos-text-800-latin.woff2')}
${font('JetBrains Mono', 400, 'jetbrains-mono-400-latin.woff2')}
${font('JetBrains Mono', 400, 'jetbrains-mono-400-cyrillic.woff2')}
${font('JetBrains Mono', 700, 'jetbrains-mono-700-latin.woff2')}
${font('JetBrains Mono', 700, 'jetbrains-mono-700-cyrillic.woff2')}
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; display: grid; grid-template-columns: 1fr 440px; gap: 64px; align-items: center; padding: 0 64px; background: #fff; color: #233932; font-family: 'Golos Text', sans-serif; }
.tape { display: inline-block; padding: 8px 14px; border-radius: 4px; background: #ffd23f; font-weight: 800; font-size: 22px; }
h1 { margin-top: 28px; font-size: 64px; line-height: 1.04; font-weight: 800; letter-spacing: -0.035em; }
p { margin-top: 26px; font-size: 26px; line-height: 1.35; color: #53675f; }
.panel { background: #233932; border-radius: 16px; padding: 30px 0; font-family: 'JetBrains Mono', monospace; font-size: 21px; line-height: 1.45; color: #e7eeea; }
.row { padding: 12px 32px; }
.row b { font-weight: 700; }
.ok { color: #93dbbb; }
.hot { background: #ffffff14; border-left: 4px solid #ffd23f; padding-left: 28px; }
.hot .ok { color: #ffd23f; }
.week { display: flex; gap: 16px; padding: 10px 32px; font-family: 'Golos Text', sans-serif; font-size: 23px; line-height: 1.3; }
.num { flex: none; width: 1.6em; font-family: 'JetBrains Mono', monospace; color: #ffd23f; font-weight: 700; }
</style></head><body><div><span class="tape">${escape(tape)}</span><h1>${escape(title)}</h1><p>${escape(lede)}</p></div><div class="panel">${panel}</div></body></html>`
}

const main = page({
  tape: 'Предзапись на поток',
  title: 'Буткемп Node.js: backend сервиса проката',
  lede: `${WEEKS} недель с ${START_DAY}, личный проект и ревью каждой работы`,
  panel: [
    '<div class="row"><b>POST /bookings</b> DR-014<br><b>201</b> <span class="ok">бронь создана</span></div>',
    '<div class="row hot"><b>POST /bookings</b> DR-014<br><b>409</b> <span class="ok">дрель уже занята</span></div>',
    '<div class="row"><b>POST …/payments</b> повтор<br><b>200</b> <span class="ok">второго списания нет</span></div>',
  ].join(''),
})

const highlights = PROGRAM_WEEKS_DETAILED.filter((week) => [1, 6, 8, 13, 15, 17].includes(week.number))
if (highlights.length !== 6) throw new Error('В выгрузке методичек нет одной из недель для картинки программы')
const program = page({
  tape: 'Программа по неделям',
  title: `Буткемп Node.js: ${PROGRAM_WEEKS} учебных недель`,
  lede: `Задачи проката, навыки и ${QUESTIONS_TEXT} собеседования`,
  panel: highlights.map((week) => `<div class="week"><span class="num">${week.number}</span><span>${escape(week.title)}</span></div>`).join(''),
})

const dir = await mkdtemp(path.join(tmpdir(), 'bootcamp-og-'))
const browser = await chromium.launch({ channel: 'chrome' })
try {
  for (const [name, html] of [['og-nodejs', main], ['og-nodejs-program', program]] as const) {
    const file = path.join(dir, `${name}.html`)
    await writeFile(file, html)
    const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } })
    await tab.goto(pathToFileURL(file).href)
    await tab.evaluate(() => document.fonts.ready)
    await tab.screenshot({ path: path.join(out, `${name}.png`) })
    await tab.close()
    process.stdout.write(`landing/public/bootcamp/${name}.png\n`)
  }
} finally {
  await browser.close()
}

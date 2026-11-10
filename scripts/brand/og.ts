/**
 * Картинки для соцсетей LMS и лендинга: HTML-шаблон снимается браузером в 1200x630.
 * Запуск: pnpm exec tsx scripts/brand/og.ts. Браузер Playwright на машине может отсутствовать,
 * поэтому по умолчанию берётся установленный Chrome, другой задаётся через BRAND_BROWSER.
 */
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { BRAND_COLORS as C, MARK_LARGE, MARK_SMALL, WORDMARK } from '../../src/lib/brand-mark'

const dataUri = (file: string, mime: string) => `data:${mime};base64,${readFileSync(file).toString('base64')}`
const fontFace = (weight: number) => ['latin', 'cyrillic'].map((subset) => `@font-face{font-family:Golos;font-weight:${weight};src:url(${dataUri(`landing/public/fonts/golos-text-${weight}-${subset}.woff2`, 'font/woff2')}) format('woff2')}`).join('')
const base = `<meta charset="utf-8"><style>${fontFace(400)}${fontFace(700)}*{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:Golos,sans-serif}</style>`

const bareMark = (size: number, style = '') => `<svg viewBox="0 0 512 512" width="${size}" height="${size}" style="${style}"><path d="${MARK_LARGE.oars.join('')}" fill="${C.sail}"/><path d="${MARK_LARGE.bow}" fill="${C.sun}"/></svg>`
const tileMark = (size: number) => `<svg viewBox="0 0 512 512" width="${size}" height="${size}" style="flex:none"><rect width="512" height="512" rx="${size <= 32 ? 96 : 112}" fill="${C.deep}"/><path d="${(size <= 32 ? MARK_SMALL : MARK_LARGE).oars.join('')}" fill="${C.sail}"/><path d="${(size <= 32 ? MARK_SMALL : MARK_LARGE).bow}" fill="${C.sun}"/></svg>`
const wordWidth = (height: number) => { const [, , width, box] = WORDMARK.viewBox.split(' ').map(Number); return Math.round((height * width) / box) }
const word = (height: number, color: string) => `<svg viewBox="${WORDMARK.viewBox}" width="${wordWidth(height)}" height="${height}" style="color:${color};flex:none;display:block" fill="currentColor"><path d="${WORDMARK.d}"/></svg>`

const lms = `${base}<body style="background:${C.deep};color:${C.sail};position:relative">
  ${bareMark(640, 'position:absolute;right:-46px;top:-6px')}
  <div style="position:absolute;inset:0;padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between;width:760px">
    ${word(30, C.sail)}
    <div><div style="font-size:72px;line-height:1.06;font-weight:700;letter-spacing:-.025em">Платформа обучения разработке</div>
    <div style="font-size:27px;line-height:1.35;margin-top:26px;color:#C4D6CF">Курсы, роадмапы, тренажёр кода и сертификаты</div></div>
    <div style="font-size:24px;font-weight:700">learn.mentorcareer.ru</div>
  </div></body>`

const landing = `${base}<body style="background:${C.sail};color:${C.ink};position:relative">
  <div style="position:absolute;left:692px;top:92px;width:640px;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 22px 60px rgba(16,36,30,.16)">
    <img src="${dataUri('landing/public/guide/dashboard.webp', 'image/webp')}" style="display:block;width:100%">
  </div>
  <div style="position:absolute;left:72px;top:64px;bottom:64px;width:580px;display:flex;flex-direction:column;justify-content:space-between">
    <div style="display:flex;align-items:center;gap:16px">${tileMark(56)}${word(25, C.ink)}</div>
    <div><div style="font-size:70px;line-height:1.05;font-weight:700;letter-spacing:-.025em">Как пользоваться MentorCareer</div>
    <div style="font-size:27px;line-height:1.35;margin-top:24px;color:#46605A">Пошагово: вход, роадмапы, курсы, уроки и тренажёр кода</div></div>
    <div><span style="display:inline-block;background:${C.green};color:#fff;font-size:24px;font-weight:700;padding:14px 22px;border-radius:12px">info.mentorcareer.ru</span></div>
  </div></body>`

const browser = await chromium.launch(process.env.BRAND_BROWSER ? { executablePath: process.env.BRAND_BROWSER, headless: true } : { channel: 'chrome', headless: true })
try {
  for (const [file, html] of [['public/images/og.png', lms], ['landing/public/og.png', landing]] as const) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: file })
    await page.close()
    process.stdout.write(`${file}\n`)
  }
} finally { await browser.close() }

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type Rgb = [number, number, number]

const css = readFileSync('src/app/globals.css', 'utf8')

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`)
  expect(start, `блок ${selector} в globals.css`).toBeGreaterThan(-1)
  const body = css.slice(start, css.indexOf('\n}', start))
  return Object.fromEntries(Array.from(body.matchAll(/--([a-z-]+):\s*([\d.]+ [\d.]+% [\d.]+%);/g), ([, name, value]) => [name, value]))
}

function rgb(hsl: string): Rgb {
  const [h, s, l] = hsl.replace(/%/g, '').split(' ').map(Number)
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const channel = (n: number) => {
    const k = (n + h / 30) % 12
    return 255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
  }
  return [channel(0), channel(8), channel(4)]
}

const over = (top: Rgb, alpha: number, bottom: Rgb): Rgb => [0, 1, 2].map((i) => top[i] * alpha + bottom[i] * (1 - alpha)) as Rgb

function luminance(color: Rgb): number {
  const [r, g, b] = color.map((value) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

// Обычный текст 4,5:1 (WCAG AA). Фон /10 - бейджи и уведомления, где статус пишется своим же цветом.
describe.each([['светлая тема', ':root'], ['тёмная тема', '.dark']])('контраст токенов: %s', (_name, selector) => {
  const t = tokens(selector)
  const c = (name: string) => {
    expect(t[name], `токен --${name}`).toBeDefined()
    return rgb(t[name])
  }

  it.each([
    ['foreground', 'background'],
    ['card-foreground', 'card'],
    ['popover-foreground', 'popover'],
    ['primary-foreground', 'primary'],
    ['primary', 'background'],
    ['primary', 'card'],
    ['secondary-foreground', 'secondary'],
    ['accent-foreground', 'accent'],
    ['muted-foreground', 'background'],
    ['muted-foreground', 'card'],
    ['muted-foreground', 'muted'],
    ['muted-foreground', 'popover'],
    ['destructive', 'background'],
    ['destructive', 'card'],
    ['destructive-foreground', 'destructive'],
    ['success', 'background'],
    ['success', 'card'],
    ['warning', 'background'],
    ['warning', 'card'],
    ['info', 'background'],
    ['info', 'card'],
    ['signal-foreground', 'signal'],
  ])('%s на %s не ниже 4,5:1', (text, surface) => {
    expect(contrast(c(text), c(surface))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['primary', 'success', 'warning', 'info', 'destructive'])('%s на собственной подложке /10 не ниже 4,5:1', (name) => {
    expect(contrast(c(name), over(c(name), 0.1, c('card')))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['background', 'card'])('рамка фокуса заметна на %s: не ниже 3:1', (surface) => {
    expect(contrast(c('ring'), c(surface))).toBeGreaterThanOrEqual(3)
  })
})

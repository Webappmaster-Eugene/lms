import { describe, expect, it } from 'vitest'
import { TRAINER_LIMITS } from '@/lib/trainer/constants'
import { parseFrontendFiles, runtimeCases } from '@/lib/trainer/runtime-spec'
import { TrainerSpecError } from '@/lib/trainer/spec'

describe('frontend-проекты и проверки runtime', () => {
  it('разрешает локальные файлы HTML/CSS/React и маршруты Next.js', () => {
    const files = { 'index.html': '<h1>Hello</h1>', 'styles.css': 'h1 { color: red }', 'App.tsx': 'export default () => null', 'app/[slug]/page.tsx': 'export default () => null', 'app/(group)/page.tsx': 'export default () => null' }
    expect(parseFrontendFiles(JSON.stringify(files))).toEqual(files)
  })

  it('сохраняет CSS Modules и catch-all маршруты, запрещая скрытые папки и dot segments', () => {
    const files = { 'components/Button.module.css': '.button { color: red }', 'app/[...slug]/page.tsx': 'export default () => null', 'app/[[...slug]]/page.tsx': 'export default () => null' }
    expect(parseFrontendFiles(JSON.stringify(files))).toEqual(files)
    for (const path of ['.git/config.json', 'src/.hidden/App.tsx', './App.tsx', 'src/../App.tsx']) {
      expect(() => parseFrontendFiles(JSON.stringify({ [path]: '' }))).toThrow(TrainerSpecError)
    }
  })

  it.each(['../App.tsx', '/etc/passwd', 'src/../../App.tsx', 'src\\App.tsx', 'https://evil.test/app.js', 'App.tsx\u0000', '.env', 'server.sh', 'a'.repeat(121) + '.js'])('отклоняет опасный или недопустимый путь %s', (path) => {
    expect(() => parseFrontendFiles(JSON.stringify({ [path]: '' }))).toThrow(TrainerSpecError)
  })

  it('отклоняет неверный JSON, пустой проект, неверные значения, слишком большой проект', () => {
    for (const code of ['broken', '[]', 'null', '"text"', '{}', '{"App.tsx":1}', JSON.stringify(Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`file${i}.js`, '']))), JSON.stringify({ 'App.tsx': 'x'.repeat(TRAINER_LIMITS.maxCodeLength) })]) {
      expect(() => parseFrontendFiles(code)).toThrow(TrainerSpecError)
    }
  })

  it('исключает скрытые проверки до чтения закрытых полей и не скрывает их при серверной проверке', () => {
    const hidden = { hidden: true, get checks() { throw new Error('Private fields read') } }
    const publicCase = { name: 'Открытый', hidden: false, checks: [{ selector: 'h1', text: 'Ready' }] }
    expect(runtimeCases({ runtimeCases: [publicCase, hidden] }, true)).toEqual([publicCase])
    expect(() => runtimeCases({ runtimeCases: [publicCase, hidden] })).toThrow('Private fields read')
  })

  it.each([
    { checks: [{ selector: '', text: 'Hello' }] },
    { checks: [{ selector: 'button', action: 'submit' }] },
    { checks: [{ selector: 'input', action: 'fill' }] },
    { checks: [{ selector: 'p', count: -1 }] },
    { checks: [{ selector: 'p', visible: 'true' }] },
    { checks: [{ selector: 'p', css: { color: 123 } }] },
    { checks: [{ selector: 'p' }] },
    { viewport: { width: 319, height: 600 } },
    { viewport: { width: 1280, height: 1201 } },
    { path: '//evil.test/' },
    { path: 'https://evil.test/' },
    { path: '/foo\\bar' },
    { input: 123 },
    { expected: 123 },
  ])('проверяет содержимое DOM-кейса %j', (row) => {
    expect(() => runtimeCases({ runtimeCases: [row] })).toThrow(TrainerSpecError)
  })

  it('принимает действия, ожидания, атрибуты, размеры окна и внутренний маршрут', () => {
    const row = { name: 'Мобильная форма', hidden: false, path: '/form', viewport: { width: 390, height: 844 }, checks: [
      { selector: 'input', action: 'fill' as const, value: 'Ada' },
      { selector: 'button', action: 'click' as const },
      { selector: 'h1', text: 'Ada', count: 1, visible: true, css: { color: 'rgb(0, 0, 0)' }, attribute: { name: 'role', value: 'status' } },
    ] }
    expect(runtimeCases({ runtimeCases: [row] })).toEqual([row])
    expect(() => runtimeCases({ runtimeCases: Array.from({ length: 51 }, () => row) })).toThrow(TrainerSpecError)
    expect(() => runtimeCases({ runtimeCases: [{ checks: Array.from({ length: 51 }, () => row.checks[0]) }] })).toThrow(TrainerSpecError)
  })
})

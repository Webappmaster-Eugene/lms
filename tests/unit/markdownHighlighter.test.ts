import { describe, expect, it } from 'vitest'
import { getMarkdownHighlighter, markdownLanguage } from '@/lib/markdown-highlighter'

describe('подсветка учебного контента', () => {
  it('поддерживает Go, JSX и общий движок вместо новой инициализации на блок', async () => {
    const [go, react] = await Promise.all([getMarkdownHighlighter(['go']), getMarkdownHighlighter(['tsx'])])
    expect(go).toBe(react)
    expect(go.codeToHtml('package main\nfunc main() {}', { lang: 'go', theme: 'github-dark' })).toContain('package')
    expect(react.codeToHtml('const el = <button>Hello</button>', { lang: 'tsx', theme: 'github-light' })).toContain('button')
  })
  it('подсвечивает Dockerfile по меткам dockerfile и docker', async () => {
    expect(markdownLanguage('docker')).toBe('dockerfile')
    const engine = await getMarkdownHighlighter(['dockerfile'])
    expect(engine.getLoadedLanguages()).toContain('dockerfile')
    const html = engine.codeToHtml('FROM node:22-alpine\nRUN npm ci', { lang: 'dockerfile', theme: 'github-light' })
    // Ключевое слово выделено своим цветом, а не оставлено обычным текстом.
    expect(html).toMatch(/<span style="color:#[0-9A-F]{6}">FROM<\/span>/i)
  })
  it('не падает на неизвестной метке кода', async () => {
    const engine = await getMarkdownHighlighter(['unknown-code-language'])
    expect(engine.getLoadedLanguages()).not.toContain('unknown-code-language')
  })
})

import { describe, expect, it } from 'vitest'
import { getMarkdownHighlighter } from '@/lib/markdown-highlighter'

describe('подсветка учебного контента', () => {
  it('поддерживает Go, JSX и общий движок вместо новой инициализации на блок', async () => {
    const [go, react] = await Promise.all([getMarkdownHighlighter(['go']), getMarkdownHighlighter(['tsx'])])
    expect(go).toBe(react)
    expect(go.codeToHtml('package main\nfunc main() {}', { lang: 'go', theme: 'github-dark' })).toContain('package')
    expect(react.codeToHtml('const el = <button>Hello</button>', { lang: 'tsx', theme: 'github-light' })).toContain('button')
  })
  it('не падает на неизвестной метке кода', async () => {
    const engine = await getMarkdownHighlighter(['unknown-code-language'])
    expect(engine.getLoadedLanguages()).not.toContain('unknown-code-language')
  })
})

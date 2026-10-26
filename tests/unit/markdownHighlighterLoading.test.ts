import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Грамматики подгружаются отдельными чанками по меткам кода в уроке. Метка
 * без своего загрузчика молча остаётся без подсветки, поэтому каждая
 * поддерживаемая метка и её псевдоним проверяются по отдельности.
 */

async function freshHighlighter() {
  vi.resetModules()
  return import('@/lib/markdown-highlighter')
}

afterEach(() => {
  vi.doUnmock('shiki/core')
  vi.resetModules()
})

describe('загрузка грамматик подсветки', () => {
  it.each([
    ['js', 'javascript', 'const answer = 42'],
    ['ts', 'typescript', 'const answer: number = 42'],
    ['jsx', 'jsx', 'const el = <div>Привет</div>'],
    ['html', 'html', '<main><h1>Урок</h1></main>'],
    ['css', 'css', '.lesson { color: red; }'],
    ['json', 'json', '{ "lesson": 1 }'],
    ['sh', 'bash', 'echo "hello" && ls -la'],
    ['sql', 'sql', 'SELECT id FROM lessons WHERE id = 1'],
    ['yml', 'yaml', 'lesson:\n  id: 1'],
    ['md', 'markdown', '# Заголовок\n\n**жирный**'],
    ['py', 'python', 'def main():\n    return 42'],
    ['golang', 'go', 'package main'],
  ])('метка %s загружает грамматику %s и подсвечивает код', async (label, grammar, code) => {
    const { getMarkdownHighlighter, markdownLanguage } = await freshHighlighter()
    expect(markdownLanguage(label)).toBe(grammar)

    const engine = await getMarkdownHighlighter([label])

    expect(engine.getLoadedLanguages()).toContain(grammar)
    const html = engine.codeToHtml(code, { lang: grammar, theme: 'github-dark' })
    // Подсвеченный код разбит на токены разного цвета, а не одной строкой текста.
    expect(new Set(html.match(/color:#[0-9A-F]{6}/gi)).size).toBeGreaterThan(1)
  })

  it('одинаковые метки в одном уроке грузят грамматику один раз и не мешают друг другу', async () => {
    const { getMarkdownHighlighter } = await freshHighlighter()

    const engine = await getMarkdownHighlighter(['ts', 'typescript', 'ts', 'unknown-language'])

    expect(engine.getLoadedLanguages()).toContain('typescript')
    expect(engine.getLoadedLanguages()).not.toContain('unknown-language')
  })

  it('сбой загрузки движка не ломает подсветку навсегда: следующий вызов пробует заново', async () => {
    vi.resetModules()
    let failNext = true
    vi.doMock('shiki/core', async (importOriginal) => {
      const actual = await importOriginal<typeof import('shiki/core')>()
      return {
        ...actual,
        createHighlighterCore: (options: Parameters<typeof actual.createHighlighterCore>[0]) => {
          if (failNext) {
            failNext = false
            return Promise.reject(new Error('чанк движка не загрузился'))
          }
          return actual.createHighlighterCore(options)
        },
      }
    })
    const { getMarkdownHighlighter } = await import('@/lib/markdown-highlighter')

    await expect(getMarkdownHighlighter(['js'])).rejects.toThrow('чанк движка не загрузился')

    const engine = await getMarkdownHighlighter(['js'])
    expect(engine.getLoadedLanguages()).toContain('javascript')
  })
})

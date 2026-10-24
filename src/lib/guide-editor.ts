import remarkParse from 'remark-parse'
import { unified } from 'unified'

export type GuideTextEdit = { start: number; end: number; text: string; select?: [number, number] }

const parser = unified().use(remarkParse)
type EditorNode = { type: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: EditorNode[] }

function protectedRanges(markdown: string) {
  const ranges: { start: number; end: number }[] = []
  function walk(node: EditorNode) {
    // Код и HTML не должны меняться при вставке или продолжении списка.
    if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'html') {
      const start = node.position?.start.offset
      const end = node.position?.end.offset
      if (start !== undefined && end !== undefined) ranges.push({ start, end })
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(parser.parse(markdown))
  return ranges
}

/** Списки из чата/документа становятся Markdown; содержимое примеров кода не трогаем. */
export function normalizeGuidePaste(markdown: string, from = 0, to = markdown.length): string {
  if (!/^( {0,3})[•◦▪][ \t]+/m.test(markdown)) return markdown
  const ranges = protectedRanges(markdown)
  return markdown.replace(/^( {0,3})[•◦▪][ \t]+/gm, (marker: string, indent: string, offset: number) => (
    offset < from || offset + marker.length > to || ranges.some(({ start, end }) => offset >= start && offset < end) ? marker : `${indent}- `
  ))
}

/** Enter продолжает список, а на пустом пункте завершает его. Shift+Enter оставлен браузеру. */
export function guideListEnter(markdown: string, start: number, end: number): GuideTextEdit | null {
  if (start !== end) return null
  const lineStart = markdown.lastIndexOf('\n', start - 1) + 1
  const before = markdown.slice(lineStart, start)
  const match = /^([ \t]*)(?:([-*+])(?:[ \t]+\[[ xX]\])?|(\d+)([.)]))[ \t]+(.*)$/.exec(before)
  if (!match) return null
  if (protectedRanges(markdown).some((range) => start >= range.start && start <= range.end)) return null
  const [, indent, bullet, number, delimiter, content] = match
  if (!content.trim() && (start === markdown.length || markdown[start] === '\n')) {
    return { start: lineStart, end: start, text: lineStart > 0 && start === markdown.length ? '\n' : '' }
  }
  const checkbox = /^\s*[-*+][ \t]+\[[ xX]\]/.test(before)
  const marker = number ? `${Number(number) + 1}${delimiter}` : `${bullet}${checkbox ? ' [ ]' : ''}`
  return { start, end, text: `\n${indent}${marker} ` }
}

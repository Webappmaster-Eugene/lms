import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

import { tutoringDisplayText } from '@/lib/tutoring-display'

export function tutoringReadingTitle(value: string) {
  return tutoringDisplayText(value)
    .replace(/^(Методичка|Практикум|Самопроверка) 00(?=\s*·|$)/, '$1. Подготовка проекта')
    .replace(/^(Методичка|Практикум|Самопроверка) 0([1-9])(?=\s*·|$)/, '$1 $2')
}

const markdown = unified().use(remarkParse).use(remarkGfm)
type Node = { type: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: Node[] }

export function tutoringReadingMarkdown(source: string, studentCheck = false) {
  const slices: string[] = []
  let end = 0
  // Позиции текстовых узлов позволяют сохранить разметку, ссылки, команды и отступы байт в байт.
  function visit(node: Node) {
    if (node.type === 'text' && node.position) {
      const from = node.position.start.offset
      const to = node.position.end.offset
      if (from !== undefined && to !== undefined) {
        const prose = tutoringReadingTitle(source.slice(from, to))
        slices.push(source.slice(end, from), studentCheck
          ? prose.replace(/Ответы (?:- |даны |приведены )?в приложении\./g, 'Ответы можно обсудить с наставником на встрече.')
          : prose)
        end = to
      }
    }
    node.children?.forEach(visit)
  }
  visit(markdown.parse(source))
  return slices.join('') + source.slice(end)
}

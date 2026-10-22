import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

/** Подмножество mdast, которого хватает для оглавления и подсчёта слов. */
type MarkdownNode = {
  type: string
  depth?: number
  value?: string
  children?: MarkdownNode[]
  position?: { start: { offset?: number } }
}

export type GuideMarkdownHeading = {
  /** Смещение заголовка в тексте: по нему рендер находит, кому дать якорь. */
  offset: number
  id: string
  title: string
}

// Тот же разбор, что у react-markdown с remark-gfm: смещения узлов совпадают с рендером.
const parser = unified().use(remarkParse).use(remarkGfm)

function parse(markdown: string): MarkdownNode {
  return parser.parse(markdown) as MarkdownNode
}

// Внутри этих узлов текст идёт подряд; блоки (абзацы, пункты, ячейки) разделяются переводом строки.
const PHRASING = new Set(['paragraph', 'heading', 'emphasis', 'strong', 'delete', 'link', 'linkReference', 'tableCell'])

function plainText(node: MarkdownNode): string {
  if (typeof node.value === 'string') return node.value
  return (node.children ?? []).map(plainText).join(PHRASING.has(node.type) ? '' : '\n')
}

/** Разделы гайда — заголовки `##` в корне документа; в цитатах, списках и коде не считаются. */
export function guideMarkdownHeadings(markdown: string): GuideMarkdownHeading[] {
  const headings: GuideMarkdownHeading[] = []
  for (const node of parse(markdown).children ?? []) {
    const offset = node.position?.start.offset
    if (node.type !== 'heading' || node.depth !== 2 || offset === undefined) continue
    const title = plainText(node).replace(/\s+/g, ' ').trim()
    if (title) headings.push({ offset, id: `section-${headings.length + 1}`, title })
  }
  return headings
}

/** Текст без разметки и адресов ссылок — для оценки времени чтения. */
export function markdownPlainText(markdown: string): string {
  return plainText(parse(markdown))
}

/** Языки блоков кода: подсветка грузит только их. */
export function markdownCodeLanguages(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(/^[ \t]*(?:```|~~~)[ \t]*([\w+-]+)/gm)].map((match) => match[1].toLowerCase()))]
}

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

export type MarkdownHeading = { offset: number; depth: number; title: string }

/** Заголовки нужных уровней в корне документа; в цитатах, списках и коде не считаются. */
export function markdownRootHeadings(markdown: string, depths: readonly number[]): MarkdownHeading[] {
  const headings: MarkdownHeading[] = []
  for (const node of parse(markdown).children ?? []) {
    const offset = node.position?.start.offset
    if (node.type !== 'heading' || node.depth === undefined || !depths.includes(node.depth) || offset === undefined) continue
    const title = plainText(node).replace(/\s+/g, ' ').trim()
    if (title) headings.push({ offset, depth: node.depth, title })
  }
  return headings
}

/** Разделы гайда — заголовки `##` в корне документа. */
export function guideMarkdownHeadings(markdown: string): GuideMarkdownHeading[] {
  return markdownRootHeadings(markdown, [2]).map(({ offset, title }, index) => ({ offset, id: `section-${index + 1}`, title }))
}

/** Текст без разметки и адресов ссылок — для оценки времени чтения. */
export function markdownPlainText(markdown: string): string {
  return plainText(parse(markdown))
}

/** Языки блоков кода: подсветка грузит только их. */
export function markdownCodeLanguages(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(/^[ \t]*(?:```|~~~)[ \t]*([\w+-]+)/gm)].map((match) => match[1].toLowerCase()))]
}

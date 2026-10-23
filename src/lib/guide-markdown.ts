import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

/** Подмножество mdast, которого хватает для оглавления, подсчёта слов и врезок. */
type MarkdownNode = {
  type: string
  depth?: number
  value?: string
  children?: MarkdownNode[]
  position?: { start: { offset?: number } }
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

/** Врезки в синтаксисе GitHub: `> [!WARNING]`. Тот же файл после скачивания так же читается на GitHub. */
export const GUIDE_CALLOUTS = {
  note: 'Заметка',
  tip: 'Совет',
  important: 'Важно',
  warning: 'Внимание',
  caution: 'Осторожно',
} as const

export type GuideCalloutType = keyof typeof GUIDE_CALLOUTS

export function isGuideCalloutType(value: unknown): value is GuideCalloutType {
  return typeof value === 'string' && Object.hasOwn(GUIDE_CALLOUTS, value)
}

const CALLOUT_MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*([^\n]*)(?:\n|$)/i

function markCallout(quote: MarkdownNode): void {
  const blocks = quote.children ?? []
  const paragraph = blocks[0]
  const inline = paragraph?.type === 'paragraph' ? (paragraph.children ?? []) : []
  const first = inline[0]
  const text = first?.type === 'text' ? first.value : undefined
  const match = typeof text === 'string' ? CALLOUT_MARKER.exec(text) : null
  if (!first || !match || typeof text !== 'string') return
  first.value = text.slice(match[0].length)
  if (!first.value) inline.shift()
  if (!inline.length) blocks.shift()
  // Текст после маркера в той же строке — свой заголовок врезки: «> [!WARNING] Главная ловушка».
  quote.data = { hName: 'aside', hProperties: { dataCallout: match[1].toLowerCase(), ...(match[2].trim() ? { dataTitle: match[2].trim() } : {}) } }
}

function walkCallouts(node: MarkdownNode): void {
  if (node.type === 'blockquote') markCallout(node)
  for (const child of node.children ?? []) walkCallouts(child)
}

/** remark-плагин: цитата с маркером `[!TYPE]` становится `<aside data-callout>`; рендер рисует врезку. */
export function remarkGuideCallouts() {
  return (tree: MarkdownNode) => walkCallouts(tree)
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

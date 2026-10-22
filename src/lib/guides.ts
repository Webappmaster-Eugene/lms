import { guideMarkdownHeadings, markdownPlainText } from '@/lib/guide-markdown'
import { lexicalPlainText } from '@/lib/lexical-text'

export type GuideHeading = {
  /** Позиция заголовка среди узлов корня документа: по ней рендер находит, кому дать якорь. */
  index: number
  id: string
  title: string
}

/** Текст гайда: Markdown — основной формат, Lexical остался у гайдов, созданных до него. */
export type GuideBody = { markdown?: string | null; content?: unknown }

/** Инструкцию читают с остановками на действия — медленнее обычного текста. */
const WORDS_PER_MINUTE = 160

export function guideMarkdown(guide: GuideBody): string | null {
  return guide.markdown?.trim() ? guide.markdown : null
}

function rootChildren(content: unknown): unknown[] {
  const root = content && typeof content === 'object' ? (content as { root?: { children?: unknown } }).root : null
  return root && Array.isArray(root.children) ? root.children : []
}

/** Разделы Lexical-гайда — заголовки второго уровня в корне документа: из них строится оглавление. */
export function guideHeadings(content: unknown): GuideHeading[] {
  const headings: GuideHeading[] = []
  rootChildren(content).forEach((node, index) => {
    const { type, tag } = (node ?? {}) as { type?: unknown; tag?: unknown }
    if (type !== 'heading' || tag !== 'h2') return
    const title = lexicalPlainText({ root: { children: [node] } })
    if (title) headings.push({ index, id: `section-${headings.length + 1}`, title })
  })
  return headings
}

/** Оглавление гайда в любом формате: id и подписи разделов. */
export function guideContents(guide: GuideBody): { id: string; title: string }[] {
  const markdown = guideMarkdown(guide)
  return markdown ? guideMarkdownHeadings(markdown) : guideHeadings(guide.content)
}

export function guideReadingMinutes(guide: GuideBody): number {
  const markdown = guideMarkdown(guide)
  const text = markdown ? markdownPlainText(markdown) : lexicalPlainText(guide.content)
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

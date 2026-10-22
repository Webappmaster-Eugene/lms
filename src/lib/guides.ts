import { lexicalPlainText } from '@/lib/lexical-text'

export type GuideHeading = {
  /** Позиция заголовка среди узлов корня документа: по ней рендер находит, кому дать якорь. */
  index: number
  id: string
  title: string
}

/** Инструкцию читают с остановками на действия — медленнее обычного текста. */
const WORDS_PER_MINUTE = 160

function rootChildren(content: unknown): unknown[] {
  const root = content && typeof content === 'object' ? (content as { root?: { children?: unknown } }).root : null
  return root && Array.isArray(root.children) ? root.children : []
}

/** Разделы гайда — заголовки второго уровня в корне документа: из них строится оглавление. */
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

export function guideReadingMinutes(content: unknown): number {
  const words = lexicalPlainText(content).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

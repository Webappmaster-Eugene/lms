import { markdownRootHeadings } from '@/lib/guide-markdown'

export type LessonHeading = { id: string; title: string; children: LessonHeading[] }

export type LessonMarkdownOutline = {
  /** Смещение заголовка в тексте → id: по нему рендер находит, кому дать якорь. */
  anchors: Map<number, string>
  /** Разделы `##` с вложенными `###`; `###` до первого `##` — на верхнем уровне. */
  contents: LessonHeading[]
  /** Сколько заголовков в оглавлении. */
  count: number
  /** Якорь в стиле GitHub/GitLab (`#текст-заголовка`) → id: так работают ссылки, написанные в репозитории. */
  aliases: Map<string, string>
}

/** Слаги, которые строят GitHub и GitLab: GitLab ещё и схлопывает повторные дефисы. */
function headingSlugs(title: string): string[] {
  const github = title.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-')
  return [...new Set([github, github.replace(/-{2,}/g, '-')])]
}

/**
 * Якоря `##` и `###` урока. Формат id как в гайдах: `section-2`, `section-2-1` —
 * с префиксом, а не по тексту, чтобы id не совпал с именем свойства window или document.
 * Второй блок Markdown на странице получает свой префикс: id не повторяются.
 */
export function lessonMarkdownOutline(markdown: string, prefix = 'section'): LessonMarkdownOutline {
  const anchors = new Map<number, string>()
  const contents: LessonHeading[] = []
  const aliases = new Map<string, string>()
  const slugCount = new Map<string, number>()
  let section = 0
  let subsection = 0
  let current: LessonHeading | null = null

  for (const heading of markdownRootHeadings(markdown, [2, 3])) {
    let id: string
    if (heading.depth === 2) {
      section += 1
      subsection = 0
      id = `${prefix}-${section}`
      current = { id, title: heading.title, children: [] }
      contents.push(current)
    } else {
      subsection += 1
      id = `${prefix}-${section}-${subsection}`
      const item = { id, title: heading.title, children: [] }
      if (current) current.children.push(item)
      else contents.push(item)
    }
    anchors.set(heading.offset, id)
    for (const slug of headingSlugs(heading.title)) {
      // Повторный заголовок на GitHub получает суффикс -1, -2…
      const seen = slugCount.get(slug) ?? 0
      slugCount.set(slug, seen + 1)
      const alias = seen === 0 ? slug : `${slug}-${seen}`
      if (alias && !aliases.has(alias)) aliases.set(alias, id)
    }
  }

  return { anchors, contents, count: anchors.size, aliases }
}

/** Ссылка `#…` на заголовок урока: свой id остаётся, слаг из репозитория ведёт к своему заголовку. */
export function lessonHashTarget(href: string, outline: LessonMarkdownOutline): string {
  if (!href.startsWith('#') || href.length < 2) return href
  let fragment: string
  try {
    fragment = decodeURIComponent(href.slice(1))
  } catch {
    // Битое %-кодирование: браузер сам решит, куда вести, подменять нечего.
    return href
  }
  if ([...outline.anchors.values()].includes(fragment)) return href
  const id = outline.aliases.get(fragment.toLowerCase())
  return id ? `#${id}` : href
}

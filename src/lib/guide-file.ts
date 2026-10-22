import { formatDate } from '@/lib/utils'

/** Поля гайда, которые можно задать шапкой `---` в начале `.md`-файла. */
export type GuideFileFields = {
  title?: string
  summary?: string
  slug?: string
  order?: number
  published?: boolean
}

export type GuideFile = { fields: GuideFileFields; markdown: string }

const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
const LEADING_TITLE = /^#[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/

function scalar(raw: string): string {
  const value = raw.trim()
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'")
  // Комментарий YAML начинается с « #»: «C# для начинающих» комментарием не считается.
  return value.replace(/\s+#.*$/, '').trim()
}

function readFrontmatter(block: string): GuideFileFields {
  const fields: GuideFileFields = {}
  for (const line of block.split(/\r?\n/)) {
    const pair = /^([A-Za-z]+)[ \t]*:(.*)$/.exec(line)
    if (!pair) continue
    const key = pair[1].toLowerCase()
    const value = scalar(pair[2])
    if (!value) continue
    if (key === 'title' || key === 'summary' || key === 'slug') fields[key] = value
    else if (key === 'order' && /^-?\d+$/.test(value)) fields.order = Number(value)
    else if (key === 'published' && /^(true|false)$/i.test(value)) fields.published = value.toLowerCase() === 'true'
  }
  return fields
}

/**
 * Разбирает `.md`-файл гайда: необязательная шапка `---` с title, summary, slug, order и published,
 * дальше текст. Первая строка `# Заголовок` становится названием, если шапка его не задала,
 * и убирается из текста: название страница и так выводит заголовком.
 */
export function parseGuideFile(text: string): GuideFile {
  let body = text.replace(/^\uFEFF/, '')
  let fields: GuideFileFields = {}
  const frontmatter = FRONTMATTER.exec(body)
  if (frontmatter) {
    fields = readFrontmatter(frontmatter[1])
    body = body.slice(frontmatter[0].length)
  }
  body = body.replace(/^(?:[ \t]*\r?\n)+/, '')
  const heading = LEADING_TITLE.exec(body)
  if (heading && (!fields.title || fields.title === heading[1])) {
    fields.title = heading[1]
    body = body.slice(heading[0].length).replace(/^(?:[ \t]*\r?\n)+/, '')
  }
  return { fields, markdown: body.trimEnd() }
}

export function hasFrontmatter(text: string): boolean {
  return FRONTMATTER.test(text.replace(/^\uFEFF/, ''))
}

type DownloadableGuide = { title: string; summary: string; slug: string; markdown: string; updatedAt: string }

/** Файл, который получает ученик: самодостаточный — с названием, описанием и ссылкой на источник. */
export function guideMarkdownFile(guide: DownloadableGuide, origin: URL | string): string {
  const source = new URL(`/guides/${encodeURIComponent(guide.slug)}`, origin).toString()
  const summary = guide.summary.trim().replace(/\s*\n\s*/g, ' ')
  return `# ${guide.title}\n\n> ${summary}\n\n${guide.markdown.trim()}\n\n---\n\nИсточник: ${source} · обновлён ${formatDate(guide.updatedAt)}\n`
}

/** Content-Disposition с ASCII-запасным именем: старые клиенты не понимают filename*. */
export function guideDownloadDisposition(slug: string): string {
  const ascii = slug.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'guide'
  return `attachment; filename="${ascii}.md"; filename*=UTF-8''${encodeURIComponent(slug)}.md`
}

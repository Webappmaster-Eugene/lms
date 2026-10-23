import { formatDate } from '@/lib/utils'

/** Поля гайда, которые можно задать шапкой `---` в начале `.md`-файла. */
export type GuideFileFields = {
  title?: string
  summary?: string
  slug?: string
  order?: number
  published?: boolean
  /** Название или slug категории как написано в шапке; в id его переводит серверный хук, у которого есть база. */
  category?: string
  /** Даты — ISO-строки. */
  reviewedAt?: string
  reviewBy?: string
}

/** `problems` — строки шапки, которые не удалось понять: их показывают автору, а не теряют молча. */
export type GuideFile = { fields: GuideFileFields; markdown: string; problems: string[] }

const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
const LEADING_TITLE = /^#[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/

function scalar(raw: string): string {
  const value = raw.trim()
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'")
  // Комментарий YAML начинается с « #»: «C# для начинающих» комментарием не считается.
  return value.replace(/\s+#.*$/, '').trim()
}

/** Дата шапки `2026-10-22` — полдень UTC: в любом часовом поясе это тот же день. */
function headerDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T12:00:00.000Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date.toISOString()
}

function readFrontmatter(block: string): { fields: GuideFileFields; problems: string[] } {
  const fields: GuideFileFields = {}
  const problems: string[] = []
  for (const line of block.split(/\r?\n/)) {
    const pair = /^([A-Za-z_]+)[ \t]*:(.*)$/.exec(line)
    if (!pair) continue
    // review_by и reviewBy — одно поле.
    const key = pair[1].toLowerCase().replace(/_/g, '')
    const value = scalar(pair[2])
    if (!value) continue
    if (key === 'title' || key === 'summary' || key === 'slug') fields[key] = value
    else if (key === 'order' && /^-?\d+$/.test(value)) fields.order = Number(value)
    else if (key === 'published' && /^(true|false)$/i.test(value)) fields.published = value.toLowerCase() === 'true'
    else if (key === 'category') fields.category = value
    else if (key === 'reviewed' || key === 'reviewby') {
      const date = headerDate(value)
      if (!date) problems.push(`${pair[1]}: «${value}» — нужна дата вида 2026-10-22`)
      else if (key === 'reviewed') fields.reviewedAt = date
      else fields.reviewBy = date
    }
  }
  return { fields, problems }
}

/**
 * Разбирает `.md`-файл гайда: необязательная шапка `---` (title, summary, slug, order, published,
 * category, reviewed, review_by), дальше текст. Первая строка `# Заголовок` становится названием,
 * если шапка его не задала, и убирается из текста: название страница и так выводит заголовком.
 */
export function parseGuideFile(text: string): GuideFile {
  let body = text.replace(/^\uFEFF/, '')
  let fields: GuideFileFields = {}
  let problems: string[] = []
  const frontmatter = FRONTMATTER.exec(body)
  if (frontmatter) {
    ;({ fields, problems } = readFrontmatter(frontmatter[1]))
    body = body.slice(frontmatter[0].length)
  }
  body = body.replace(/^(?:[ \t]*\r?\n)+/, '')
  const heading = LEADING_TITLE.exec(body)
  if (heading && (!fields.title || fields.title === heading[1])) {
    fields.title = heading[1]
    body = body.slice(heading[0].length).replace(/^(?:[ \t]*\r?\n)+/, '')
  }
  return { fields, markdown: body.trimEnd(), problems }
}

export function hasFrontmatter(text: string): boolean {
  return FRONTMATTER.test(text.replace(/^\uFEFF/, ''))
}

type DownloadableGuide = { title: string; summary: string; slug: string; markdown: string; updatedAt: string; reviewedAt?: string | null }

/** Файл, который получает ученик: самодостаточный — с названием, описанием и ссылкой на источник. */
export function guideMarkdownFile(guide: DownloadableGuide, origin: URL | string): string {
  const source = new URL(`/guides/${encodeURIComponent(guide.slug)}`, origin).toString()
  const summary = guide.summary.trim().replace(/\s*\n\s*/g, ' ')
  // Картинки и ссылки внутри платформы в файле должны вести на неё, а не в никуда.
  const markdown = guide.markdown.trim().replace(/(\]\()\/(?!\/)/g, `$1${new URL('/', origin).toString()}`)
  const date = guide.reviewedAt ? `данные проверены ${formatDate(guide.reviewedAt)}` : `обновлён ${formatDate(guide.updatedAt)}`
  return `# ${guide.title}\n\n> ${summary}\n\n${markdown}\n\n---\n\nИсточник: ${source} · ${date}\n`
}

/** Content-Disposition с ASCII-запасным именем: старые клиенты не понимают filename*. */
export function guideDownloadDisposition(slug: string): string {
  const ascii = slug.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'guide'
  return `attachment; filename="${ascii}.md"; filename*=UTF-8''${encodeURIComponent(slug)}.md`
}

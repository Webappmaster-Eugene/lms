/**
 * Разметка текста email-рассылки. Администратор пишет обычный текст: пустая строка
 * разделяет абзацы, `**жирный**`, `[текст](https://…)` и голые https-ссылки
 * становятся ссылками. Всё остальное — текст, HTML не пропускается.
 */
export const BROADCAST_LIMITS = { subject: 200, body: 20_000, ctaLabel: 60, ctaUrl: 2000, recipients: 5000 } as const

export type BroadcastInline =
  | { type: 'text'; value: string }
  | { type: 'bold'; children: BroadcastInline[] }
  | { type: 'link'; label: string; url: string }
  | { type: 'break' }

const TOKEN = /\[([^\]\n]{1,300})\]\((https?:\/\/[^\s()<>]{1,2000})\)|\*\*([^*\n][^\n]*?)\*\*|(https?:\/\/[^\s<>"']{1,2000})/g
// Точка или скобка в конце предложения почти никогда не часть адреса.
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}

function inline(source: string, allowBold: boolean): BroadcastInline[] {
  const result: BroadcastInline[] = []
  const pushText = (value: string) => {
    if (!value) return
    const last = result.at(-1)
    if (last?.type === 'text') last.value += value
    else result.push({ type: 'text', value })
  }
  let cursor = 0
  for (const match of source.matchAll(TOKEN)) {
    const [whole, label, linkUrl, bold, bare] = match
    const start = match.index
    if (bold !== undefined && !allowBold) continue
    pushText(source.slice(cursor, start))
    cursor = start + whole.length
    if (label !== undefined && linkUrl !== undefined) {
      const url = safeHttpUrl(linkUrl)
      if (url) result.push({ type: 'link', label: label.trim() || url, url })
      else pushText(whole)
    } else if (bold !== undefined) {
      result.push({ type: 'bold', children: inline(bold, false) })
    } else if (bare !== undefined) {
      const trailing = bare.match(TRAILING_PUNCTUATION)?.[0] ?? ''
      const candidate = trailing ? bare.slice(0, -trailing.length) : bare
      const url = safeHttpUrl(candidate)
      if (url) result.push({ type: 'link', label: candidate, url })
      else pushText(candidate)
      pushText(trailing)
    }
  }
  pushText(source.slice(cursor))
  return result
}

/** Абзацы письма: внутри абзаца переносы строк сохраняются. */
export function parseBroadcastBody(body: string): BroadcastInline[][] {
  return body.replace(/\r\n?/g, '\n').trim().split(/\n[ \t]*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => paragraph.split('\n').flatMap((line, index) => [
      ...(index > 0 ? [{ type: 'break' } as const] : []),
      ...inline(line.trimEnd(), true),
    ]))
}

export function broadcastPlainText(nodes: BroadcastInline[]): string {
  return nodes.map((node) => {
    if (node.type === 'text') return node.value
    if (node.type === 'break') return '\n'
    if (node.type === 'bold') return broadcastPlainText(node.children)
    return node.label === node.url || node.label === node.url.replace(/\/$/, '') ? node.label : `${node.label} (${node.url})`
  }).join('')
}

/** Ссылка кнопки: абсолютный http(s) без учётных данных или путь внутри платформы. */
export function broadcastCtaUrlError(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > BROADCAST_LIMITS.ctaUrl) return 'Ссылка кнопки слишком длинная'
  if (value.startsWith('/')) {
    return !value.startsWith('//') && !/[\s\\]/.test(value) ? null : 'Путь кнопки должен начинаться с одной косой черты и не содержать пробелов'
  }
  return safeHttpUrl(value) ? null : 'Укажите ссылку https://… или путь на платформе, например /courses'
}

export function absoluteBroadcastUrl(value: string, baseUrl: string): string {
  return value.startsWith('/') ? `${baseUrl.replace(/\/+$/, '')}${value}` : value
}

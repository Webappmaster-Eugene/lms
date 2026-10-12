const INLINE_NODES = new Set(['text', 'link', 'autolink', 'linebreak', 'tab'])
const isInline = (node: unknown): boolean =>
  !!node && typeof node === 'object' && INLINE_NODES.has(String((node as { type?: unknown }).type))

/** Плоский текст из Lexical JSON — для карточек и подзаголовков, где разметка не нужна. */
export function lexicalPlainText(value: unknown): string {
  const paragraphs: string[] = []
  const collect = (node: unknown): string => {
    if (!node || typeof node !== 'object') return ''
    const record = node as { type?: unknown; text?: unknown; children?: unknown }
    if (typeof record.text === 'string') return record.text
    if (record.type === 'linebreak' || record.type === 'tab') return ' '
    if (!Array.isArray(record.children)) return ''
    // Вложенные блоки (пункты списка) — отдельные фразы: без пробела «HTML» и «CSS» слиплись бы.
    return record.children.map((child) => isInline(child) ? collect(child) : ` ${collect(child)} `).join('')
  }
  const root = value && typeof value === 'object' ? (value as { root?: { children?: unknown } }).root : null
  if (!root || !Array.isArray(root.children)) return ''
  for (const block of root.children) {
    const text = collect(block).replace(/\s+/g, ' ').trim()
    if (text) paragraphs.push(text)
  }
  return paragraphs.join(' ')
}

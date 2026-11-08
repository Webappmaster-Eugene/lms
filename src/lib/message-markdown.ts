import { parseTimestamps } from '@/lib/video-memory'

/** Текст поля после правки и выделение, которое нужно вернуть. */
export type FieldEdit = { value: string; selectionStart: number; selectionEnd: number }

/** Вставка на место выделения, курсор - после вставленного. */
export function insertText(value: string, start: number, end: number, text: string): FieldEdit {
  const caret = start + text.length
  return { value: `${value.slice(0, start)}${text}${value.slice(end)}`, selectionStart: caret, selectionEnd: caret }
}

/**
 * Кнопка «Код», как у GitHub: выделение в одну строку - `код в строке`,
 * многострочное - блок ```, без выделения - пустой блок с курсором внутри.
 */
export function insertCode(value: string, start: number, end: number): FieldEdit {
  const selected = value.slice(start, end)
  const before = value.slice(0, start)
  const after = value.slice(end)
  if (selected && !selected.includes('\n')) {
    return { value: `${before}\`${selected}\`${after}`, selectionStart: start + 1, selectionEnd: end + 1 }
  }
  const lead = before === '' || before.endsWith('\n') ? '' : '\n'
  const trail = after.startsWith('\n') ? '' : '\n'
  const opening = `${lead}\`\`\`\n`
  const body = selected.replace(/\n$/, '')
  const caret = before.length + opening.length
  return {
    value: `${before}${opening}${body}\n\`\`\`${trail}${after}`,
    selectionStart: caret,
    selectionEnd: caret + body.length,
  }
}

type HastText = { type: 'text'; value: string }
type HastElement = { type: 'element'; tagName: string; properties: Record<string, unknown>; children: HastNode[] }
type HastNode = HastText | HastElement | { type: 'root' | 'comment' | 'doctype' | 'raw'; children?: HastNode[] }

/** Таймкод в коде или в ссылке - часть текста, а не переход к видео. */
const KEEP_AS_TEXT = new Set(['pre', 'code', 'a'])

/** Атрибут, по которому компонент ссылки узнаёт таймкод. Из Markdown его не подставить: HTML ученика не исполняется. */
export const TIMESTAMP_PROPERTY = 'dataTimestamp'

function splitTimestamps(value: string): HastNode[] {
  const stamps = parseTimestamps(value)
  if (stamps.length === 0) return [{ type: 'text', value }]
  const nodes: HastNode[] = []
  let last = 0
  for (const stamp of stamps) {
    if (stamp.index > last) nodes.push({ type: 'text', value: value.slice(last, stamp.index) })
    nodes.push({
      type: 'element',
      tagName: 'a',
      properties: { href: `?t=${stamp.seconds}`, [TIMESTAMP_PROPERTY]: String(stamp.seconds) },
      children: [{ type: 'text', value: stamp.label }],
    })
    last = stamp.index + stamp.length
  }
  if (last < value.length) nodes.push({ type: 'text', value: value.slice(last) })
  return nodes
}

function walk(node: { children?: HastNode[] }) {
  if (!node.children) return
  node.children = node.children.flatMap((child) => {
    if (child.type === 'text') return splitTimestamps(child.value)
    if (child.type === 'element' && KEEP_AS_TEXT.has(child.tagName)) return [child]
    walk(child)
    return [child]
  })
}

/** Rehype-плагин: «12:34» и «[12:34]» в тексте сообщения становятся переходом к моменту видео. */
export function rehypeTimestamps() {
  return (tree: { children?: HastNode[] }) => walk(tree)
}

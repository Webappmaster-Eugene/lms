export type ContentCollection = 'courses' | 'sections' | 'lessons'

export class ContentError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message)
    this.name = 'ContentError'
  }
}

export function contentCollection(value: string): ContentCollection {
  if (value === 'courses' || value === 'sections' || value === 'lessons') return value
  throw new ContentError('Этот вид контента не поддерживается', 404)
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContentError(`${label}: требуется объект`)
  }
  return value as Record<string, unknown>
}

export function contentId(value: unknown, label = 'ID'): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new ContentError(`${label}: требуется положительный целый ID`)
  }
  return value
}

function text(value: unknown, label: string, limit: number, required = false): void {
  if (value === null && !required) return
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) {
    throw new ContentError(`${label}: ${required ? 'заполните поле, ' : ''}не более ${limit} символов`)
  }
}

function number(value: unknown, label: string, min = 0, max = 1_000_000): void {
  if (value === null) return
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ContentError(`${label}: укажите число от ${min} до ${max}`)
  }
}

function allowedFields(value: Record<string, unknown>, fields: readonly string[]): void {
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) throw new ContentError(`Поле «${key}» нельзя изменять здесь`)
  }
}

export function validateContentUrl(value: unknown, relative = false): void {
  text(value, 'Ссылка', 4000, true)
  const url = value as string
  if (/\s|\\/.test(url) || [...url].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new ContentError('Ссылка содержит недопустимые символы')
  }
  if (relative && /^\/(?!\/)/.test(url)) return
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('protocol')
    }
  } catch {
    throw new ContentError('Укажите ссылку http:// или https://')
  }
}

const LEXICAL_TYPES = new Set([
  'root', 'paragraph', 'text', 'heading', 'list', 'listitem', 'quote', 'link',
  'autolink', 'linebreak', 'tab', 'horizontalrule', 'upload', 'relationship',
  'code', 'code-highlight', 'table', 'tablerow', 'tablecell',
])

export function canonicalContent(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
  })
}

export function validateLexical(value: unknown): void {
  const state = record(value, 'Форматированный текст')
  allowedFields(state, ['root'])
  let nodes = 0
  function visit(input: unknown, depth: number): void {
    nodes += 1
    if (nodes > 10_000 || depth > 40) throw new ContentError('Форматированный текст слишком сложный')
    const node = record(input, 'Узел текста')
    if (typeof node.type !== 'string' || !LEXICAL_TYPES.has(node.type) ||
      (['link', 'autolink', 'upload', 'relationship'].includes(String(node.type))
        ? ![1, 2, 3].includes(Number(node.version)) || typeof node.version !== 'number'
        : node.version !== 1)) {
      throw new ContentError('Неподдерживаемый формат узла текста')
    }
    for (const key of Object.keys(node)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new ContentError('Недопустимое поле текста')
    }
    if (node.type === 'text') {
      if (typeof node.text !== 'string' || node.text.length > 100_000) throw new ContentError('Некорректный текст узла')
      if (node.format !== undefined && (typeof node.format !== 'number' || !Number.isSafeInteger(node.format) || node.format < 0 || node.format > 4095)) throw new ContentError('Некорректное форматирование текста')
      if (node.style !== undefined) text(node.style, 'Стиль текста', 1000)
    }
    if (node.type === 'heading' && !/^h[1-6]$/.test(String(node.tag))) throw new ContentError('Выберите уровень заголовка от h1 до h6')
    if (node.type === 'list' && !['ul', 'ol'].includes(String(node.tag))) throw new ContentError('Некорректный вид списка')
    if (node.type === 'link' || node.type === 'autolink') {
      if (node.fields !== undefined) {
        const fields = record(node.fields, 'Ссылка в тексте')
        allowedFields(fields, ['url', 'linkType', 'newTab', 'doc'])
        if (fields.newTab !== undefined && typeof fields.newTab !== 'boolean') throw new ContentError('Некорректный режим открытия ссылки')
        if (fields.linkType !== undefined && !['internal', 'custom'].includes(String(fields.linkType))) throw new ContentError('Некорректный вид ссылки')
        if (fields.linkType === 'internal') {
          const doc = record(fields.doc, 'Внутренняя ссылка')
          allowedFields(doc, ['relationTo', 'value'])
          if (!['courses', 'lessons', 'roadmaps'].includes(String(doc.relationTo))) throw new ContentError('Неподдерживаемая внутренняя ссылка')
          contentId(doc.value, 'Внутренняя ссылка')
        } else validateContentUrl(fields.url, true)
      } else validateContentUrl(node.url, true)
    }
    if (node.type === 'upload') {
      if (node.relationTo !== 'media') throw new ContentError('Изображения текста должны быть из медиатеки')
      contentId(node.value, 'Медиа')
    }
    if (node.type === 'relationship') {
      if (!['courses', 'lessons', 'roadmaps'].includes(String(node.relationTo))) throw new ContentError('Неподдерживаемая связь в тексте')
      contentId(node.value, 'Связь в тексте')
    }
    if (node.children !== undefined) {
      if (!Array.isArray(node.children)) throw new ContentError('Дочерние узлы текста должны быть массивом')
      for (const child of node.children) visit(child, depth + 1)
    }
  }
  const root = record(state.root, 'Корень текста')
  if (root.type !== 'root' || !Array.isArray(root.children)) throw new ContentError('Некорректный корень Lexical')
  visit(root, 0)
}

const BLOCK_FIELDS: Record<string, readonly string[]> = {
  text: ['content'], video: ['title', 'videoUrl', 'displayMode', 'description', 'durationMinutes'],
  image: ['image', 'caption', 'altText'], link: ['title', 'url', 'platform', 'description'],
  miro: ['title', 'embedUrl', 'height'], file: ['title', 'file', 'description'],
}

function validateBlocks(value: unknown, existing: unknown): void {
  if (value === null) return
  if (!Array.isArray(value) || value.length > 100) throw new ContentError('Контент: не более 100 блоков')
  const ids = new Set<string>()
  const previous = Array.isArray(existing) ? existing : []
  for (const input of value) {
    const block = record(input, 'Блок контента')
    const fields = typeof block.blockType === 'string' ? BLOCK_FIELDS[block.blockType] : undefined
    if (!fields) throw new ContentError('Неподдерживаемый вид блока контента')
    allowedFields(block, ['blockType', 'blockName', 'id', ...fields])
    if (block.id !== undefined && block.id !== null) {
      text(block.id, 'ID блока', 100, true)
      if (ids.has(String(block.id))) throw new ContentError('ID блоков не должны повторяться')
      ids.add(String(block.id))
    }
    if (block.blockName !== undefined) text(block.blockName, 'Название блока', 200)
    for (const key of ['description', 'caption', 'altText']) {
      if (block[key] !== undefined) text(block[key], key, key === 'description' ? 10_000 : 1000)
    }
    if (['video', 'link', 'miro', 'file'].includes(String(block.blockType))) text(block.title, 'Название блока', 200, true)
    if (block.blockType === 'text') {
      const prior: unknown = typeof block.id === 'string'
        ? previous.find((item: unknown) => item && typeof item === 'object' && 'id' in item && item.id === block.id && 'blockType' in item && item.blockType === 'text')
        : undefined
      const unchanged = prior && typeof prior === 'object' && 'content' in prior && canonicalContent(block.content) === canonicalContent(prior.content)
      if (!unchanged) validateLexical(block.content)
    }
    if (block.blockType === 'video') {
      validateContentUrl(block.videoUrl)
      if (block.displayMode !== undefined && !['embed', 'link'].includes(String(block.displayMode))) throw new ContentError('Выберите режим отображения видео')
      if (block.durationMinutes !== undefined) number(block.durationMinutes, 'Длительность видео')
    }
    if (block.blockType === 'link') {
      validateContentUrl(block.url, true)
      if (block.platform !== undefined && block.platform !== null && !['boosty', 'telegram', 'youtube', 'github', 'other'].includes(String(block.platform))) throw new ContentError('Неизвестная платформа ссылки')
    }
    if (block.blockType === 'miro') {
      validateContentUrl(block.embedUrl)
      const url = new URL(String(block.embedUrl))
      if (url.protocol !== 'https:' || url.hostname !== 'miro.com' || !/^\/app\/(?:live-)?embed\//.test(url.pathname)) throw new ContentError('Укажите ссылку https://miro.com/app/embed/… или /app/live-embed/…')
      if (block.height !== undefined) {
        if (block.height === null) throw new ContentError('Укажите высоту доски от 300 до 1200')
        number(block.height, 'Высота доски', 300, 1200)
      }
    }
    if (block.blockType === 'image') contentId(block.image, 'Изображение')
    if (block.blockType === 'file') contentId(block.file, 'Файл')
  }
}

const COMMON = ['title', 'slug', 'description', 'order', 'isPublished']
const FIELDS = {
  courses: [...COMMON, 'roadmap', 'roadmapNode', 'coverImage', 'estimatedHours', 'prerequisites'],
  sections: [...COMMON, 'course'],
  lessons: [...COMMON, 'course', 'section', 'estimatedMinutes', 'content'],
}

export function validateContentInput(collection: ContentCollection, input: unknown, update = false, options: {
  deferStructuredValidation?: boolean
  existing?: Record<string, unknown>
} = {}): {
  data: Record<string, unknown>
  expectedUpdatedAt?: string
} {
  const body = record(input, 'Данные')
  if (JSON.stringify(body).length > 1_000_000) throw new ContentError('Слишком большой объём контента')
  allowedFields(body, [...FIELDS[collection], ...(update ? ['expectedUpdatedAt'] : [])])
  const { expectedUpdatedAt, ...data } = body
  if (update && (typeof expectedUpdatedAt !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(expectedUpdatedAt) || !Number.isFinite(Date.parse(expectedUpdatedAt)))) {
    throw new ContentError('Откройте актуальную версию перед сохранением (expectedUpdatedAt)')
  }
  if (!Object.keys(data).length) throw new ContentError('Нет изменений для сохранения')
  if (!update || data.title !== undefined) text(data.title, 'Название', 200, true)
  if (data.slug !== undefined) {
    text(data.slug, 'Slug', 200, true)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(data.slug))) throw new ContentError('Slug: латинские буквы, цифры и дефисы')
  }
  const parent = collection === 'courses' ? 'roadmap' : 'course'
  if (!update || data[parent] !== undefined) contentId(data[parent], 'Родитель')
  for (const key of ['roadmapNode', 'coverImage', 'section']) {
    if (data[key] !== undefined && data[key] !== null) contentId(data[key], key)
  }
  if (data.description !== undefined && data.description !== null) {
    if (collection === 'courses') {
      if (!options.deferStructuredValidation && (!options.existing || canonicalContent(data.description) !== canonicalContent(options.existing.description))) validateLexical(data.description)
    }
    else text(data.description, 'Описание', collection === 'lessons' ? 300 : 500)
  }
  for (const key of ['estimatedHours', 'estimatedMinutes', 'order']) {
    if (data[key] !== undefined) {
      number(data[key], key)
      if (key === 'order' && (data[key] === null || !Number.isInteger(data[key]))) throw new ContentError('Порядок: требуется целое число от 0 до 1000000')
    }
  }
  if (data.isPublished !== undefined && typeof data.isPublished !== 'boolean') throw new ContentError('Публикация: требуется boolean')
  if (data.prerequisites !== undefined) {
    if (data.prerequisites !== null && (!Array.isArray(data.prerequisites) || data.prerequisites.length > 100)) throw new ContentError('Не более 100 курсов-пререквизитов')
    if (Array.isArray(data.prerequisites)) for (const id of data.prerequisites) contentId(id, 'Пререквизит')
  }
  if (data.content !== undefined && !options.deferStructuredValidation &&
    (!options.existing || canonicalContent(data.content) !== canonicalContent(options.existing.content))) validateBlocks(data.content, options.existing?.content)
  return { data, expectedUpdatedAt: typeof expectedUpdatedAt === 'string' ? expectedUpdatedAt : undefined }
}

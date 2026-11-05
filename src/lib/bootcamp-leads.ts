import { PROGRAM_KEY_PATTERN } from '@/lib/bootcamp-programs'

/**
 * Предзапись на буткемп с публичного лендинга: что принимает форма и в каком виде
 * это хранится. Посетитель анонимный, поэтому всё, что приходит, проверяется и
 * обрезается здесь, до записи в базу.
 */

/**
 * Порядок - порядок в списке CMS. Этап меняют только кнопки в карточке заявки и события
 * системы (решение владельца 31.10.2026); «Связались» остался от ручного учёта, кнопок к нему нет.
 */
export const BOOTCAMP_LEAD_STATUSES = [
  { value: 'new', label: 'Новая' },
  { value: 'contacted', label: 'Связались' },
  { value: 'diagnostic', label: 'Решение на проверке' },
  { value: 'admitted', label: 'Допущен, ждёт оплаты' },
  { value: 'paid', label: 'Оплачен' },
  { value: 'enrolled', label: 'Зачислен' },
  { value: 'preparation', label: 'Нужна подготовка' },
  { value: 'rejected', label: 'Отказ' },
  { value: 'withdrawn', label: 'Отозвана' },
] as const
export type BootcampLeadStatus = (typeof BOOTCAMP_LEAD_STATUSES)[number]['value']
export const leadStatusLabel = (status: string | null | undefined) => BOOTCAMP_LEAD_STATUSES.find((item) => item.value === status)?.label ?? status ?? 'нет'

export const BOOTCAMP_UTM_FIELDS = [
  ['utm_source', 'utmSource'],
  ['utm_medium', 'utmMedium'],
  ['utm_campaign', 'utmCampaign'],
  ['utm_content', 'utmContent'],
  ['utm_term', 'utmTerm'],
] as const

/** Ответы анкеты: значения совпадают с формой лендинга, сверяет tests/smoke/bootcampLanding.smoke.test.ts. */
export const BOOTCAMP_LEAD_REASONS = [
  { value: 'first-job', label: 'Первая работа в ИТ' },
  { value: 'switch-or-grow', label: 'Сменить работу или вырасти в грейде' },
  { value: 'interviews', label: 'Подготовка к собеседованиям' },
  { value: 'new-area', label: 'Перейти в другую область' },
  { value: 'other', label: 'Другое' },
] as const
export const BOOTCAMP_LEAD_URGENCIES = [
  { value: 'now', label: 'Нужно сейчас' },
  { value: 'soon', label: '1-3 месяца' },
  { value: 'browsing', label: 'Присматриваюсь' },
] as const
export const BOOTCAMP_LEAD_HOURS = [
  { value: 'under-5', label: 'До 5' },
  { value: '5-10', label: '5-10' },
  { value: '10-20', label: '10-20' },
  { value: 'over-20', label: 'Больше 20' },
] as const

type Option = { value: string, label: string }
export const leadOptionLabel = (options: readonly Option[], value: string | null | undefined) => options.find((item) => item.value === value)?.label ?? null

/** Те же пороги у формы на mentorcareer.ru: заявка должна проверяться одинаково на обоих сайтах. */
export const LEAD_ANSWER_LIMITS = {
  problem: { min: 100, max: 3000, words: 10, distinct: 6 },
  story: { min: 100, max: 3000, words: 10, distinct: 6 },
  goal: { min: 20, max: 1500, words: 3, distinct: 1 },
} as const
export const LEAD_LINKS_MAX = 5
/** Быстрее анкету заполняет только робот; замер идёт с первого касания формы. */
export const LEAD_MIN_FILL_MS = 15_000
export const LEAD_RESUME_MAX_BYTES = 5 * 1024 * 1024
/** Том с файлами общий с базой и другими сайтами VM: файлы от анонимов не должны занять его целиком. */
export const LEAD_RESUMES_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024
/** Тело запроса: файл и текст анкеты. */
export const LEAD_BODY_MAX_BYTES = LEAD_RESUME_MAX_BYTES + 64 * 1024
/** Предел тела рассчитан на файл: текст проверяется посимвольно и не должен занимать все пять мегабайт. */
export const LEAD_TEXT_MAX_CHARS = 64 * 1024

export type BootcampLeadSource = Record<(typeof BOOTCAMP_UTM_FIELDS)[number][1] | 'referrerHost', string | null>

export type BootcampLeadInput = {
  /** Ключ программы; есть ли она и принимает ли заявки, сервер проверяет по CMS. */
  program: string
  email: string
  name: string
  /** Ник с @ или телефон: с этого аккаунта владелец ждёт сообщение. */
  telegram: string
  reason: (typeof BOOTCAMP_LEAD_REASONS)[number]['value']
  problem: string
  story: string
  goal: string
  urgency: (typeof BOOTCAMP_LEAD_URGENCIES)[number]['value']
  hoursPerWeek: (typeof BOOTCAMP_LEAD_HOURS)[number]['value']
  /** Ссылки по одной на строку. */
  links: string | null
  fillSeconds: number
  consentVersion: string
  source: BootcampLeadSource
}

export class BootcampLeadError extends Error {
  readonly status = 400
  /** Поле формы, рядом с которым показать ошибку. */
  constructor(message: string, readonly field?: string) { super(message) }
}

/** Управляющие символы, разделители строк и невидимые знаки формата (смена направления текста) — в письме команде они подменяют видимую строку. */
function isControl(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return code < 0x20 || (code >= 0x7f && code <= 0x9f) || /^[\p{Cf}\p{Zl}\p{Zp}]$/u.test(char)
}
const hasControl = (value: string) => [...value].some(isControl)
// То же правило, что у поля email в Payload (fields/validations): иначе адрес, принятый здесь, отверг бы Payload при записи.
const EMAIL = /^(?!.*\.\.)[\w!#$%&'*+/=?^`{|}~-](?:[\w!#$%&'*+/=?^`{|}~.-]*[\w!#$%&'*+/=?^`{|}~-])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** Метки рекламы приходят из адреса страницы как есть: лишнее обрезается, а не роняет заявку. */
function label(value: unknown): string | null {
  const raw = text(value)
  if (raw === null) return null
  const clean = [...raw].map((char) => (isControl(char) ? ' ' : char)).join('').replace(/\s+/g, ' ').trim().slice(0, 100)
  return clean || null
}

/** Только хост: полный адрес страницы-источника может нести чужие параметры и персональные данные. */
function referrerHost(value: unknown): string | null {
  const raw = text(value)
  if (!raw || raw.length > 2048) return null
  try {
    const url = new URL(raw)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.length <= 255 ? url.hostname : null
  } catch {
    return null
  }
}

/** Заполнено скрытое поле, которое человек не видит: отправил робот. */
export function isLeadTrap(body: unknown): boolean {
  const website = body && typeof body === 'object' ? (body as Record<string, unknown>).website : null
  return typeof website === 'string' && website.trim() !== ''
}

/** Форма приходит multipart: файл резюме в JSON не положить. */
export function leadBodyFromForm(form: FormData): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  let length = 0
  for (const [key, value] of form.entries()) {
    if (typeof value !== 'string') continue
    length += value.length
    body[key] = value
  }
  if (length > LEAD_TEXT_MAX_CHARS) throw new BootcampLeadError('Анкета слишком длинная. Сократите ответы и отправьте её ещё раз.')
  body.consent = form.get('consent') === 'on'
  body.utm = Object.fromEntries(BOOTCAMP_UTM_FIELDS.flatMap(([key]) => { const value = form.get(key); return typeof value === 'string' ? [[key, value]] : [] }))
  return body
}

/** Абзацы сохраняем, а разделители и невидимые знаки, которые приходят при вставке из документов, убираем. */
function answerText(value: unknown): string {
  const raw = text(value) ?? ''
  return [...raw.replace(/\r\n?|[\u2028\u2029]/g, '\n')].filter((char) => char === '\n' || char === '\t' || !isControl(char)).join('').replace(/\n{3,}/g, '\n\n').trim()
}

/** Слово - две буквы подряд и больше: иначе сто раз «а» или набор знаков прошли бы проверку длины. */
const wordsOf = (value: string) => value.toLowerCase().match(/\p{L}{2,}/gu) ?? []

function parseAnswer(data: Record<string, unknown>, field: keyof typeof LEAD_ANSWER_LIMITS, empty: string): string {
  const answer = answerText(data[field])
  const { min, max, words, distinct } = LEAD_ANSWER_LIMITS[field]
  if (!answer) throw new BootcampLeadError(empty, field)
  if (answer.length > max) throw new BootcampLeadError(`Слишком длинный ответ: до ${max} знаков.`, field)
  const found = wordsOf(answer)
  if (answer.length < min || found.length < words || new Set(found).size < distinct) throw new BootcampLeadError(`Расскажите подробнее: нужно хотя бы ${min} знаков связного текста.`, field)
  return answer
}

/** Ник, ссылка t.me или телефон: у части людей нет ника. Почта сюда не подходит: написать надо именно в Telegram. */
export function normalizeLeadTelegram(value: unknown): string | null {
  const raw = (text(value) ?? '').trim()
  if (!raw || raw.length > 100) return null
  const username = /^(?:https?:\/\/)?(?:www\.)?t(?:elegram)?\.me\/@?([a-zA-Z][a-zA-Z0-9_]{4,31})\/?$/.exec(raw)?.[1] ?? /^@?([a-zA-Z][a-zA-Z0-9_]{4,31})$/.exec(raw)?.[1]
  if (username) return `@${username}`
  const phone = raw.replace(/[\s()-]/g, '')
  return /^\+?\d{10,15}$/.test(phone) ? phone : null
}

function parseLinks(value: unknown): string | null {
  const parts = (text(value) ?? '').split(/[\s,]+/).filter(Boolean)
  if (parts.length > LEAD_LINKS_MAX) throw new BootcampLeadError(`Укажите не больше ${LEAD_LINKS_MAX} ссылок.`, 'links')
  const links = parts.map((part) => {
    let url: URL | null = null
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(part) ? part : `https://${part}`)
    } catch {
      // Ниже общий отказ с текстом этой ссылки.
    }
    if (!url || !['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.href.length > 300 || hasControl(part)) {
      throw new BootcampLeadError(`Проверьте ссылку: ${part.slice(0, 60)}`, 'links')
    }
    return url.href
  })
  return links.length > 0 ? links.join('\n') : null
}

function parseChoice<T extends string>(data: Record<string, unknown>, field: string, options: readonly { value: T }[], message: string): T {
  const found = options.find((item) => item.value === data[field])
  if (!found) throw new BootcampLeadError(message, field)
  return found.value
}

export function parseBootcampLead(body: unknown): BootcampLeadInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BootcampLeadError('Заявка пришла в неверном формате. Обновите страницу и отправьте ещё раз.')
  const data = body as Record<string, unknown>

  const program = typeof data.program === 'string' && PROGRAM_KEY_PATTERN.test(data.program) ? data.program : null
  if (!program) throw new BootcampLeadError('Такой программы нет. Обновите страницу и отправьте заявку ещё раз.')

  const email = (text(data.email) ?? '').trim().toLowerCase()
  if (!email) throw new BootcampLeadError('Укажите email.', 'email')
  if (email.length > 254 || hasControl(email) || !EMAIL.test(email)) throw new BootcampLeadError('Проверьте email: в нём должны быть @ и домен, например name@mail.ru.', 'email')

  const rawName = text(data.name)
  const name = rawName?.replace(/\s+/g, ' ').trim() ?? ''
  if (name.length < 2) throw new BootcampLeadError('Как к вам обращаться? Укажите имя.', 'name')
  if (name.length > 100 || hasControl(name)) throw new BootcampLeadError('Имя: до 100 знаков, без служебных символов.', 'name')

  const telegram = normalizeLeadTelegram(data.telegram)
  if (!telegram) throw new BootcampLeadError('Укажите Telegram: ник, ссылку t.me или телефон.', 'telegram')

  const reason = parseChoice(data, 'reason', BOOTCAMP_LEAD_REASONS, 'Выберите, с чем вы пришли.')
  const problem = parseAnswer(data, 'problem', 'Расскажите, в чём сейчас проблема.')
  const story = parseAnswer(data, 'story', 'Расскажите свою историю.')
  // Один текст в двух полях - верный признак, что анкету заполняли не всерьёз.
  if (wordsOf(problem).join(' ') === wordsOf(story).join(' ')) throw new BootcampLeadError('История совпадает с описанием проблемы. Расскажите, где вы работали или учились.', 'story')
  const goal = parseAnswer(data, 'goal', 'Напишите, какой результат будет успехом и к какому сроку.')
  const urgency = parseChoice(data, 'urgency', BOOTCAMP_LEAD_URGENCIES, 'Выберите, насколько это срочно.')
  const hoursPerWeek = parseChoice(data, 'hoursPerWeek', BOOTCAMP_LEAD_HOURS, 'Выберите, сколько часов в неделю готовы уделять.')
  const links = parseLinks(data.links)

  if (data.consent !== true) throw new BootcampLeadError('Отметьте согласие на обработку персональных данных, чтобы мы могли принять заявку.', 'consent')
  const consentVersion = text(data.consentVersion) ?? ''
  if (!/^[\w.-]{1,40}$/.test(consentVersion)) throw new BootcampLeadError('Обновите страницу и отправьте заявку ещё раз: не удалось определить версию согласия.')

  const utm = data.utm && typeof data.utm === 'object' && !Array.isArray(data.utm) ? data.utm as Record<string, unknown> : {}
  const source = Object.fromEntries(BOOTCAMP_UTM_FIELDS.map(([key, field]) => [field, label(utm[key])])) as BootcampLeadSource
  source.referrerHost = referrerHost(data.referrer)

  const fillMs = Number(data.fillMs)
  if (!Number.isFinite(fillMs) || fillMs < LEAD_MIN_FILL_MS) throw new BootcampLeadError('Форма заполнена слишком быстро. Проверьте ответы и отправьте заявку ещё раз.')

  return {
    program, email, name, telegram, reason, problem, story, goal, urgency, hoursPerWeek, links,
    fillSeconds: Math.min(Math.round(fillMs / 1000), 1_000_000),
    consentVersion, source,
  }
}

export type LeadResumeKind = { extension: 'pdf' | 'docx', mimetype: string }

/** Тип определяем по содержимому: имя файла и заголовок запроса задаёт отправитель. */
export function leadResumeKind(bytes: Uint8Array): LeadResumeKind | null {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 5))
  if (head === '%PDF-') {
    // То же, что потом сверяет Payload: такой файл надо отклонить с объяснением, а не потерять после ответа «успех».
    const tail = new TextDecoder('latin1').decode(bytes.subarray(-1024))
    return tail.includes('%%EOF') && tail.includes('xref') ? { extension: 'pdf', mimetype: 'application/pdf' } : null
  }
  if (!head.startsWith('PK\x03\x04')) return null
  // Имена частей лежат в архиве открытым текстом, поэтому состав виден без распаковки. Макросы нам в резюме не нужны.
  const raw = new TextDecoder('latin1').decode(bytes)
  if (!raw.includes('[Content_Types].xml') || !raw.includes('word/document.xml') || raw.includes('vbaProject.bin')) return null
  return { extension: 'docx', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
}

/** Имя файла у кандидата: только чтобы владельцу было понятно, что это за файл. */
export function leadResumeName(name: string): string {
  return [...name.slice(0, 400)].filter((char) => !isControl(char)).join('').replace(/[\\/]/g, '_').trim().slice(0, 200)
}

/** Источник заявки одной строкой — для письма команде. */
export function describeLeadSource(source: Partial<BootcampLeadSource> | null | undefined): string {
  const utm = [source?.utmSource, source?.utmMedium, source?.utmCampaign].filter(Boolean)
  if (utm.length > 0) return utm.join(' / ')
  return source?.referrerHost ? `переход с ${source.referrerHost}` : 'прямой заход'
}

/**
 * Предзапись на буткемп с публичного лендинга: что принимает форма и в каком виде
 * это хранится. Посетитель анонимный, поэтому всё, что приходит, проверяется и
 * обрезается здесь, до записи в базу.
 */

export const BOOTCAMP_PROGRAMS = [{ value: 'nodejs', label: 'Node.js: backend сервиса проката' }] as const
export type BootcampProgram = (typeof BOOTCAMP_PROGRAMS)[number]['value']

export const BOOTCAMP_LEAD_STATUSES = [
  { value: 'new', label: 'Новая' },
  { value: 'contacted', label: 'Связались' },
  { value: 'diagnostic', label: 'Входное задание' },
  { value: 'admitted', label: 'Допущен' },
  { value: 'preparation', label: 'Нужна подготовка' },
  { value: 'rejected', label: 'Отказ' },
  { value: 'withdrawn', label: 'Отозвана' },
] as const

export const BOOTCAMP_UTM_FIELDS = [
  ['utm_source', 'utmSource'],
  ['utm_medium', 'utmMedium'],
  ['utm_campaign', 'utmCampaign'],
  ['utm_content', 'utmContent'],
  ['utm_term', 'utmTerm'],
] as const

export type BootcampLeadSource = Record<(typeof BOOTCAMP_UTM_FIELDS)[number][1] | 'referrerHost', string | null>

export type BootcampLeadInput = {
  program: BootcampProgram
  email: string
  name: string | null
  consentVersion: string
  source: BootcampLeadSource
  /** Заполнено скрытое поле, которое человек не видит: отправил робот. */
  trap: boolean
}

export class BootcampLeadError extends Error {
  readonly status = 400
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

export function parseBootcampLead(body: unknown): BootcampLeadInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BootcampLeadError('Заявка пришла в неверном формате. Обновите страницу и отправьте ещё раз.')
  const data = body as Record<string, unknown>

  const program = BOOTCAMP_PROGRAMS.find((item) => item.value === data.program)?.value
  if (!program) throw new BootcampLeadError('Такой программы нет. Обновите страницу и отправьте заявку ещё раз.')

  const email = (text(data.email) ?? '').trim().toLowerCase()
  if (!email) throw new BootcampLeadError('Укажите email.')
  if (email.length > 254 || hasControl(email) || !EMAIL.test(email)) throw new BootcampLeadError('Проверьте email: в нём должны быть @ и домен, например name@mail.ru.')

  const rawName = text(data.name)
  if (data.name !== undefined && data.name !== null && rawName === null) throw new BootcampLeadError('Имя должно быть текстом.')
  const name = rawName?.replace(/\s+/g, ' ').trim() || null
  if (name && (name.length > 100 || hasControl(name))) throw new BootcampLeadError('Имя: до 100 знаков, без служебных символов.')

  if (data.consent !== true) throw new BootcampLeadError('Отметьте согласие на обработку персональных данных, без него заявку не сохранить.')
  const consentVersion = text(data.consentVersion) ?? ''
  if (!/^[\w.-]{1,40}$/.test(consentVersion)) throw new BootcampLeadError('Обновите страницу и отправьте заявку ещё раз: не удалось определить версию согласия.')

  const utm = data.utm && typeof data.utm === 'object' && !Array.isArray(data.utm) ? data.utm as Record<string, unknown> : {}
  const source = Object.fromEntries(BOOTCAMP_UTM_FIELDS.map(([key, field]) => [field, label(utm[key])])) as BootcampLeadSource
  source.referrerHost = referrerHost(data.referrer)

  return { program, email, name, consentVersion, source, trap: typeof data.website === 'string' && data.website.trim() !== '' }
}

/** Источник заявки одной строкой — для письма команде. */
export function describeLeadSource(source: Partial<BootcampLeadSource> | null | undefined): string {
  const utm = [source?.utmSource, source?.utmMedium, source?.utmCampaign].filter(Boolean)
  if (utm.length > 0) return utm.join(' / ')
  return source?.referrerHost ? `переход с ${source.referrerHost}` : 'прямой заход'
}

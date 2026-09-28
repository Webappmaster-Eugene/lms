/**
 * Где ученик остановился в видео и с какой скоростью смотрит.
 *
 * Хранится в localStorage: это удобство конкретного браузера, а не прогресс —
 * пропажа (приватное окно, очистка данных) ничего не ломает, поэтому любые
 * сбои хранилища глотаются с предупреждением в консоль.
 */

const POSITIONS_KEY = 'lms:video-positions'
const RATE_KEY = 'lms:video-rate'
/** Сколько роликов помним: старые вытесняются, чтобы запись не росла бесконечно. */
const MAX_ENTRIES = 200

/** Видео урока досмотрено — кнопка прохождения предлагает отметить урок. */
export const VIDEO_ENDED_EVENT = 'lms:video-ended'

/** Перемотать основное видео урока: detail — { seconds }. Шлют метки времени из заметок. */
export const VIDEO_SEEK_EVENT = 'lms:video-seek'

export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const

/** Меньше этого с начала — «продолжать» нечего. */
const MIN_RESUME_SECONDS = 10
/** Ближе этого к концу — ролик досмотрен, начинаем сначала. */
const END_MARGIN_SECONDS = 15

type Positions = Record<string, { t: number; at: number }>

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function readPositions(): Positions {
  try {
    const raw = storage()?.getItem(POSITIONS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Positions) : {}
  } catch (error) {
    console.warn('Позиции видео не прочитались — начнём с начала', error)
    return {}
  }
}

function writePositions(positions: Positions) {
  try {
    storage()?.setItem(POSITIONS_KEY, JSON.stringify(positions))
  } catch (error) {
    console.warn('Позиция видео не сохранилась', error)
  }
}

export function readPosition(key: string): number | null {
  const t = readPositions()[key]?.t
  return typeof t === 'number' && Number.isFinite(t) ? t : null
}

export function savePosition(key: string, seconds: number, now = Date.now()) {
  const positions = readPositions()
  positions[key] = { t: Math.floor(seconds), at: now }
  const entries = Object.entries(positions)
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => b[1].at - a[1].at)
    writePositions(Object.fromEntries(entries.slice(0, MAX_ENTRIES)))
  } else {
    writePositions(positions)
  }
}

export function clearPosition(key: string) {
  const positions = readPositions()
  if (!(key in positions)) return
  delete positions[key]
  writePositions(positions)
}

/**
 * С какого места продолжить. null — с начала: смотрели всего пару секунд
 * или уже досмотрели. Длительность может быть неизвестна (поток MPEG-TS
 * без длительности в уроке) — тогда конец не проверяется.
 */
export function resumeTarget(saved: number | null, duration: number | null): number | null {
  if (saved === null || saved < MIN_RESUME_SECONDS) return null
  if (duration && Number.isFinite(duration) && saved > duration - END_MARGIN_SECONDS) return null
  return saved
}

export function readRate(): number {
  try {
    const value = Number(storage()?.getItem(RATE_KEY))
    return (PLAYBACK_RATES as readonly number[]).includes(value) ? value : 1
  } catch {
    return 1
  }
}

export function saveRate(rate: number) {
  try {
    storage()?.setItem(RATE_KEY, String(rate))
  } catch (error) {
    console.warn('Скорость видео не сохранилась', error)
  }
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60

  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(secs).padStart(2, '0')}`
}

/** «12:34», «1:02:05», в квадратных скобках или без — как их вставляет кнопка заметок. */
const TIMESTAMP = /\[?\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b\]?/g

export type Timestamp = { label: string; seconds: number; index: number; length: number }

export function parseTimestamps(text: string): Timestamp[] {
  const found: Timestamp[] = []
  for (const match of text.matchAll(TIMESTAMP)) {
    const [raw, h, m, sec] = match
    if (Number(sec) > 59 || (h !== undefined && Number(m) > 59)) continue
    const seconds = Number(h ?? 0) * 3600 + Number(m) * 60 + Number(sec)
    found.push({ label: formatTime(seconds), seconds, index: match.index ?? 0, length: raw.length })
  }
  return found
}

/** Уникальные метки по порядку появления — для кнопок под заметкой. */
export function uniqueTimestamps(text: string): Timestamp[] {
  const seen = new Set<number>()
  return parseTimestamps(text).filter((t) => !seen.has(t.seconds) && seen.add(t.seconds))
}

/** `?t=754` из ссылки «Мои заметки» → секунды; мусор — null. */
export function parseTimeParam(value: string | null): number | null {
  if (!value || !/^\d{1,6}$/.test(value)) return null
  return Number(value)
}

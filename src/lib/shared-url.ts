import { PLAYBACK_RATES, parseTimeParam } from '@/lib/video-memory'

export const CATALOG_PAGE_SIZE = 24
export const SHARED_TEXT_LIMIT = 160

export function boundedQueryText(value: string | null, limit = SHARED_TEXT_LIMIT): string {
  return [...(value ?? '')].filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join('').slice(0, limit)
}

export function positiveQueryInteger(value: string | null, fallback = 1, maximum = 10_000): number {
  if (!value || !/^\d{1,5}$/.test(value)) return fallback
  const number = Number(value)
  return number > 0 && number <= maximum ? number : fallback
}

export function sharedVideoId(value: string | null): string | null {
  return value && /^[a-zA-Z0-9:_-]{1,160}$/.test(value) ? value : null
}

export function sharedPlaybackRate(value: string | null): number | null {
  if (!value || !/^(?:0\.75|1|1\.25|1\.5|1\.75|2)$/.test(value)) return null
  const rate = Number(value)
  return (PLAYBACK_RATES as readonly number[]).includes(rate) ? rate : null
}

/** Keep unrelated parameters while editing a filter; sharing uses a stricter allowlist. */
export function queryHref(pathname: string, current: string, changes: Record<string, string | null>): string {
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
  }
  return `${pathname}${next.size ? `?${next}` : ''}`
}

/** Only navigation settings are shared, never API capabilities or authentication data. */
export function shareableURL(href: string, origin: string): string {
  const url = new URL(href, origin)
  if (url.origin !== new URL(origin).origin || url.username || url.password || href.length > 8192 || /^\/(?:api|admin|manage|login|forgot-password|reset-password|invite)(?:\/|$)/.test(url.pathname)) {
    throw new Error('Эту ссылку нельзя отправить как ссылку на обучение')
  }
  const source = url.searchParams
  const safe = new URLSearchParams()
  const text = (key: string, limit = SHARED_TEXT_LIMIT) => {
    const value = boundedQueryText(source.get(key), limit)
    if (value && !/(?:https?:\/\/|\/api\/|token=|password=)/i.test(value)) safe.set(key, value)
  }
  const choice = (key: string, options: readonly string[]) => {
    const value = source.get(key)
    if (value && options.includes(value)) safe.set(key, value)
  }
  if (url.pathname === '/courses') {
    text('q'); text('roadmap')
    choice('status', ['all', 'active', 'new', 'done'])
    choice('assigned', ['1'])
    choice('sort', ['program', 'title', 'progress'])
    const page = positiveQueryInteger(source.get('page'))
    if (page > 1) safe.set('page', String(page))
  } else if (/^\/roadmaps\/[^/]+$/.test(url.pathname)) {
    text('q')
    choice('view', ['map', 'list'])
    const topic = sharedVideoId(source.get('topic'))
    if (topic) safe.set('topic', topic)
  } else if (/^\/lessons\/[^/]+$/.test(url.pathname)) {
    const video = sharedVideoId(source.get('video'))
    const time = parseTimeParam(source.get('t'))
    const rate = sharedPlaybackRate(source.get('rate'))
    if (video) safe.set('video', video)
    if (time !== null) safe.set('t', String(time))
    if (rate !== null) safe.set('rate', String(rate))
  } else if (url.pathname === '/trainer/tasks') {
    for (const key of ['q', 'language', 'difficulty', 'tag', 'company', 'topic', 'status']) text(key)
  } else if (/^\/trainer\/[^/]+\/[^/]+$/.test(url.pathname)) {
    choice('lang', ['js', 'ts'])
  }
  url.search = safe.toString()
  url.hash = ''
  return url.toString()
}

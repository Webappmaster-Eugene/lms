/**
 * Черновики вопросов и ответов: недописанный текст переживает переход на другую
 * страницу и перезагрузку. Хранится в localStorage - это удобство конкретного
 * браузера: без хранилища (приватное окно, запрет) поле просто работает без
 * черновика, поэтому сбои только пишутся в консоль.
 */

const KEY = 'lms:message-drafts'
/** Старые черновики вытесняются, чтобы запись не росла бесконечно. */
const MAX_DRAFTS = 50
const MAX_AGE_MS = 30 * 86_400_000

type Drafts = Record<string, { text: string; at: number }>

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function readAll(): Drafts {
  try {
    const raw = storage()?.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Drafts) : {}
  } catch (error) {
    console.warn('Черновики сообщений не прочитались', error)
    return {}
  }
}

const isFresh = (draft: Drafts[string] | undefined, now: number): draft is Drafts[string] =>
  Boolean(draft) && typeof draft?.text === 'string' && typeof draft.at === 'number' && now - draft.at < MAX_AGE_MS

export function readDraft(key: string, now = Date.now()): string {
  const draft = readAll()[key]
  return isFresh(draft, now) ? draft.text : ''
}

/** Пустой текст стирает черновик. */
export function saveDraft(key: string, text: string, now = Date.now()) {
  const drafts = readAll()
  if (text.trim()) drafts[key] = { text, at: now }
  else if (key in drafts) delete drafts[key]
  else return
  const kept = Object.entries(drafts)
    .filter(([, draft]) => isFresh(draft, now))
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_DRAFTS)
  try {
    storage()?.setItem(KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch (error) {
    console.warn('Черновик сообщения не сохранился', error)
  }
}

export const clearDraft = (key: string) => saveDraft(key, '')

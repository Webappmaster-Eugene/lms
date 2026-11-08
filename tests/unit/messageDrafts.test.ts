import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearDraft, readDraft, saveDraft } from '@/lib/message-drafts'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

let localStorage: Storage

/** Черновик вопроса переживает уход со страницы и не копится бесконечно. */
describe('черновики сообщений', () => {
  beforeEach(() => {
    localStorage = memoryStorage()
    vi.stubGlobal('window', { localStorage })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('сохраняется по ключу и стирается пустым текстом', () => {
    saveDraft('7:lesson:1', 'Почему так?')
    saveDraft('7:lesson:2', 'Другой урок')

    expect(readDraft('7:lesson:1')).toBe('Почему так?')
    clearDraft('7:lesson:1')
    expect(readDraft('7:lesson:1')).toBe('')
    expect(readDraft('7:lesson:2')).toBe('Другой урок')
  })

  it('пробелы черновиком не считаются', () => {
    saveDraft('7:lesson:1', '   ')

    expect(localStorage.length).toBe(0)
  })

  it('старше месяца черновик забывается', () => {
    const now = Date.UTC(2026, 10, 8)
    saveDraft('7:lesson:1', 'Старый', now - 31 * 86_400_000)

    expect(readDraft('7:lesson:1', now)).toBe('')
  })

  it('хранится не больше 50 черновиков, вытесняются самые старые', () => {
    for (let i = 0; i < 55; i += 1) saveDraft(`k${i}`, `текст ${i}`, 1_000_000 + i)

    expect(readDraft('k0', 1_000_100)).toBe('')
    expect(readDraft('k54', 1_000_100)).toBe('текст 54')
    expect(Object.keys(JSON.parse(localStorage.getItem('lms:message-drafts') ?? '{}'))).toHaveLength(50)
  })

  it('испорченная запись и отказ хранилища не ломают поле', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem('lms:message-drafts', '{не json')
    expect(readDraft('k')).toBe('')

    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    expect(() => saveDraft('k', 'текст')).not.toThrow()
    expect(warn).toHaveBeenCalledWith('Черновик сообщения не сохранился', expect.any(Error))
  })
})

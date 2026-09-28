import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPosition,
  formatTime,
  readPosition,
  readRate,
  resumeTarget,
  savePosition,
  saveRate,
} from '@/lib/video-memory'

/** Место остановки в видео и скорость: удобство браузера, сбой хранилища не должен ломать плеер. */

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

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: memoryStorage() })
})

describe('с какого места продолжить', () => {
  it('первые секунды — с начала', () => {
    expect(resumeTarget(null, 600)).toBeNull()
    expect(resumeTarget(5, 600)).toBeNull()
  })

  it('середина ролика — с неё', () => {
    expect(resumeTarget(300, 600)).toBe(300)
  })

  it('досмотренный ролик — с начала', () => {
    expect(resumeTarget(590, 600)).toBeNull()
  })

  it('без длительности конец не проверяется', () => {
    expect(resumeTarget(5000, null)).toBe(5000)
    expect(resumeTarget(5000, Number.POSITIVE_INFINITY)).toBe(5000)
  })
})

describe('позиции', () => {
  it('сохраняются по ролику и стираются', () => {
    savePosition('a', 125.7)
    savePosition('b', 40)
    expect(readPosition('a')).toBe(125)
    clearPosition('a')
    expect(readPosition('a')).toBeNull()
    expect(readPosition('b')).toBe(40)
  })

  it('помним не больше 200 роликов — вытесняются самые давние', () => {
    for (let i = 0; i < 201; i++) savePosition(`v${i}`, 60, 1000 + i)
    expect(readPosition('v0')).toBeNull()
    expect(readPosition('v200')).toBe(60)
  })

  it('испорченная запись не роняет плеер', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.localStorage.setItem('lms:video-positions', '{битый')
    expect(readPosition('a')).toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  it('недоступное хранилище не роняет плеер', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    expect(() => savePosition('a', 60)).not.toThrow()
    expect(readPosition('a')).toBeNull()
    expect(readRate()).toBe(1)
  })
})

describe('скорость', () => {
  it('запоминается', () => {
    saveRate(1.5)
    expect(readRate()).toBe(1.5)
  })

  it('чужое значение не принимается', () => {
    window.localStorage.setItem('lms:video-rate', '16')
    expect(readRate()).toBe(1)
  })
})

describe('формат времени', () => {
  it.each([
    [0, '0:00'],
    [65, '1:05'],
    [3725, '1:02:05'],
    [Number.NaN, '0:00'],
  ])('%s → %s', (seconds, expected) => {
    expect(formatTime(seconds)).toBe(expected)
  })
})

describe('метки времени в заметках', () => {
  it('находит метки со скобками и без, с часами', async () => {
    const { parseTimestamps } = await import('@/lib/video-memory')
    expect(parseTimestamps('[12:34] хуки, потом 1:02:05 и 0:07').map((t) => [t.label, t.seconds])).toEqual([
      ['12:34', 754],
      ['1:02:05', 3725],
      ['0:07', 7],
    ])
  })

  it('позиция и длина метки — для подсветки в тексте', async () => {
    const { parseTimestamps } = await import('@/lib/video-memory')
    const [t] = parseTimestamps('см. [2:05] тут')
    expect('см. [2:05] тут'.slice(t.index, t.index + t.length)).toBe('[2:05]')
  })

  it('не метки: 12:75, счёт 3:1, время без секунд', async () => {
    const { parseTimestamps } = await import('@/lib/video-memory')
    expect(parseTimestamps('12:75 и счёт 3:1')).toEqual([])
  })

  it('повторы убираются для кнопок', async () => {
    const { uniqueTimestamps } = await import('@/lib/video-memory')
    expect(uniqueTimestamps('[1:00] и снова 1:00, потом 2:00').map((t) => t.label)).toEqual(['1:00', '2:00'])
  })

  it('?t= из ссылки — только целые секунды', async () => {
    const { parseTimeParam } = await import('@/lib/video-memory')
    expect(parseTimeParam('754')).toBe(754)
    expect(parseTimeParam(null)).toBeNull()
    expect(parseTimeParam('12:34')).toBeNull()
    expect(parseTimeParam('-5')).toBeNull()
  })
})

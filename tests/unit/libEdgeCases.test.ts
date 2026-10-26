import { afterEach, describe, expect, it, vi } from 'vitest'

import { redactUrlPath } from '@/lib/error-reporting/redact'
import { isGuideCalloutType } from '@/lib/guide-markdown'
import { lessonHashTarget, lessonMarkdownOutline } from '@/lib/lesson-markdown'
import { mediaFilePath } from '@/lib/lesson-video-source'
import { pushEndpoint, safeNotificationLink } from '@/lib/notification-policy'
import { slideFileName } from '@/lib/slides'
import { readRate, saveRate, savePosition } from '@/lib/video-memory'
import { Guides } from '@/payload/collections/Guides'

/** Испорченный ввод в небольших библиотеках: битое %-кодирование, неразбираемые адреса, сбои хранилища. */
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('адреса, которые не разбираются', () => {
  it('битый абсолютный адрес в отчёте об ошибке теряет query и не выдаёт токен', () => {
    const redacted = redactUrlPath('https://[broken/reset-password?token=abc123')
    expect(redacted).not.toContain('abc123')
    expect(redacted).not.toContain('?')
  })

  it('ссылка уведомления с битым %-кодированием ведёт в список уведомлений', () => {
    expect(safeNotificationLink('/lessons/%E0%A4%A')).toBe('/notifications')
  })

  it('не адрес вместо подписки push — отказ', () => {
    expect(pushEndpoint('not a url')).toBeNull()
  })

  it('битый адрес видео не считается файлом медиатеки', () => {
    expect(mediaFilePath('http://[broken/api/media/file/a.mp4')).toBeNull()
  })

  it('имя файла презентации с битым %-кодированием не возвращается', () => {
    expect(slideFileName('/api/media/file/%E0%A4%A.png')).toBeNull()
  })
})

describe('Markdown урока', () => {
  it('подзаголовок до первого раздела попадает в оглавление верхним уровнем', () => {
    const outline = lessonMarkdownOutline('### Вступление\n\nТекст\n\n## Раздел\n\n### Деталь\n')
    expect(outline.contents.map((item) => [item.title, item.children.map((child) => child.title)])).toEqual([
      ['Вступление', []],
      ['Раздел', ['Деталь']],
    ])
  })

  it('ссылка #… с битым %-кодированием остаётся как есть', () => {
    expect(lessonHashTarget('#%E0%A4%A', lessonMarkdownOutline('## Раздел\n'))).toBe('#%E0%A4%A')
  })

  it('тип выноски гайда — только из известного списка', () => {
    expect(isGuideCalloutType('constructor')).toBe(false)
    expect(isGuideCalloutType(1)).toBe(false)
  })
})

describe('память видео при сбоях localStorage', () => {
  function brokenStorage() {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal('window', { localStorage: {
      getItem: () => { throw new DOMException('denied', 'SecurityError') },
      setItem: () => { throw new DOMException('full', 'QuotaExceededError') },
    } })
    return warn
  }

  it('переполненное хранилище: позиция и скорость не сохраняются, но и не роняют плеер', () => {
    const warn = brokenStorage()
    expect(() => savePosition('lesson-1:video', 120)).not.toThrow()
    expect(() => saveRate(1.5)).not.toThrow()
    expect(warn).toHaveBeenCalledWith('Скорость видео не сохранилась', expect.any(DOMException))
    expect(warn.mock.calls.map(([message]) => message)).toContain('Позиция видео не сохранилась')
  })

  it('недоступное хранилище: скорость по умолчанию 1', () => {
    brokenStorage()
    expect(readRate()).toBe(1)
  })
})

describe('предпросмотр гайда в админке', () => {
  const preview = Guides.admin?.preview as (doc: Record<string, unknown>) => string | null

  it('ведёт на страницу гайда с закодированным slug, без slug — предпросмотра нет', () => {
    expect(preview({ slug: 'ии в работе' })).toBe(`/guides/${encodeURIComponent('ии в работе')}`)
    expect(preview({ slug: '' })).toBeNull()
    expect(preview({})).toBeNull()
  })
})

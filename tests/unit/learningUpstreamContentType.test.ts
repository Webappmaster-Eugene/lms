import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { upstreamLearningMedia } from '@/server/learning-upstream'

const { resolveHref, invalidateHref } = vi.hoisted(() => ({ resolveHref: vi.fn(), invalidateHref: vi.fn() }))
vi.mock('@/lib/yandex-disk-href', () => ({ resolveHref, invalidateHref }))
const observability = vi.hoisted(() => ({ recordLearningAccess: vi.fn() }))
vi.mock('@/lib/learning-observability', () => observability)

const upstream = vi.fn()
// Квота потоков общая на процесс: каждому тесту свой зритель, чтобы лимиты не пересекались.
let viewerId = 70_000
const ref = (path: string) => ({ publicKey: 'https://disk.yandex.ru/d/content-type-fixture', path })

beforeEach(() => {
  viewerId += 1
  vi.clearAllMocks()
  resolveHref.mockResolvedValue('https://downloader.disk.yandex.ru/disk/fixture/file')
  vi.stubGlobal('fetch', upstream)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('тип содержимого учебного файла из хранилища', () => {
  // Хранилище иногда отвечает text/html: с нашего домена такой ответ выполнился бы с сессией ученика.
  it.each([
    ['/lesson.webm', 'video', 'video/webm', 'inline'],
    ['/lesson.m4v', 'video', 'video/mp4', 'inline'],
    ['/notes.pdf', 'asset', 'application/pdf', "attachment; filename*=UTF-8''notes.pdf"],
    ['/sources.zip', 'asset', 'application/zip', "attachment; filename*=UTF-8''sources.zip"],
    ['/slides.key', 'asset', 'application/octet-stream', "attachment; filename*=UTF-8''slides.key"],
  ] as const)('%s при активном ответе хранилища отдаётся как %s → %s', async (path, kind, type, disposition) => {
    upstream.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': '3' } }))
    const response = await upstreamLearningMedia(new Request('https://lms.test/api/learning-assets'), viewerId, ref(path), kind)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe(type)
    expect(response.headers.get('Content-Disposition')).toBe(disposition)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3])
  })

  it('безопасный тип хранилища сохраняется, если он из разрешённого списка', async () => {
    upstream.mockResolvedValue(new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'image/webp' } }))
    const response = await upstreamLearningMedia(new Request('https://lms.test/api/learning-assets'), viewerId, ref('/picture.bin'), 'asset')
    expect(response.headers.get('Content-Type')).toBe('image/webp')
    // Встраивание с нашего домена разрешено только видео; остальное — скачивание.
    expect(response.headers.get('Content-Disposition')).toBe("attachment; filename*=UTF-8''picture.bin")
    await response.arrayBuffer()
  })

  it('без пути имя файла берётся из публичной ссылки', async () => {
    upstream.mockResolvedValue(new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'text/html' } }))
    const response = await upstreamLearningMedia(new Request('https://lms.test/api/learning-assets'), viewerId, { publicKey: 'https://disk.yandex.ru/i/handout.pdf', path: null }, 'asset')
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    await response.arrayBuffer()
  })

  it.each(['bytes=-', 'bytes=0-1,4-5', 'items=0-1', `bytes=0-${'9'.repeat(120)}`])('некорректный Range %s — 416 до обращения к Диску и без занятого слота', async (range) => {
    const response = await upstreamLearningMedia(new Request('https://lms.test/api/learning-assets', { headers: { Range: range } }), viewerId, ref('/lesson.mp4'))
    expect(response.status).toBe(416)
    expect(await response.json()).toEqual({ error: 'Некорректный диапазон файла' })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(resolveHref).not.toHaveBeenCalled()
    expect(upstream).not.toHaveBeenCalled()
    expect(observability.recordLearningAccess).toHaveBeenCalledWith({ resource: 'media', outcome: 'deny', reason: 'invalid_range', userId: viewerId })
    // Слот освобождён: зритель может открыть шесть потоков подряд.
    upstream.mockImplementation(async () => new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'video/mp4' } }))
    const opened = await Promise.all(Array.from({ length: 6 }, () => upstreamLearningMedia(new Request('https://lms.test/api/learning-assets'), viewerId, ref('/lesson.mp4'))))
    expect(opened.map((item) => item.status)).toEqual([200, 200, 200, 200, 200, 200])
    await Promise.all(opened.map((item) => item.arrayBuffer()))
  })
})

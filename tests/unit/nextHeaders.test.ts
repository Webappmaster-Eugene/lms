import { describe, expect, it } from 'vitest'
import { tryToParsePath } from 'next/dist/lib/try-to-parse-path'
import type { Header } from 'next/dist/lib/load-custom-routes'

import config from '../../next.config.mjs'

function headersFor(rules: Header[], pathname: string): Headers {
  const result = new Headers()
  for (const rule of rules) {
    const parsed = tryToParsePath(rule.source)
    if (!parsed.regexStr) throw new Error(`Некорректный маршрут заголовков: ${rule.source}`)
    if (new RegExp(parsed.regexStr).test(pathname)) {
      for (const { key, value } of rule.headers) result.set(key, value)
    }
  }
  return result
}

describe('итоговые HTTP-заголовки Next + Payload', () => {
  it('подсказка темы запрашивается только админкой, без потери security/cache и остальных SDK-заголовков', async () => {
    const rules = await config.headers()
    const publicRoutes = [
      '/', '/login', '/courses', '/roadmaps/go', '/trainer/go-programming/go-sum-json',
      '/profile/edit', '/settings/app', '/settings/notifications', '/api/health', '/api/trainer/submit',
      '/api/media/file/avatar.png', '/sw.js', '/monaco/vs/editor/editor.main.js', '/monaco/react-types.json',
      '/fonts/inter/latin.woff2', '/_next/static/chunks/page.js', '/images/pwa/icon-192.png',
      '/administrator', '/admin-api',
    ]
    const hintKeys = ['Accept-CH', 'Critical-CH', 'Vary']
    for (const path of publicRoutes) {
      const headers = headersFor(rules, path)
      expect(headers.get('Accept-CH'), path).toBeNull()
      expect(headers.get('Critical-CH'), path).toBeNull()
      expect(headers.get('Vary') ?? '', path).not.toContain('Sec-CH-Prefers-Color-Scheme')
      expect(headers.get('X-Powered-By'), path).toBe('Next.js, Payload')
      expect(headers.get('X-Robots-Tag'), path).toBe('noindex, nofollow')
    }
    for (const path of ['/admin', '/admin/', '/admin/login', '/admin/collections/users/3', '/admin/roadmap-editor/7']) {
      const headers = headersFor(rules, path)
      for (const key of hintKeys) expect(headers.get(key), `${path}: ${key}`).toBe('Sec-CH-Prefers-Color-Scheme')
      expect(headers.get('X-Powered-By'), path).toBe('Next.js, Payload')
      expect(headers.get('Content-Security-Policy'), path).toBe("frame-ancestors 'none'")
      expect(headers.get('X-Frame-Options'), path).toBe('DENY')
      expect(headers.get('X-Content-Type-Options'), path).toBe('nosniff')
    }
    const publicHeaders = headersFor(rules, '/trainer/go-programming/go-sum-json')
    expect(publicHeaders.get('Content-Security-Policy')).toBe([
      "default-src 'self'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'", "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:", "font-src 'self' data:",
      "frame-src 'self' https://miro.com https://www.youtube.com https://youtube.com",
      "connect-src 'self'", "media-src 'self' https: blob:", "worker-src 'self' blob:",
    ].join('; '))
    expect(publicHeaders.get('X-Frame-Options')).toBe('DENY')
    expect(publicHeaders.get('X-Content-Type-Options')).toBe('nosniff')
    expect(publicHeaders.get('Referrer-Policy')).toBe('no-referrer')
    const media = headersFor(rules, '/api/media/file/avatar.png')
    expect(media.get('Cache-Control')).toBe('private, no-store')
    expect(media.get('Vary')).toBe('Cookie, Authorization')
    expect(media.get('X-Content-Type-Options')).toBe('nosniff')
    const worker = headersFor(rules, '/sw.js')
    expect(worker.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
    expect(worker.get('Service-Worker-Allowed')).toBe('/')
    expect(headersFor(rules, '/monaco/vs/editor/editor.main.js').get('Cache-Control')).toBe('public, max-age=3600, must-revalidate')
    expect(headersFor(rules, '/monaco/react-types.json').get('Cache-Control')).toBe('public, max-age=3600, must-revalidate')
    expect(headersFor(rules, '/fonts/inter/latin.woff2').get('Cache-Control')).toBe('public, max-age=31536000, immutable')
  })
})

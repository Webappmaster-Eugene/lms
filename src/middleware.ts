import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { PUBLIC_FONT_PATHS } from '@/lib/public-fonts'

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/admin', '/api']

const STATIC_PREFIXES = ['/_next', '/images', '/monaco']

/**
 * Файлы перечислены поимённо, а не определяются по расширению: слаги приходят
 * из CMS, и `/courses/next.js` неотличим от статики по суффиксу.
 */
const STATIC_FILES = new Set([
  ...PUBLIC_FONT_PATHS,
  '/favicon.ico',
  '/icon.svg',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline.html',
  '/robots.txt',
  '/sitemap.xml',
])

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Пропускаем публичные маршруты
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Пропускаем статические файлы
  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || STATIC_FILES.has(pathname)) {
    return NextResponse.next()
  }

  // Проверяем наличие payload-token cookie
  const token = request.cookies.get('payload-token')

  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

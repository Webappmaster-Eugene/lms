import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ADMIN_RETURN_PATH_HEADER } from '@/lib/admin-login-redirect'
import { PUBLIC_FONT_PATHS } from '@/lib/public-fonts'

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/unsubscribe', '/admin', '/api']

const STATIC_PREFIXES = ['/_next', '/images', '/monaco', '/mermaid/']

/**
 * Файлы перечислены поимённо, а не определяются по расширению: слаги приходят
 * из CMS, и `/courses/next.js` неотличим от статики по суффиксу.
 */
const STATIC_FILES = new Set([
  ...PUBLIC_FONT_PATHS,
  '/favicon.ico',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline.html',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
])

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/')

  const forward = () => {
    if (!isAdminPath && !request.headers.has(ADMIN_RETURN_PATH_HEADER)) return NextResponse.next()

    const headers = new Headers(request.headers)
    if (isAdminPath) headers.set(ADMIN_RETURN_PATH_HEADER, pathname + search)
    else headers.delete(ADMIN_RETURN_PATH_HEADER)
    return NextResponse.next({ request: { headers } })
  }

  // Пропускаем публичные маршруты
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return forward()
  }

  // Пропускаем статические файлы
  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || STATIC_FILES.has(pathname)) {
    return forward()
  }

  // Коллекция сама отбирает публичные гайды; личные данные остаются за access Payload.
  if (pathname === '/guides' || /^\/guides\/[^/]+(?:\/download)?\/?$/.test(pathname)) {
    return forward()
  }

  // Входное задание кандидата: доступ даёт личная ссылка из письма, аккаунта у него ещё нет.
  if (/^\/entry-task\/[^/]+(?:\/download)?\/?$/.test(pathname)) {
    return forward()
  }

  // Оплата буткемпа: личная ссылка из письма о допуске и страницы возврата из Робокассы (/pay/done, /pay/fail).
  if (/^\/pay\/[^/]+\/?$/.test(pathname)) {
    return forward()
  }

  // Проверяем наличие payload-token cookie
  const token = request.cookies.get('payload-token')

  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname + search)
    return NextResponse.redirect(loginUrl)
  }

  return forward()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

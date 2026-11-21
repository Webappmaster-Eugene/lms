import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'

import { config, middleware } from '@/middleware'
import { ADMIN_RETURN_PATH_HEADER, adminLoginHref } from '@/lib/admin-login-redirect'
import { PUBLIC_FONT_PATHS } from '@/lib/public-fonts'

const ORIGIN = 'https://learn.mentorcareer.ru'

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(new URL(path, ORIGIN), {
    headers: cookie ? { cookie } : undefined,
  })
}

/** `NextResponse.next()` не ставит Location; редирект — ставит. */
function isRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400
}

describe('закрытые страницы без авторизации', () => {
  it.each(['/', '/profile', '/courses', '/lessons/intro', '/trainer', '/certificates'])(
    '%s уводит на логин',
    (path) => {
      const response = middleware(request(path))

      expect(isRedirect(response)).toBe(true)
      expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/login')
    },
  )

  it('исходный путь сохраняется в параметре redirect', () => {
    const response = middleware(request('/lessons/react-hooks'))
    const location = new URL(response.headers.get('location') ?? '')

    expect(location.searchParams.get('redirect')).toBe('/lessons/react-hooks')
  })

  it.each(['/lessons/react-hooks?video=clip-2&t=373&rate=1.5', '/courses?q=Next.js&roadmap=frontend&status=active&page=2'])('сохраняет все параметры общей ссылки %s после входа', (path) => {
    const response = middleware(request(path))
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.searchParams.get('redirect')).toBe(path)
    expect(location.origin).toBe(ORIGIN)
  })
})

describe('публичные пути', () => {
  it.each([
    ['/login', 'иначе вход уходит в бесконечный редирект сам на себя'],
    ['/forgot-password', 'восстановление пароля нужно именно тому, кто не вошёл'],
    ['/reset-password', 'переход по ссылке из письма происходит без сессии'],
    ['/unsubscribe', 'отписка от рассылки открывается из письма на устройстве без сессии'],
    ['/admin', 'у админки Payload собственная авторизация'],
    ['/api/health', 'healthcheck контейнера ходит без куки'],
    ['/api/trainer/submit', 'роут сам проверяет payload.auth()'],
  ])('%s пропускается: %s', (path) => {
    expect(isRedirect(middleware(request(path)))).toBe(false)
  })

  it('вложенные пути передаются авторизации Payload', () => {
    expect(isRedirect(middleware(request('/admin/collections/courses')))).toBe(false)
  })
})

describe('адрес возврата в админку', () => {
  it('передаёт исходный путь с фильтрами и заменяет одноимённый заголовок клиента', () => {
    const path = '/admin/student-analytics?user=123&filter=learning'
    const incoming = request(path)
    incoming.headers.set(ADMIN_RETURN_PATH_HEADER, '/admin/bootcamp-progress')

    const response = middleware(incoming)
    expect(response.headers.get(`x-middleware-request-${ADMIN_RETURN_PATH_HEADER}`)).toBe(path)
  })

  it('удаляет заголовок клиента за пределами админки', () => {
    const incoming = request('/profile', 'payload-token=abc.def.ghi')
    incoming.headers.set(ADMIN_RETURN_PATH_HEADER, '/admin/bootcamp-progress')

    const response = middleware(incoming)
    expect(response.headers.get('x-middleware-override-headers')?.split(',')).not.toContain(ADMIN_RETURN_PATH_HEADER)
    expect(response.headers.has(`x-middleware-request-${ADMIN_RETURN_PATH_HEADER}`)).toBe(false)
  })

  it('кодирует адрес возврата как один параметр формы входа', () => {
    const path = '/admin/learning-access?user=123&q=A%2BB&tag=x&tag=y'
    const href = adminLoginHref(new Headers({ [ADMIN_RETURN_PATH_HEADER]: path }), '/admin/login')
    const login = new URL(href, ORIGIN)

    expect(login.pathname).toBe('/admin/login')
    expect([...login.searchParams]).toEqual([['redirect', path]])
  })

  it.each(['', '//other.example/admin', '/administrator', '/admin/%2e%2e/profile'])(
    'использует обычный вход без адреса возврата для %j',
    (path) => {
      expect(adminLoginHref(new Headers({ [ADMIN_RETURN_PATH_HEADER]: path }), '/login')).toBe('/login')
    },
  )
})

describe('статика', () => {
  it.each(PUBLIC_FONT_PATHS)('%s доступен до входа', (path) => {
    expect(isRedirect(middleware(request(path)))).toBe(false)
  })

  it('не считает любой файл из /fonts публичным по расширению', () => {
    expect(isRedirect(middleware(request('/fonts/inter/private.woff2')))).toBe(true)
  })
  it.each(['/_next/static/chunk.js', '/images/logo.png', '/images/og.png', '/favicon.ico', '/images/pwa/icon-32.png', '/llms.txt'])(
    '%s отдаётся без проверки',
    (path) => {
      expect(isRedirect(middleware(request(path)))).toBe(false)
    },
  )
})

describe('с сессионной кукой', () => {
  it('пользователь с payload-token проходит на закрытую страницу', () => {
    expect(isRedirect(middleware(request('/profile', 'payload-token=abc.def.ghi')))).toBe(false)
  })

  it('посторонняя кука за сессию не считается', () => {
    expect(isRedirect(middleware(request('/profile', 'theme=dark')))).toBe(true)
  })
})

describe('matcher', () => {
  it('исключает статику и фавикон из обработки', () => {
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image|favicon.ico).*)'])
  })
})

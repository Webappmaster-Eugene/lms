import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'

import { config, middleware } from '@/middleware'

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
})

describe('публичные пути', () => {
  it.each([
    ['/login', 'иначе вход уходит в бесконечный редирект сам на себя'],
    ['/forgot-password', 'восстановление пароля нужно именно тому, кто не вошёл'],
    ['/reset-password', 'переход по ссылке из письма происходит без сессии'],
    ['/admin', 'у админки Payload собственная авторизация'],
    ['/api/health', 'healthcheck контейнера ходит без куки'],
    ['/api/trainer/submit', 'роут сам проверяет payload.auth()'],
  ])('%s пропускается: %s', (path) => {
    expect(isRedirect(middleware(request(path)))).toBe(false)
  })

  it('проверка идёт по префиксу — вложенные пути админки тоже публичны', () => {
    expect(isRedirect(middleware(request('/admin/collections/courses')))).toBe(false)
  })
})

describe('статика', () => {
  it.each(['/_next/static/chunk.js', '/images/logo.png', '/favicon.ico', '/icon.svg'])(
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

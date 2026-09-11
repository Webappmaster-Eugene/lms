import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'

import { config, middleware } from '@/middleware'

/**
 * Middleware — единственное, что закрывает страницы приложения от неавторизованного
 * посетителя. Ошибка в списке публичных путей проявляется одним из двух способов,
 * и оба плохи: либо `/profile` открывается кому угодно, либо в бесконечный редирект
 * уходит сама страница логина.
 *
 * Отдельно проверяется, что в `redirect` кладётся исходный путь: без него после
 * входа пользователь всегда попадает на главную, и ссылка на конкретный урок,
 * присланная в чате, каждый раз теряется.
 */

const ORIGIN = 'https://lms.nadtocheev.ru'

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
    ['/api/trainer-progress', 'роут сам проверяет payload.auth()'],
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
    // Проверяется наличие именно payload-token: любая другая кука (аналитика,
    // тема оформления) не должна открывать доступ.
    expect(isRedirect(middleware(request('/profile', 'theme=dark')))).toBe(true)
  })
})

describe('matcher', () => {
  it('исключает статику и фавикон из обработки', () => {
    // Прогонять через middleware каждый чанк — лишняя работа на каждый запрос.
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image|favicon.ico).*)'])
  })
})

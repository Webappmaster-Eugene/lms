import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Заголовки безопасности из next.config.mjs.
 *
 * Ошибка тут двусторонняя. Слишком широкий CSP тихо перестаёт защищать. Слишком
 * узкий — ломает контент: видео и доски встраиваются через iframe, и запрещённый
 * источник даёт пустую рамку на странице урока без единого сообщения в интерфейсе.
 * Разойтись эти два файла могут легко: домен для встраивания добавляют в компонент
 * плеера, а про заголовок вспоминают в лучшем случае потом.
 *
 * Второй сюжет — область действия заголовков. X-Frame-Options: DENY, случайно
 * распространённый на /admin, ломает админку Payload, которая рисует часть
 * интерфейса во вложенных фреймах.
 */

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

const NEXT_CONFIG = read('../../next.config.mjs')
const VIDEO_PLAYER = read('../../src/components/lesson/VideoPlayer.tsx')

/** Содержимое директивы CSP, например frame-src. */
function directive(name: string): string {
  const match = NEXT_CONFIG.match(new RegExp(`"${name} ([^"]*)"`))
  expect(match, `в CSP нет директивы ${name}`).not.toBeNull()
  return match![1]
}

describe('область действия заголовков', () => {
  it('админка и API исключены из общего набора заголовков', () => {
    // Отрицательный lookahead в source: если убрать admin из исключений,
    // X-Frame-Options: DENY сломает интерфейс Payload.
    const source = NEXT_CONFIG.match(/source:\s*'([^']+)'/)?.[1]
    expect(source).toBe('/((?!admin|api).*)')
  })
})

describe('базовые заголовки', () => {
  it.each([
    ['X-Frame-Options', 'DENY'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ])('%s = %s', (key, value) => {
    expect(NEXT_CONFIG).toMatch(new RegExp(`key: '${key}',[\\s\\S]{0,80}value: '${value}'`))
  })
})

describe('CSP: что разрешено', () => {
  it('по умолчанию только собственный источник', () => {
    expect(directive('default-src')).toBe("'self'")
  })

  it('сетевые запросы ограничены собственным источником', () => {
    // Расширение connect-src — обычный способ незаметно открыть канал для утечки.
    expect(directive('connect-src')).toBe("'self'")
  })

  it('frame-src перечисляет источники поимённо, без разрешения всего подряд', () => {
    const sources = directive('frame-src').split(/\s+/).filter(Boolean)

    // `*` и голая схема `https:` разрешают встраивание любого сайта — то есть
    // отменяют смысл директивы. Каждый источник должен быть конкретным доменом.
    expect(sources).not.toContain('*')
    expect(sources).not.toContain('https:')
    expect(sources.every((s) => /^https:\/\/[a-z0-9.-]+$/.test(s))).toBe(true)
    expect(sources.length).toBeGreaterThan(2)
  })
})

describe('CSP и встраиваемый контент не разошлись', () => {
  it('домены, на которые VideoPlayer строит embed-ссылки, разрешены в frame-src', () => {
    // VideoPlayer переписывает ссылку в youtube.com/embed/... и в disk.yandex.*
    // с параметром iframe=1. Не разрешённый здесь домен даёт пустой плеер.
    const frameSrc = directive('frame-src')

    expect(VIDEO_PLAYER).toContain('https://www.youtube.com/embed/')
    expect(frameSrc).toContain('https://www.youtube.com')

    expect(VIDEO_PLAYER).toContain('disk.yandex')
    expect(frameSrc).toMatch(/https:\/\/disk\.yandex\.(ru|com)/)
  })

  it('оба домена Яндекс.Диска разрешены — ссылки встречаются и .ru, и .com', () => {
    const frameSrc = directive('frame-src')
    expect(frameSrc).toContain('https://disk.yandex.ru')
    expect(frameSrc).toContain('https://disk.yandex.com')
  })

  it('miro разрешён — блок MiroBlock встраивает доски через iframe', () => {
    expect(read('../../src/payload/blocks/MiroBlock.ts')).toContain('miro.com')
    expect(directive('frame-src')).toContain('https://miro.com')
  })

  it('media-src допускает внешние источники — видео отдаются по прямым ссылкам', () => {
    expect(directive('media-src')).toContain('https:')
  })
})

describe('песочница встроенных фреймов', () => {
  it('исполнение кода тренажёра изолировано sandbox без доступа к родителю', () => {
    // Код пользователя выполняется в iframe, песочница собирается в коде через
    // iframe.sandbox.add(...). Появление здесь allow-same-origin означало бы, что
    // произвольный код из редактора получает доступ к куке payload-token.
    const runner = read('../../src/components/trainer/CodeRunner.tsx')
    const tokens = [...runner.matchAll(/sandbox\.add\('([^']+)'\)/g)].map((m) => m[1])

    expect(tokens).toEqual(['allow-scripts'])
  })

  it('доска Miro встраивается со своей песочницей — это другой случай', () => {
    // Здесь allow-same-origin относится к origin самого miro.com, а не к нашему:
    // без него доска не грузится. Проверка нужна, чтобы этот iframe не
    // «починили» по образцу тренажёрного и не сломали блок с досками.
    const miro = read('../../src/components/lesson/MiroEmbed.tsx')
    expect(miro).toMatch(/sandbox="allow-scripts allow-same-origin allow-popups"/)
  })
})

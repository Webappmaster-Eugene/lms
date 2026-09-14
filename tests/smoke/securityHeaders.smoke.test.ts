import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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
    const source = NEXT_CONFIG.match(/source:\s*'([^']+)'/)?.[1]
    expect(source).toBe('/((?!admin|api).*)')
  })
})

describe('базовые заголовки', () => {
  it.each([
    ['X-Frame-Options', 'DENY'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'no-referrer'],
  ])('%s = %s', (key, value) => {
    expect(NEXT_CONFIG).toMatch(new RegExp(`key: '${key}',[\\s\\S]{0,80}value: '${value}'`))
  })
})

describe('CSP: что разрешено', () => {
  it('по умолчанию только собственный источник', () => {
    expect(directive('default-src')).toBe("'self'")
  })

  it('сетевые запросы ограничены собственным источником', () => {
    expect(directive('connect-src')).toBe("'self'")
  })

  it('frame-src перечисляет источники поимённо, без разрешения всего подряд', () => {
    const sources = directive('frame-src').split(/\s+/).filter(Boolean)

    expect(sources).not.toContain('*')
    expect(sources).not.toContain('https:')
    expect(sources.every((s) => /^https:\/\/[a-z0-9.-]+$/.test(s))).toBe(true)
    expect(sources.length).toBeGreaterThan(2)
  })
})

describe('CSP и встраиваемый контент не разошлись', () => {
  it('домены, на которые VideoPlayer строит embed-ссылки, разрешены в frame-src', () => {
    const frameSrc = directive('frame-src')

    expect(VIDEO_PLAYER).toContain('https://www.youtube.com/embed/')
    expect(frameSrc).toContain('https://www.youtube.com')
  })

  it('Яндекс.Диск не встраивается в iframe — он запрещает это своим frame-ancestors', () => {
    expect(VIDEO_PLAYER).toContain('/api/yandex-disk/stream')
    expect(directive('frame-src')).not.toContain('disk.yandex')
  })

  it('referer снят на уровне документа — иначе CDN Яндекса рвёт перемотку по 403', () => {
    expect(NEXT_CONFIG).toMatch(/key: 'Referrer-Policy',[\s\S]{0,80}value: 'no-referrer'/)
  })

  it('miro разрешён — блок MiroBlock встраивает доски через iframe', () => {
    expect(read('../../src/payload/blocks/MiroBlock.ts')).toContain('miro.com')
    expect(directive('frame-src')).toContain('https://miro.com')
  })

  it('media-src допускает внешние источники — видео отдаются по прямым ссылкам', () => {
    expect(directive('media-src')).toContain('https:')
  })

  it('blob разрешён для видео и воркеров — иначе не работает плеер MPEG-TS', () => {
    // mpegts.js отдаёт поток через MediaSource: источник видео адресуется blob-ссылкой
    expect(directive('media-src')).toContain('blob:')
    expect(directive('worker-src')).toContain('blob:')
  })

  it('blob не расползается на скрипты — политика остаётся узкой', () => {
    expect(directive('script-src')).not.toContain('blob:')
    expect(directive('default-src')).not.toContain('blob:')
  })
})

describe('песочница встроенных фреймов', () => {
  it('исполнение кода тренажёра изолировано sandbox без доступа к родителю', () => {
    const runner = read('../../src/components/trainer/CodeRunner.tsx')
    const tokens = [...runner.matchAll(/sandbox\.add\('([^']+)'\)/g)].map((m) => m[1])

    expect(tokens).toEqual(['allow-scripts'])
  })

  it('доска Miro встраивается со своей песочницей — это другой случай', () => {
    // allow-same-origin здесь относится к origin miro.com, без него доска не грузится
    const miro = read('../../src/components/lesson/MiroEmbed.tsx')
    expect(miro).toMatch(/sandbox="allow-scripts allow-same-origin allow-popups"/)
  })
})

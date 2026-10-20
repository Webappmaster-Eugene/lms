import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

const DOCKERFILE = read('../../Dockerfile')
const COMPOSE = read('../../docker-compose.yml')
const DOCKERIGNORE = read('../../.dockerignore')
const NEXT_CONFIG = read('../../next.config.mjs')
const PACKAGE = JSON.parse(read('../../package.json')) as {
  engines?: { node?: string }
  packageManager?: string
  scripts: Record<string, string>
  dependencies: Record<string, string>
}

/** Имена пакетов из serverExternalPackages в next.config.mjs. */
function externalPackages(): string[] {
  const block = NEXT_CONFIG.match(/serverExternalPackages:\s*\[([\s\S]*?)\]/)
  expect(block, 'в next.config.mjs нет serverExternalPackages').not.toBeNull()
  return [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

const LANDING_DOCKERFILE = read('../../landing/Dockerfile')
const LANDING_PACKAGE = JSON.parse(read('../../landing/package.json')) as {
  dependencies: Record<string, string>
}

/** `FROM node:22-alpine AS build` → 22 */
function nodeMajor(dockerfile: string): number {
  const match = dockerfile.match(/FROM node:(\d+)/)
  expect(match, 'в Dockerfile не найден базовый образ node').not.toBeNull()
  return Number(match![1])
}

describe('постоянное хранилище', () => {
  it('каталог загруженных файлов смонтирован томом', () => {
    expect(COMPOSE).toMatch(/lms-media:\/app\/media/)
  })

  it('данные Postgres смонтированы томом', () => {
    expect(COMPOSE).toMatch(/lms-pgdata:\/var\/lib\/postgresql\/data/)
  })

  it('каждый использованный том объявлен в секции volumes', () => {
    const used = new Set(
      [...COMPOSE.matchAll(/^\s+-\s+([a-z0-9-]+):\/(?:app|var)\//gm)].map((m) => m[1]),
    )
    expect(used.size).toBeGreaterThan(0)

    const declared = COMPOSE.slice(COMPOSE.indexOf('\nvolumes:'))
    const undeclared = [...used].filter((name) => !new RegExp(`^\\s{2}${name}:`, 'm').test(declared))

    expect(undeclared, `тома используются, но не объявлены: ${undeclared.join(', ')}`).toEqual([])
  })

  it('образ заранее создаёт каталог точки монтирования', () => {
    expect(DOCKERFILE).toMatch(/mkdir -p media/)
    expect(DOCKERFILE).toMatch(/chown nextjs:nodejs media/)
  })
})

describe('healthcheck', () => {
  it('приложение проверяется по маршруту, который действительно существует', () => {
    const route = new URL('../../src/app/(payload)/api/health/route.ts', import.meta.url)

    expect(COMPOSE).toMatch(/localhost:3000\/api\/health/)
    expect(DOCKERFILE).toMatch(/localhost:3000\/api\/health/)
    expect(existsSync(fileURLToPath(route)), 'нет роута /api/health').toBe(true)
  })

  it('в рантайм-образе есть curl, которым healthcheck пользуется', () => {
    expect(DOCKERFILE).toMatch(/apk add --no-cache curl/)
  })

  it('приложение стартует только после готовности БД', () => {
    expect(COMPOSE).toMatch(/depends_on:\s*\n\s*lms-mentor-db:\s*\n\s*condition:\s*service_healthy/)
  })

  it('у лендинга свой healthcheck', () => {
    expect(LANDING_DOCKERFILE).toMatch(/HEALTHCHECK/)
  })
})

describe('переменные сборки', () => {
  it('NEXT_PUBLIC_SERVER_URL передаётся как build-ARG, а не только в рантайм', () => {
    expect(DOCKERFILE).toMatch(/ARG NEXT_PUBLIC_SERVER_URL/)
    expect(DOCKERFILE).toMatch(/ENV NEXT_PUBLIC_SERVER_URL=\$\{NEXT_PUBLIC_SERVER_URL\}/)
    expect(COMPOSE).toMatch(/args:[\s\S]{0,200}NEXT_PUBLIC_SERVER_URL/)
  })

  it('PAYLOAD_SECRET на сборке — заглушка, а настоящий приходит в рантайме', () => {
    expect(DOCKERFILE).toMatch(/ARG PAYLOAD_SECRET=build-time-placeholder/)
    expect(COMPOSE).toMatch(/PAYLOAD_SECRET=\$\{PAYLOAD_SECRET\}/)
  })

  it('в Dockerfile нет значений секретов по умолчанию', () => {
    const defaults = [...DOCKERFILE.matchAll(/^ARG\s+(\w*(?:SECRET|PASSWORD|TOKEN))=(.+)$/gm)]
    for (const [, name, value] of defaults) {
      expect(value, `${name} имеет небезопасное значение по умолчанию`).toMatch(/placeholder/)
    }
  })
})

describe('версии Node', () => {
  it('образ приложения удовлетворяет engines из package.json', () => {
    const required = Number(PACKAGE.engines?.node?.match(/(\d+)/)?.[1] ?? 0)
    expect(required).toBeGreaterThan(0)
    expect(nodeMajor(DOCKERFILE)).toBeGreaterThanOrEqual(required)
  })

  it('образ лендинга удовлетворяет требованиям Astro', () => {
    // Astro 6+ требует node >= 22.12, локально версия обычно новее
    const astroMajor = Number(LANDING_PACKAGE.dependencies.astro.match(/(\d+)/)?.[1] ?? 0)
    expect(astroMajor).toBeGreaterThanOrEqual(6)
    expect(nodeMajor(LANDING_DOCKERFILE)).toBeGreaterThanOrEqual(22)
  })

  it('версия pnpm зафиксирована — Docker ставит её через corepack', () => {
    expect(PACKAGE.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/)
    expect(DOCKERFILE).toMatch(/corepack enable pnpm/)
  })

  it('зависимости в образе ставятся по локфайлу', () => {
    expect(DOCKERFILE).toMatch(/pnpm i --frozen-lockfile/)
  })

  it('установка переживает просадку канала сборщика', () => {
    // Сборщик на Raspberry Pi качает пакеты по Wi-Fi одновременно с отправкой образов:
    // с настройками pnpm по умолчанию один не скачавшийся пакет валит выкат.
    const instructions = DOCKERFILE.replace(/\\\n/g, ' ').split('\n')
    const install = instructions.find((line) => line.includes('pnpm i --frozen-lockfile')) ?? ''
    expect(install).toMatch(/^RUN --mount=type=cache,[^\s]*target=\/pnpm-store/)
    expect(install).toMatch(/--store-dir=\/pnpm-store/)
    expect(Number(install.match(/--fetch-retries=(\d+)/)?.[1] ?? 0)).toBeGreaterThanOrEqual(5)
    expect(Number(install.match(/--fetch-timeout=(\d+)/)?.[1] ?? 0)).toBeGreaterThan(60_000)
  })
})

describe('контекст сборки', () => {
  it('.dockerignore исключает то, что ломает воспроизводимость', () => {
    for (const entry of ['node_modules', '.next', '.git', 'media']) {
      expect(DOCKERIGNORE, `.dockerignore не исключает ${entry}`).toMatch(
        new RegExp(`^${entry.replace('.', '\\.')}$`, 'm'),
      )
    }
  })

  it('файлы окружения не попадают в образ', () => {
    expect(DOCKERIGNORE).toMatch(/^\.env$/m)
    expect(DOCKERIGNORE).toMatch(/^\.env\.\*$/m)
  })

  it('вложенные node_modules не попадают в контекст', () => {
    // Иначе локальный landing/node_modules маскирует ошибки, которые на сервере
    // (чистый клон) валят сборку.
    expect(DOCKERIGNORE).toMatch(/^\*\*\/node_modules$/m)
  })

  it('правки лендинга, тестов и документации не пересобирают образ приложения', () => {
    // Любой файл в контексте сбрасывает кеш `COPY . .`, а сборка на Pi идёт ~2 часа.
    for (const entry of ['landing', 'tests', 'docs']) {
      expect(DOCKERIGNORE, `.dockerignore не исключает ${entry}`).toMatch(new RegExp(`^${entry}$`, 'm'))
    }
  })

  it('.dockerignore не исключает файлы, которые образ использует', () => {
    const ignored = new Set(DOCKERIGNORE.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#')))
    const used = [
      ...DOCKERFILE.matchAll(/^RUN node (scripts\/[\w.-]+)/gm),
      ...DOCKERFILE.matchAll(/&& node (scripts\/[\w.-]+)/g),
      ...DOCKERFILE.matchAll(/^COPY --chown=\S+ (\S+) /gm),
    ].map((m) => m[1])
    expect(used).toEqual(expect.arrayContaining(['scripts/copy-monaco.mjs', 'scripts/build-harness.mjs', 'scripts/trainer-app-start.mjs']))
    for (const file of used) {
      const prefixes = file.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/'))
      expect(prefixes.filter((prefix) => ignored.has(prefix)), `${file} исключён из контекста`).toEqual([])
    }
  })

  it('проверка типов приложения не заходит в лендинг', () => {
    // У лендинга свои зависимости (astro): в образе приложения их нет, и next build
    // падает на первом же импорте из astro.
    const tsconfig = JSON.parse(read('../../tsconfig.json')) as { exclude?: string[] }
    expect(tsconfig.exclude).toContain('landing')
  })
})

describe('nginx лендинга', () => {
  const NGINX = read('../../landing/nginx.conf').replace(/#.*$/gm, '')

  /** Тела блоков `location … { … }` с учётом вложенных скобок. */
  function locationBodies(): string[] {
    return [...NGINX.matchAll(/\blocation\b[^{]*\{/g)].map((match) => {
      let depth = 1
      let end = match.index + match[0].length
      while (depth > 0 && end < NGINX.length) {
        if (NGINX[end] === '{') depth += 1
        if (NGINX[end] === '}') depth -= 1
        end += 1
      }
      return NGINX.slice(match.index, end)
    })
  }

  /** Значение `add_header Имя "значение" always;` уровня server. */
  function header(name: string): string {
    const match = NGINX.match(new RegExp(`^ {4}add_header ${name} "([^"]+)" always;$`, 'm'))
    expect(match, `в nginx.conf нет add_header ${name} на уровне server`).not.toBeNull()
    return match![1]
  }

  it('заголовки безопасности заданы на уровне server', () => {
    for (const name of ['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Strict-Transport-Security', 'Content-Security-Policy', 'Permissions-Policy']) {
      header(name)
    }
  })

  it('версия nginx не раскрывается', () => {
    expect(NGINX).toMatch(/^ {4}server_tokens off;$/m)
  })

  it('HSTS без preload: из списка браузеров его не отозвать, если HTTPS сломается', () => {
    expect(Number(header('Strict-Transport-Security').match(/max-age=(\d+)/)?.[1] ?? 0)).toBeGreaterThan(0)
    expect(header('Strict-Transport-Security')).not.toContain('preload')
  })

  it('CSP не разрешает чужие и встроенные скрипты', () => {
    const csp = Object.fromEntries(header('Content-Security-Policy').split(';').map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/)
      return [name, sources.join(' ')]
    }))
    expect(csp['default-src']).toBe("'self'")
    expect(csp['script-src']).toBe("'self'")
    expect(csp['object-src']).toBe("'none'")
    expect(csp['frame-ancestors']).toBe("'self'")
  })

  it('Permissions-Policy запрещает камеру, микрофон и геолокацию', () => {
    for (const feature of ['camera', 'microphone', 'geolocation']) {
      expect(header('Permissions-Policy')).toContain(`${feature}=()`)
    }
  })

  it('ни один location не отменяет заголовки безопасности своим add_header', () => {
    // В nginx add_header внутри location отменяет все add_header уровнем выше: так
    // картинки и скрипты лендинга уходили без X-Content-Type-Options и X-Frame-Options.
    const bodies = locationBodies()
    expect(bodies.length).toBeGreaterThan(0)
    for (const body of bodies) expect(body).not.toMatch(/\badd_header\b/)
  })
})

describe('режим сборки Next', () => {
  it('next.config собирает standalone, а Dockerfile его копирует', () => {
    expect(NEXT_CONFIG).toMatch(/output:\s*'standalone'/)
    expect(DOCKERFILE).toMatch(/\.next\/standalone/)
    expect(DOCKERFILE).toMatch(/\.next\/static/)
    expect(DOCKERFILE).toMatch(/CMD \["node", "scripts\/trainer-app-start\.mjs"\]/)
    expect(DOCKERFILE).toContain('scripts/trainer-app-start.mjs ./scripts/trainer-app-start.mjs')
    expect(DOCKERFILE).toContain('trainer-runtime/auth-token.mjs ./trainer-runtime/auth-token.mjs')
    expect(read('../../scripts/trainer-app-start.mjs')).toContain("await import('../server.js')")
  })

  it('контейнер работает не от root', () => {
    expect(DOCKERFILE).toMatch(/^USER nextjs$/m)
  })

  it('образ пропускает линтер и типы только потому, что их гарантирует smoke до push', () => {
    // Сборщик на Raspberry Pi не выдерживает этот шаг по памяти. Пропуск допустим, пока
    // те же проверки стоят в smoke и CI: если их оттуда убрать, ошибка типов уедет в прод.
    expect(DOCKERFILE).toMatch(/^ENV LMS_SKIP_BUILD_CHECKS=1$/m)
    expect(DOCKERFILE.indexOf('ENV LMS_SKIP_BUILD_CHECKS=1')).toBeLessThan(DOCKERFILE.search(/npx next build(?: \\)?$/m))
    expect(NEXT_CONFIG).toMatch(/const skipBuildChecks = process\.env\.LMS_SKIP_BUILD_CHECKS === '1'/)
    expect(NEXT_CONFIG).toMatch(/typescript:\s*\{\s*ignoreBuildErrors:\s*skipBuildChecks\s*\}/)
    expect(NEXT_CONFIG).toMatch(/eslint:\s*\{\s*ignoreDuringBuilds:\s*skipBuildChecks\s*\}/)
    expect(PACKAGE.scripts.smoke).toMatch(/pnpm lint && pnpm typecheck/)
    const ci = read('../../.github/workflows/ci.yml')
    expect(ci).toMatch(/run: pnpm lint/)
    expect(ci).toMatch(/run: pnpm typecheck/)
  })
})

describe('инструментирование', () => {
  const INSTRUMENTATION = read('../../src/instrumentation.ts')

  it('проверка NEXT_RUNTIME написана как положительное условие вокруг импорта', () => {
    // Только такую форму Next сворачивает на сборке; при раннем выходе OTel попадает
    // в edge-бандл, тянет gRPC и сборка падает на `Can't resolve 'fs'`
    expect(INSTRUMENTATION).toMatch(
      /if \(process\.env\.NEXT_RUNTIME === 'nodejs'\) \{[\s\S]*import\('\.\/instrumentation\.node'\)/,
    )
    expect(INSTRUMENTATION).not.toMatch(/NEXT_RUNTIME !== 'nodejs'/)
  })

  it('отказ телеметрии не роняет запуск сервера', () => {
    expect(INSTRUMENTATION).toMatch(/try \{[\s\S]*instrumentation\.node[\s\S]*\} catch/)
  })

  it('перехватчики require объявлены зависимостями и внешними пакетами', () => {
    for (const name of ['require-in-the-middle', 'import-in-the-middle']) {
      expect(PACKAGE.dependencies[name], `${name} не в dependencies`).toBeDefined()
      expect(externalPackages(), `${name} не в serverExternalPackages`).toContain(name)
    }
  })

  it('ни один пакет OpenTelemetry не попадает в бандл', () => {
    // Пакет, оставшийся в бандле, ломает сборку обращением к fs или молча отдаёт
    // undefined вместо класса — приложение стартует и отвечает 500 на каждый запрос
    const otel = Object.keys(PACKAGE.dependencies).filter((d) => d.startsWith('@opentelemetry/'))
    expect(otel.length).toBeGreaterThan(5)

    const external = externalPackages()
    const missing = otel.filter((name) => !external.includes(name))

    expect(missing, `не объявлены внешними: ${missing.join(', ')}`).toEqual([])
  })
})

describe('Sentry', () => {
  const INSTRUMENTATION = read('../../src/instrumentation.ts')
  const CLIENT = read('../../src/instrumentation-client.ts')
  const ENV_EXAMPLE = read('../../.env.example')

  it('необработанные ошибки запросов Next уходят в Sentry', () => {
    expect(INSTRUMENTATION).toMatch(/export const onRequestError = captureRequestError/)
  })

  it('браузер не знает настоящего DSN: он идёт через туннель и меняется без пересборки', () => {
    expect(CLIENT).toMatch(/tunnel: SENTRY_TUNNEL_PATH/)
    expect(CLIENT).not.toMatch(/SENTRY_DSN/)
    expect(DOCKERFILE).not.toMatch(/SENTRY_DSN/)
  })

  it('DSN приходит в рантайме через compose и описан в .env.example', () => {
    expect(COMPOSE).toMatch(/- SENTRY_DSN=\$\{SENTRY_DSN:-\}/)
    expect(COMPOSE).toMatch(/- SENTRY_BROWSER_DSN=\$\{SENTRY_BROWSER_DSN:-\}/)
    expect(ENV_EXAMPLE).toMatch(/SENTRY_DSN=/)
  })

  it('токен загрузки source maps — секрет сборки, а не ARG, который останется в истории образа', () => {
    expect(DOCKERFILE).not.toMatch(/ARG SENTRY_AUTH_TOKEN/)
    expect(DOCKERFILE).toMatch(/--mount=type=secret,id=sentry_auth_token,required=false/)
    expect(COMPOSE).toMatch(/secrets: \[sentry_auth_token\]/)
    expect(COMPOSE).toMatch(/sentry_auth_token:\s*\n\s*environment: SENTRY_AUTH_TOKEN/)
  })

  it('source maps удаляются из образа после загрузки, и ещё раз — на случай сбоя плагина', () => {
    expect(NEXT_CONFIG).toMatch(/deleteSourcemapsAfterUpload: true/)
    expect(DOCKERFILE).toMatch(/npx next build \\\n\s*&& find \.next\/static -name '\*\.map' -delete/)
  })
})

describe('скрипты проверки', () => {
  it('smoke прогоняет линтер, типы, тесты и сборку', () => {
    const smoke = PACKAGE.scripts.smoke ?? ''
    for (const step of ['lint', 'typecheck', 'test', 'build']) {
      expect(smoke, `smoke не включает ${step}`).toContain(step)
    }
  })

  it('lint вызывает eslint напрямую', () => {
    expect(PACKAGE.scripts.lint).toBe('eslint .')
  })
})

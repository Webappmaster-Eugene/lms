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
})

describe('режим сборки Next', () => {
  it('next.config собирает standalone, а Dockerfile его копирует', () => {
    expect(NEXT_CONFIG).toMatch(/output:\s*'standalone'/)
    expect(DOCKERFILE).toMatch(/\.next\/standalone/)
    expect(DOCKERFILE).toMatch(/\.next\/static/)
    expect(DOCKERFILE).toMatch(/CMD \["node", "server\.js"\]/)
  })

  it('контейнер работает не от root', () => {
    expect(DOCKERFILE).toMatch(/^USER nextjs$/m)
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
    const pkg = JSON.parse(read('../../package.json')) as {
      dependencies: Record<string, string>
    }

    for (const name of ['require-in-the-middle', 'import-in-the-middle']) {
      expect(pkg.dependencies[name], `${name} не в dependencies`).toBeDefined()
      expect(NEXT_CONFIG, `${name} не в serverExternalPackages`).toContain(name)
    }
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

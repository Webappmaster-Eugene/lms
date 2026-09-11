import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Конфигурация выката: то, что ломается один раз и дорого.
 *
 * Здесь собраны проверки с несимметричной ценой ошибки. Потерянный том — это не
 * «перезапустимся»: в /app/media лежат загруженные файлы курсов, и деплой без тома
 * стирает их безвозвратно. Забытый build-ARG для NEXT_PUBLIC_* не роняет сборку —
 * переменная просто становится undefined в браузере, и ссылки начинают вести
 * в никуда. Несовпадение версии Node в образе с требованиями зависимостей
 * проявляется только на сервере: локально стоит другая версия, и всё собирается.
 *
 * Файлы читаются как текст: поднимать docker в тестах незачем, а проверяются
 * именно формулировки.
 */

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
    // Без тома media живёт внутри слоя контейнера и исчезает при каждом деплое
    // вместе со всеми материалами курсов.
    expect(COMPOSE).toMatch(/lms-media:\/app\/media/)
  })

  it('данные Postgres смонтированы томом', () => {
    expect(COMPOSE).toMatch(/lms-pgdata:\/var\/lib\/postgresql\/data/)
  })

  it('каждый использованный том объявлен в секции volumes', () => {
    // Compose падает на неизвестном имени тома, но падает уже при деплое.
    const used = new Set(
      [...COMPOSE.matchAll(/^\s+-\s+([a-z0-9-]+):\/(?:app|var)\//gm)].map((m) => m[1]),
    )
    expect(used.size).toBeGreaterThan(0)

    const declared = COMPOSE.slice(COMPOSE.indexOf('\nvolumes:'))
    const undeclared = [...used].filter((name) => !new RegExp(`^\\s{2}${name}:`, 'm').test(declared))

    expect(undeclared, `тома используются, но не объявлены: ${undeclared.join(', ')}`).toEqual([])
  })

  it('образ заранее создаёт каталог точки монтирования', () => {
    // Иначе docker создаст её от root, а процесс в контейнере работает от nextjs
    // и не сможет туда писать.
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
    // Healthcheck, который не может запуститься, вечно даёт unhealthy, и Dokploy
    // считает контейнер мёртвым.
    expect(DOCKERFILE).toMatch(/apk add --no-cache curl/)
  })

  it('приложение стартует только после готовности БД', () => {
    // Без condition: service_healthy приложение стартует раньше Postgres,
    // падает на миграциях и уходит в цикл перезапусков.
    expect(COMPOSE).toMatch(/depends_on:\s*\n\s*lms-mentor-db:\s*\n\s*condition:\s*service_healthy/)
  })

  it('у лендинга свой healthcheck', () => {
    expect(LANDING_DOCKERFILE).toMatch(/HEALTHCHECK/)
  })
})

describe('переменные сборки', () => {
  it('NEXT_PUBLIC_SERVER_URL передаётся как build-ARG, а не только в рантайм', () => {
    // NEXT_PUBLIC_* инлайнится в клиентский бандл на этапе сборки. Переданная
    // только через environment, она останется undefined в браузере, и сборка
    // об этом не сообщит.
    expect(DOCKERFILE).toMatch(/ARG NEXT_PUBLIC_SERVER_URL/)
    expect(DOCKERFILE).toMatch(/ENV NEXT_PUBLIC_SERVER_URL=\$\{NEXT_PUBLIC_SERVER_URL\}/)
    expect(COMPOSE).toMatch(/args:[\s\S]{0,200}NEXT_PUBLIC_SERVER_URL/)
  })

  it('PAYLOAD_SECRET на сборке — заглушка, а настоящий приходит в рантайме', () => {
    expect(DOCKERFILE).toMatch(/ARG PAYLOAD_SECRET=build-time-placeholder/)
    expect(COMPOSE).toMatch(/PAYLOAD_SECRET=\$\{PAYLOAD_SECRET\}/)
  })

  it('в Dockerfile нет значений секретов по умолчанию', () => {
    // Дефолт для секрета опаснее его отсутствия: приложение поднимется и будет
    // работать с общеизвестным ключом подписи сессий.
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
    // Astro 6 и 7 требуют node >= 22.12. Локально версия обычно новее, поэтому
    // расхождение видно только при сборке образа — то есть на деплое.
    const astroMajor = Number(LANDING_PACKAGE.dependencies.astro.match(/(\d+)/)?.[1] ?? 0)
    expect(astroMajor).toBeGreaterThanOrEqual(6)
    expect(nodeMajor(LANDING_DOCKERFILE)).toBeGreaterThanOrEqual(22)
  })

  it('версия pnpm зафиксирована — Docker ставит её через corepack', () => {
    // Без packageManager corepack берёт версию по своему усмотрению, и она может
    // не понять формат pnpm-lock.yaml, собранного локально.
    expect(PACKAGE.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/)
    expect(DOCKERFILE).toMatch(/corepack enable pnpm/)
  })

  it('зависимости в образе ставятся по локфайлу', () => {
    expect(DOCKERFILE).toMatch(/pnpm i --frozen-lockfile/)
  })
})

describe('контекст сборки', () => {
  it('.dockerignore исключает то, что ломает воспроизводимость', () => {
    // node_modules с хоста содержат бинарники под macOS и ломают образ на Alpine;
    // .next приносит артефакты прошлой сборки.
    for (const entry of ['node_modules', '.next', '.git', 'media']) {
      expect(DOCKERIGNORE, `.dockerignore не исключает ${entry}`).toMatch(
        new RegExp(`^${entry.replace('.', '\\.')}$`, 'm'),
      )
    }
  })

  it('файлы окружения не попадают в образ', () => {
    // Секреты приходят в рантайме через Dokploy; .env в слое образа — утечка,
    // которая переживёт и push в registry.
    expect(DOCKERIGNORE).toMatch(/^\.env$/m)
    expect(DOCKERIGNORE).toMatch(/^\.env\.\*$/m)
  })
})

describe('режим сборки Next', () => {
  it('next.config собирает standalone, а Dockerfile его копирует', () => {
    // Рантайм-образ запускает node server.js из .next/standalone. Без
    // output: 'standalone' этого каталога не существует, и COPY молча положит пустоту.
    expect(NEXT_CONFIG).toMatch(/output:\s*'standalone'/)
    expect(DOCKERFILE).toMatch(/\.next\/standalone/)
    expect(DOCKERFILE).toMatch(/\.next\/static/)
    expect(DOCKERFILE).toMatch(/CMD \["node", "server\.js"\]/)
  })

  it('контейнер работает не от root', () => {
    expect(DOCKERFILE).toMatch(/^USER nextjs$/m)
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
    // `next lint` без конфигурации уходит в интерактивный визард и падает —
    // ровно так линтер и был сломан до появления eslint.config.mjs.
    expect(PACKAGE.scripts.lint).toBe('eslint .')
  })
})

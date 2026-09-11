import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

function list(relative: string): string[] {
  return readdirSync(fileURLToPath(new URL(relative, import.meta.url)))
}

const CONFIG = read('../../src/payload.config.ts')
const MIGRATIONS_INDEX = read('../../src/migrations/index.ts')

const COLLECTION_FILES = list('../../src/payload/collections')
  .filter((f) => f.endsWith('.ts'))
  .map((f) => f.replace(/\.ts$/, ''))

const GLOBAL_FILES = list('../../src/payload/globals')
  .filter((f) => f.endsWith('.ts'))
  .map((f) => f.replace(/\.ts$/, ''))

describe('коллекции подключены к конфигу', () => {
  it('файлы коллекций вообще найдены', () => {
    expect(COLLECTION_FILES.length).toBeGreaterThan(10)
  })

  it('каждая коллекция импортирована в payload.config.ts', () => {
    const missing = COLLECTION_FILES.filter(
      (name) => !CONFIG.includes(`@/payload/collections/${name}`),
    )

    expect(missing, `нет импорта: ${missing.join(', ')}`).toEqual([])
  })

  it('каждая импортированная коллекция включена в массив collections', () => {
    const collectionsArray = CONFIG.slice(
      CONFIG.indexOf('collections: ['),
      CONFIG.indexOf('globals:'),
    )
    const missing = COLLECTION_FILES.filter(
      (name) => !new RegExp(`\\b${name}\\b`).test(collectionsArray),
    )

    expect(missing, `не включены в collections: ${missing.join(', ')}`).toEqual([])
  })

  it('каждый global подключён', () => {
    const missing = GLOBAL_FILES.filter((name) => !CONFIG.includes(`@/payload/globals/${name}`))
    expect(missing, `нет импорта: ${missing.join(', ')}`).toEqual([])
  })
})

describe('миграции', () => {
  const migrationFiles = list('../../src/migrations')
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => f.replace(/\.ts$/, ''))

  it('файлы миграций найдены', () => {
    expect(migrationFiles.length).toBeGreaterThan(0)
  })

  it('каждый файл миграции экспортирован из index.ts', () => {
    const missing = migrationFiles.filter((name) => !MIGRATIONS_INDEX.includes(`./${name}`))
    expect(missing, `миграции не в индексе: ${missing.join(', ')}`).toEqual([])
  })

  it('у каждой записи индекса заполнено поле name', () => {
    const names = [...MIGRATIONS_INDEX.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1])

    expect(names).toHaveLength(migrationFiles.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('имена в индексе совпадают с именами файлов', () => {
    const names = [...MIGRATIONS_INDEX.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1])
    expect(names.slice().sort()).toEqual(migrationFiles.slice().sort())
  })

  it('конфиг действительно применяет миграции на проде', () => {
    expect(CONFIG).toMatch(/prodMigrations:\s*migrations/)
  })
})

describe('обязательные части конфига', () => {
  it('коллекция пользователей назначена админской', () => {
    expect(CONFIG).toMatch(/user:\s*Users\.slug/)
  })

  it('секрет берётся из окружения', () => {
    expect(CONFIG).toMatch(/secret:\s*process\.env\.PAYLOAD_SECRET/)
  })

  it('строка подключения к БД берётся из окружения, а не зашита в код', () => {
    expect(CONFIG).toMatch(/connectionString:\s*process\.env\.DATABASE_URL/)
    expect(CONFIG).not.toMatch(/connectionString:\s*['"]postgres/)
  })
})

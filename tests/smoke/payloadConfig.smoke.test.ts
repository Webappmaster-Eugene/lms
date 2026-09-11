import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Расхождения между файлами на диске и тем, что реально подключено в конфиге.
 *
 * Такие расхождения не ловятся ни типами, ни сборкой: файл коллекции компилируется
 * сам по себе, а не будучи подключённым, он просто не существует для Payload —
 * таблицы нет, API-роута нет, в админке пусто. Обнаруживается это на проде.
 *
 * С миграциями цена выше: `prodMigrations` в payload.config.ts применяет список из
 * migrations/index.ts на старте контейнера. Файл миграции, забытый в индексе, не
 * применится — и приложение поднимется на схеме, которой не соответствует код.
 *
 * Читаем исходники как текст: поднимать Payload ради этих проверок значит тянуть
 * за собой подключение к БД и sharp, а проверяется здесь именно текст.
 */

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
    // Страховка от «тест зелёный, потому что список пуст»: если каталог переедет,
    // все проверки ниже начнут проходить вхолостую.
    expect(COLLECTION_FILES.length).toBeGreaterThan(10)
  })

  it('каждая коллекция импортирована в payload.config.ts', () => {
    const missing = COLLECTION_FILES.filter(
      (name) => !CONFIG.includes(`@/payload/collections/${name}`),
    )

    expect(missing, `нет импорта: ${missing.join(', ')}`).toEqual([])
  })

  it('каждая импортированная коллекция включена в массив collections', () => {
    // Импорт без включения в массив — самая незаметная половина ошибки:
    // линтер молчит, потому что имя «использовано» импортом.
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
    // Payload хранит применённые миграции по имени. Пустое или задублированное имя
    // ломает учёт: миграция либо применится повторно, либо не применится вовсе.
    const names = [...MIGRATIONS_INDEX.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1])

    expect(names).toHaveLength(migrationFiles.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('имена в индексе совпадают с именами файлов', () => {
    const names = [...MIGRATIONS_INDEX.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1])
    expect(names.slice().sort()).toEqual(migrationFiles.slice().sort())
  })

  it('конфиг действительно применяет миграции на проде', () => {
    // Без prodMigrations продовый контейнер стартует на старой схеме и падает
    // на первом же запросе к новой колонке.
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

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Граница доступа на уровне коллекций.
 *
 * По умолчанию Payload разрешает операцию любому вошедшему пользователю, если у
 * коллекции не задан `access`. Для LMS это означает, что новая коллекция, добавленная
 * без блока прав, отдаёт чужой прогресс, чужие заметки и чужие сертификаты — и делает
 * это тихо: страницы работают, ошибок нет, в логах чисто.
 *
 * Тест текстовый и намеренно грубый: он не подменяет ревью, а ловит пропуск.
 * Забыть блок целиком — типичная ошибка при добавлении коллекции; ошибиться в его
 * содержимом, уже написав его, — гораздо реже.
 *
 * Точная семантика самих функций (`isAdmin`, `isAdminOrSelf`, `isAuthenticated`)
 * проверяется отдельно в tests/unit/access.test.ts.
 */

const DIR = new URL('../../src/payload/collections/', import.meta.url)

const collections = readdirSync(fileURLToPath(DIR))
  .filter((f) => f.endsWith('.ts'))
  .map((file) => ({
    name: file.replace(/\.ts$/, ''),
    source: readFileSync(fileURLToPath(new URL(file, DIR)), 'utf8'),
  }))

/**
 * Коллекции, где каждая запись принадлежит конкретному пользователю. Чтение «всего
 * подряд» здесь — утечка: прогресс, заметки, баллы и сертификаты чужих людей.
 */
const USER_OWNED = [
  'Certificates',
  'Notes',
  'Notifications',
  'PointsTransactions',
  'Streaks',
  'UserAchievements',
  'UserProgress',
  'UserTrainerProgress',
]

/** Справочный контент: читают все вошедшие, меняет только админ. */
const ADMIN_MANAGED = [
  'Achievements',
  'Courses',
  'FaqItems',
  'Lessons',
  'RoadmapEdges',
  'RoadmapNodes',
  'Roadmaps',
  'Sections',
  'TrainerTasks',
  'TrainerTopics',
]

describe('у каждой коллекции есть явные права', () => {
  it('коллекции найдены', () => {
    expect(collections.length).toBeGreaterThan(10)
  })

  it.each(collections.map((c) => c.name))('%s объявляет блок access', (name) => {
    const { source } = collections.find((c) => c.name === name)!
    expect(source).toMatch(/^\s{2}access:\s*\{/m)
  })

  it.each(collections.map((c) => c.name))('%s задаёт все четыре операции', (name) => {
    const { source } = collections.find((c) => c.name === name)!
    const block = source.slice(source.indexOf('access: {'))

    // Пропущенная операция молча наследует поведение по умолчанию — то есть
    // «разрешено любому вошедшему». Для delete это особенно дорого.
    for (const op of ['create', 'read', 'update', 'delete']) {
      expect(block, `${name}: не задан ${op}`).toMatch(new RegExp(`\\b${op}:`))
    }
  })
})

describe('коллекции с пользовательскими данными', () => {
  it('список актуален — все перечисленные коллекции существуют', () => {
    // Иначе переименование коллекции превратит проверку ниже в пустую.
    const names = collections.map((c) => c.name)
    const unknown = USER_OWNED.filter((n) => !names.includes(n))
    expect(unknown, `в списке USER_OWNED есть несуществующие: ${unknown.join(', ')}`).toEqual([])
  })

  it.each(USER_OWNED)('%s ограничивает чтение владельцем', (name) => {
    const { source } = collections.find((c) => c.name === name)!
    const block = source.slice(source.indexOf('access: {'), source.indexOf('fields:'))
    const read = block.match(/read:\s*([^,\n]+)/)?.[1] ?? ''

    // Допустимы только ограничивающие варианты. `isAuthenticated` здесь означало бы
    // «любой вошедший видит записи всех остальных».
    expect(read, `${name}: read = ${read}`).toMatch(/isAdminOrSelf|isAdmin\b|=>/)
    expect(read).not.toMatch(/isAuthenticated/)
  })
})

describe('справочный контент', () => {
  it('список актуален', () => {
    const names = collections.map((c) => c.name)
    const unknown = ADMIN_MANAGED.filter((n) => !names.includes(n))
    expect(unknown, `в списке ADMIN_MANAGED есть несуществующие: ${unknown.join(', ')}`).toEqual(
      [],
    )
  })

  it.each(ADMIN_MANAGED)('%s разрешает изменение только админу', (name) => {
    const { source } = collections.find((c) => c.name === name)!
    const block = source.slice(source.indexOf('access: {'), source.indexOf('fields:'))

    for (const op of ['create', 'update', 'delete']) {
      const value = block.match(new RegExp(`${op}:\\s*([^,\\n]+)`))?.[1] ?? ''
      expect(value, `${name}: ${op} = ${value}`).toMatch(/isAdmin\b/)
    }
  })
})

describe('отдельные правила', () => {
  it('транзакции баллов запрещено редактировать вообще', () => {
    // Баллы — это лидерборд и достижения. Правка задним числом ломает и то, и другое,
    // причём пересчитать «как было» уже нельзя.
    const { source } = collections.find((c) => c.name === 'PointsTransactions')!
    expect(source).toMatch(/update:\s*\(\)\s*=>\s*false/)
  })

  it('пользователей заводит только админ — самостоятельной регистрации нет', () => {
    const { source } = collections.find((c) => c.name === 'Users')!
    const block = source.slice(source.indexOf('access: {'), source.indexOf('fields:'))
    expect(block).toMatch(/create:\s*isAdmin/)
  })

  it('в админку пускают только админов', () => {
    const { source } = collections.find((c) => c.name === 'Users')!
    expect(source).toMatch(/admin:\s*\(\{\s*req:\s*\{\s*user\s*\}\s*\}\)\s*=>\s*user\?\.role\s*===\s*'admin'/)
  })
})

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DIR = new URL('../../src/payload/collections/', import.meta.url)

const collections = readdirSync(fileURLToPath(DIR))
  .filter((f) => f.endsWith('.ts'))
  .map((file) => ({
    name: file.replace(/\.ts$/, ''),
    source: readFileSync(fileURLToPath(new URL(file, DIR)), 'utf8'),
  }))

const names = collections.map((c) => c.name)

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

const OPERATIONS = ['create', 'read', 'update', 'delete'] as const

function sourceOf(name: string): string {
  const found = collections.find((c) => c.name === name)
  expect(found, `коллекция ${name} не найдена`).toBeDefined()
  return found!.source
}

/**
 * Тело блока `access` — по балансу фигурных скобок. Границы по соседним ключам
 * (`fields:`, конец файла) зависят от порядка полей и при его изменении дают либо
 * пустой срез, либо срез до конца файла, где найдётся что угодно.
 */
function accessBlock(name: string): string {
  const source = sourceOf(name)
  const start = source.indexOf('access: {')
  expect(start, `${name}: нет блока access`).toBeGreaterThanOrEqual(0)

  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }

  throw new Error(`${name}: блок access не закрыт`)
}

/** Значение операции верхнего уровня: вложенные объекты в расчёт не берутся. */
function operationValue(name: string, operation: string): string {
  return accessBlock(name).match(new RegExp(`^ {4}${operation}:\\s*(.+)$`, 'm'))?.[1] ?? ''
}

describe('у каждой коллекции есть явные права', () => {
  it('коллекции найдены', () => {
    expect(collections.length).toBeGreaterThan(10)
  })

  it.each(names)('%s объявляет блок access', (name) => {
    expect(sourceOf(name)).toMatch(/^ {2}access:\s*\{/m)
  })

  it.each(names)('%s задаёт все четыре операции', (name) => {
    for (const operation of OPERATIONS) {
      expect(operationValue(name, operation), `${name}: не задан ${operation}`).not.toBe('')
    }
  })
})

describe('коллекции с пользовательскими данными', () => {
  it('список актуален — все перечисленные коллекции существуют', () => {
    const unknown = USER_OWNED.filter((n) => !names.includes(n))
    expect(unknown, `в списке USER_OWNED есть несуществующие: ${unknown.join(', ')}`).toEqual([])
  })

  it.each(USER_OWNED)('%s ограничивает чтение владельцем', (name) => {
    const read = operationValue(name, 'read')

    expect(read, `${name}: read = ${read}`).toMatch(/isAdminOrSelf|isAdmin\b|=>/)
    expect(read, `${name}: read = ${read}`).not.toMatch(/isAuthenticated/)
  })
})

describe('справочный контент', () => {
  it('список актуален', () => {
    const unknown = ADMIN_MANAGED.filter((n) => !names.includes(n))
    expect(unknown, `в списке ADMIN_MANAGED есть несуществующие: ${unknown.join(', ')}`).toEqual([])
  })

  it.each(ADMIN_MANAGED)('%s разрешает изменение только админу', (name) => {
    for (const operation of ['create', 'update', 'delete']) {
      const value = operationValue(name, operation)
      expect(value, `${name}: ${operation} = ${value}`).toMatch(/isAdmin\b/)
    }
  })
})

describe('отдельные правила', () => {
  it('транзакции баллов запрещено редактировать вообще', () => {
    expect(operationValue('PointsTransactions', 'update')).toMatch(/\(\)\s*=>\s*false/)
  })

  it('пользователей заводит только админ — самостоятельной регистрации нет', () => {
    expect(operationValue('Users', 'create')).toMatch(/isAdmin\b/)
  })

  it('в админку пускают только админов', () => {
    expect(accessBlock('Users')).toMatch(
      /admin:\s*\(\{\s*req:\s*\{\s*user\s*\}\s*\}\)\s*=>\s*user\?\.role\s*===\s*'admin'/,
    )
  })
})

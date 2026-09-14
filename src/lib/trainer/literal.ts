/**
 * Превращение JS-значения в исходный код литерала.
 *
 * Табличные тест-кейсы хранятся в БД не как JSON, а как КОД: JSON не умеет
 * `undefined`, `NaN`, `Infinity`, `-0`, `Map`, `Set`, `Date`, `RegExp` и
 * циклические ссылки — а всё это встречается в задачах (deepClone с циклами,
 * полифилл Array.prototype.map с дырами, сравнение NaN). Литерал вставляется
 * в сгенерированный тест и вычисляется уже внутри песочницы.
 */

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export class LiteralError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LiteralError'
  }
}

/**
 * Значение, которое нельзя выразить литералом автоматически, можно передать
 * готовым куском кода — он вставится как есть.
 */
export type RawCode = { readonly __rawCode: string }

export function raw(code: string): RawCode {
  return { __rawCode: code }
}

function isRawCode(value: unknown): value is RawCode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { __rawCode?: unknown }).__rawCode === 'string'
  )
}

/**
 * Сериализует значение в исходный код. Бросает `LiteralError` на том, что
 * литералом не выражается (функции, символы, циклы) — так сломанный кейс
 * падает при сборке каталога, а не в рантайме у пользователя.
 */
export function toLiteral(value: unknown): string {
  return write(value, new Set<object>(), 0)
}

/** Список аргументов вызова: `1, "a", [2]`. */
export function toArgsLiteral(args: readonly unknown[]): string {
  return args.map((arg) => toLiteral(arg)).join(', ')
}

function write(value: unknown, seen: Set<object>, depth: number): string {
  if (depth > 32) throw new LiteralError('Слишком глубокая вложенность значения')

  if (value === null) return 'null'
  if (value === undefined) return 'undefined'

  if (isRawCode(value)) return value.__rawCode

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value)
    case 'boolean':
      return value ? 'true' : 'false'
    case 'bigint':
      return `${value}n`
    case 'number':
      return writeNumber(value)
    case 'function':
      throw new LiteralError(
        `Функцию нельзя записать литералом: ${value.name || 'anonymous'}. Используйте raw('...') с кодом.`,
      )
    case 'symbol':
      throw new LiteralError('Symbol нельзя записать литералом')
    default:
      break
  }

  const object = value as object
  if (seen.has(object)) {
    throw new LiteralError('Циклическая ссылка — опишите значение через raw() с явным кодом')
  }
  const nested = new Set(seen).add(object)

  if (Array.isArray(value)) {
    const items = value.map((item, index) =>
      index in value ? write(item, nested, depth + 1) : '',
    )
    // Дыры в массиве значимы для полифиллов map/forEach — сохраняем их.
    return `[${items.join(', ')}]`
  }

  if (value instanceof Date) return `new Date(${value.getTime()})`
  if (value instanceof RegExp) return String(value)
  if (value instanceof Error) {
    return `new ${value.name === 'Error' ? 'Error' : 'Error'}(${JSON.stringify(value.message)})`
  }

  if (value instanceof Map) {
    const entries = Array.from(value.entries()).map(
      ([key, item]) => `[${write(key, nested, depth + 1)}, ${write(item, nested, depth + 1)}]`,
    )
    return `new Map([${entries.join(', ')}])`
  }

  if (value instanceof Set) {
    const items = Array.from(value.values()).map((item) => write(item, nested, depth + 1))
    return `new Set([${items.join(', ')}])`
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new LiteralError(
      `Экземпляр класса ${(value as object).constructor?.name ?? '?'} нельзя записать литералом — используйте raw()`,
    )
  }

  const entries = Object.entries(value as Record<string, unknown>).map(
    ([key, item]) =>
      `${IDENTIFIER.test(key) ? key : JSON.stringify(key)}: ${write(item, nested, depth + 1)}`,
  )
  if (prototype === null) {
    return `Object.assign(Object.create(null), {${entries.join(', ')}})`
  }
  return entries.length ? `{ ${entries.join(', ')} }` : '{}'
}

function writeNumber(value: number): string {
  if (Number.isNaN(value)) return 'NaN'
  if (value === Infinity) return 'Infinity'
  if (value === -Infinity) return '-Infinity'
  // -0 переживает только явную запись: String(-0) === '0'.
  if (value === 0 && Object.is(value, -0)) return '-0'
  return String(value)
}

import { describe, expect, it } from 'vitest'

import { LiteralError, raw, toArgsLiteral, toLiteral } from '@/lib/trainer/literal'

/**
 * Литералы табличных кейсов.
 *
 * Значение превращается в КОД, который потом вычисляется внутри песочницы.
 * Поэтому проверяем не только результат, но и то, что он действительно
 * вычислим и даёт исходное значение обратно.
 */

function evaluate(code: string): unknown {
  return new Function(`return (${code})`)()
}

describe('toLiteral: примитивы', () => {
  it('строки экранируются', () => {
    expect(toLiteral('текст')).toBe('"текст"')
    expect(evaluate(toLiteral('с "кавычками"'))).toBe('с "кавычками"')
    expect(evaluate(toLiteral('со\nпереносом'))).toBe('со\nпереносом')
  })

  it('числа, включая особые', () => {
    expect(toLiteral(42)).toBe('42')
    expect(toLiteral(NaN)).toBe('NaN')
    expect(toLiteral(Infinity)).toBe('Infinity')
    expect(toLiteral(-Infinity)).toBe('-Infinity')
    expect(toLiteral(-0)).toBe('-0')
  })

  it('минус ноль переживает круг', () => {
    expect(Object.is(evaluate(toLiteral(-0)), -0)).toBe(true)
  })

  it('булевы, null и undefined', () => {
    expect(toLiteral(true)).toBe('true')
    expect(toLiteral(null)).toBe('null')
    expect(toLiteral(undefined)).toBe('undefined')
  })

  it('bigint', () => {
    expect(toLiteral(10n)).toBe('10n')
  })
})

describe('toLiteral: структуры', () => {
  it('массивы', () => {
    expect(toLiteral([1, 'a', null])).toBe('[1, "a", null]')
  })

  it('дыры в массиве сохраняются', () => {
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [1, , 3]
    const restored = evaluate(toLiteral(sparse)) as unknown[]

    expect(Object.prototype.hasOwnProperty.call(restored, 1)).toBe(false)
    expect(restored.length).toBe(3)
  })

  it('объекты', () => {
    expect(toLiteral({ a: 1 })).toBe('{ a: 1 }')
    expect(toLiteral({})).toBe('{}')
    expect(toLiteral({ 'с пробелом': 1 })).toBe('{ "с пробелом": 1 }')
  })

  it('вложенность', () => {
    expect(evaluate(toLiteral({ a: [{ b: 1 }] }))).toEqual({ a: [{ b: 1 }] })
  })

  it('Map и Set', () => {
    expect(toLiteral(new Map([['k', 1]]))).toBe('new Map([["k", 1]])')
    expect(toLiteral(new Set([1, 2]))).toBe('new Set([1, 2])')
    expect(evaluate(toLiteral(new Map([['k', 1]])))).toEqual(new Map([['k', 1]]))
  })

  it('даты и регулярные выражения', () => {
    expect(toLiteral(new Date(1000))).toBe('new Date(1000)')
    expect(toLiteral(/abc/gi)).toBe('/abc/gi')
  })

  it('объект без прототипа', () => {
    const bare = Object.assign(Object.create(null), { a: 1 })
    const restored = evaluate(toLiteral(bare)) as object

    expect(Object.getPrototypeOf(restored)).toBe(null)
  })
})

describe('toLiteral: недопустимые значения', () => {
  it('функция', () => {
    expect(() => toLiteral(() => 1)).toThrow(LiteralError)
  })

  it('символ', () => {
    expect(() => toLiteral(Symbol('x'))).toThrow(LiteralError)
  })

  it('циклическая ссылка', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(() => toLiteral(cyclic)).toThrow(LiteralError)
  })

  it('экземпляр класса', () => {
    class Point {
      constructor(public x: number) {}
    }

    expect(() => toLiteral(new Point(1))).toThrow(LiteralError)
  })

  it('один объект дважды в разных ветках — не цикл', () => {
    const shared = { a: 1 }
    expect(() => toLiteral([shared, shared])).not.toThrow()
  })
})

describe('raw и toArgsLiteral', () => {
  it('raw вставляется как есть', () => {
    expect(toLiteral(raw('(x) => x * 2'))).toBe('(x) => x * 2')
  })

  it('raw работает внутри структур', () => {
    expect(toLiteral([1, raw('Array')])).toBe('[1, Array]')
  })

  it('список аргументов', () => {
    expect(toArgsLiteral([1, 'a', [2]])).toBe('1, "a", [2]')
    expect(toArgsLiteral([])).toBe('')
  })
})

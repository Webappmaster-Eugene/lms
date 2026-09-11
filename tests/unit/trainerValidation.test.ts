import { describe, it, expect } from 'vitest'

import { validateOutput, compareOutput } from '@/lib/trainer-validation'

describe('validateOutput: что нормализация прощает', () => {
  it('совпадающий вывод засчитывается', () => {
    expect(validateOutput('42', '42')).toBe(true)
  })

  it('перевод строки CRLF приравнивается к LF', () => {
    expect(validateOutput('a\r\nb', 'a\nb')).toBe(true)
  })

  it('пробелы в конце строк игнорируются', () => {
    expect(validateOutput('hello   \nworld\t', 'hello\nworld')).toBe(true)
  })

  it('пустые строки в начале и конце игнорируются', () => {
    expect(validateOutput('\n\n42\n\n', '42')).toBe(true)
  })

  it('все послабления работают одновременно', () => {
    expect(validateOutput('\r\n  a  \r\nb\t\r\n\r\n', 'a\nb')).toBe(true)
  })
})

describe('validateOutput: что не прощает', () => {
  it('другое значение не засчитывается', () => {
    expect(validateOutput('42', '43')).toBe(false)
  })

  it('отступ внутренней строки значим', () => {
    expect(validateOutput('a\n  b', 'a\nb')).toBe(false)
  })

  it('отступ первой строки, наоборот, прощается', () => {
    // Хвосты режутся построчно, затем trim() всей склеенной строки снимает отступ первой
    expect(validateOutput('  a', 'a')).toBe(true)
    expect(validateOutput('   a\nb', 'a\nb')).toBe(true)
  })

  it('пустая строка внутри вывода значима', () => {
    expect(validateOutput('a\n\nb', 'a\nb')).toBe(false)
  })

  it('регистр значим', () => {
    expect(validateOutput('True', 'true')).toBe(false)
  })

  it('лишняя строка не засчитывается', () => {
    expect(validateOutput('a\nb', 'a')).toBe(false)
  })

  it('пустой вывод не совпадает с непустым эталоном', () => {
    expect(validateOutput('', '42')).toBe(false)
  })

  it('пустой вывод совпадает с пустым эталоном', () => {
    expect(validateOutput('', '')).toBe(true)
  })
})

describe('compareOutput', () => {
  it('при совпадении differences не заполняется', () => {
    const result = compareOutput('a\nb', 'a\nb')

    expect(result.passed).toBe(true)
    expect(result.differences).toBeUndefined()
    expect(result.actualLines).toEqual(['a', 'b'])
    expect(result.expectedLines).toEqual(['a', 'b'])
  })

  it('строки нумеруются с единицы', () => {
    const result = compareOutput('a\nX', 'a\nb')

    expect(result.passed).toBe(false)
    expect(result.differences).toEqual([{ lineNumber: 2, actual: 'X', expected: 'b' }])
  })

  it('недостающая строка показывается как пустая', () => {
    const result = compareOutput('a', 'a\nb')

    expect(result.differences).toEqual([{ lineNumber: 2, actual: '', expected: 'b' }])
  })

  it('лишняя строка попадает в различия', () => {
    const result = compareOutput('a\nb', 'a')

    expect(result.differences).toEqual([{ lineNumber: 2, actual: 'b', expected: '' }])
  })

  it('различия собираются по всем строкам', () => {
    const result = compareOutput('X\nb\nZ', 'a\nb\nc')

    expect(result.differences).toEqual([
      { lineNumber: 1, actual: 'X', expected: 'a' },
      { lineNumber: 3, actual: 'Z', expected: 'c' },
    ])
  })

  it('вердикт совпадает с validateOutput', () => {
    // Клиент подсвечивает различия через compareOutput, сервер засчитывает через validateOutput
    const cases: Array<[string, string]> = [
      ['a', 'a'],
      ['a\r\n', 'a'],
      ['  a', 'a'],
      ['', ''],
      ['a\nb', 'a'],
    ]

    for (const [actual, expected] of cases) {
      expect(compareOutput(actual, expected).passed).toBe(validateOutput(actual, expected))
    }
  })
})

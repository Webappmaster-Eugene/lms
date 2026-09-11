import { describe, it, expect } from 'vitest'

import { validateOutput, compareOutput } from '@/lib/trainer-validation'

/**
 * Сравнение вывода тренажёра — это критерий «задача решена». По его результату
 * начисляются баллы и закрывается прогресс, причём `POST /api/trainer-progress`
 * прогоняет ту же функцию ещё раз на сервере, не доверяя клиенту.
 *
 * Обе стороны ошибки одинаково плохи. Слишком строгое сравнение заставляет
 * пользователя биться о задачу, где ответ правильный, а различается невидимый
 * пробел в конце строки. Слишком мягкое — засчитывает неверное решение.
 * Поэтому проверяется ровно то, что нормализация обязана прощать, и ровно то,
 * что она прощать не должна.
 */

describe('validateOutput: что нормализация обязана прощать', () => {
  it('совпадающий вывод засчитывается', () => {
    expect(validateOutput('42', '42')).toBe(true)
  })

  it('перевод строки CRLF приравнивается к LF', () => {
    // Пользователь на Windows получает \r\n из редактора, эталон в БД хранится с \n.
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

describe('validateOutput: что нормализация прощать не должна', () => {
  it('другое значение не засчитывается', () => {
    expect(validateOutput('42', '43')).toBe(false)
  })

  it('отступ ВНУТРЕННЕЙ строки значим — по нему проверяют форматирование вывода', () => {
    // trimEnd() применяется к каждой строке, поэтому начало строки не трогается.
    expect(validateOutput('a\n  b', 'a\nb')).toBe(false)
  })

  it('отступ ПЕРВОЙ строки, наоборот, прощается — это следствие общего trim()', () => {
    // Асимметрия неочевидная, но намеренно зафиксирована как есть: нормализация
    // сначала режет хвосты построчно, а затем делает trim() всей склеенной строки,
    // и этот финальный trim() снимает отступ первой строки и хвост последней.
    // Менять поведение нельзя задним числом — на проде уже зачтены решения,
    // принятые по этому правилу.
    expect(validateOutput('  a', 'a')).toBe(true)
    expect(validateOutput('   a\nb', 'a\nb')).toBe(true)
  })

  it('пустая строка ВНУТРИ вывода значима', () => {
    expect(validateOutput('a\n\nb', 'a\nb')).toBe(false)
  })

  it('регистр значим', () => {
    expect(validateOutput('True', 'true')).toBe(false)
  })

  it('лишняя строка не засчитывается', () => {
    expect(validateOutput('a\nb', 'a')).toBe(false)
  })

  it('пустой вывод не совпадает с непустым эталоном', () => {
    // Частый случай: код не вызвал console.log вообще. Это не «решено».
    expect(validateOutput('', '42')).toBe(false)
  })

  it('пустой вывод совпадает с пустым эталоном', () => {
    // Задача без ожидаемого вывода: expectedOutput в API подставляется как ''.
    expect(validateOutput('', '')).toBe(true)
  })
})

describe('compareOutput: детализация для подсветки различий', () => {
  it('при совпадении differences не заполняется', () => {
    const result = compareOutput('a\nb', 'a\nb')

    expect(result.passed).toBe(true)
    expect(result.differences).toBeUndefined()
    expect(result.actualLines).toEqual(['a', 'b'])
    expect(result.expectedLines).toEqual(['a', 'b'])
  })

  it('номера строк нумеруются с единицы — они показываются пользователю', () => {
    const result = compareOutput('a\nX', 'a\nb')

    expect(result.passed).toBe(false)
    expect(result.differences).toEqual([{ lineNumber: 2, actual: 'X', expected: 'b' }])
  })

  it('недостающая строка показывается как пустая, а не теряется', () => {
    // Иначе пользователь видит «всё совпало», хотя одной строки нет.
    const result = compareOutput('a', 'a\nb')

    expect(result.differences).toEqual([{ lineNumber: 2, actual: '', expected: 'b' }])
  })

  it('лишняя строка тоже попадает в различия', () => {
    const result = compareOutput('a\nb', 'a')

    expect(result.differences).toEqual([{ lineNumber: 2, actual: 'b', expected: '' }])
  })

  it('различия собираются по всем строкам, а не только по первой', () => {
    const result = compareOutput('X\nb\nZ', 'a\nb\nc')

    expect(result.differences).toEqual([
      { lineNumber: 1, actual: 'X', expected: 'a' },
      { lineNumber: 3, actual: 'Z', expected: 'c' },
    ])
  })

  it('вердикт compareOutput совпадает с вердиктом validateOutput', () => {
    // Клиент подсвечивает различия через compareOutput, а сервер решает
    // засчитывать или нет через validateOutput. Расхождение между ними означало бы
    // «всё зелёное, но задача не зачтена».
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

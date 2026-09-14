import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

import { HARNESS_SOURCE } from '@/lib/trainer/harness-source.generated'

/**
 * Тесты рантайма песочницы.
 *
 * Харнесс проверяется так же, как он исполняется в бою: текстом, в свежем
 * контексте без Node API. Всё, что здесь зелёное, одинаково работает и в
 * iframe, и в V8-изоляте на сервере.
 */

type SandboxApi = {
  deepEqual: (a: unknown, b: unknown) => boolean
  serialize: (value: unknown) => string
  compareValues: (actual: unknown, expected: unknown, mode: string) => boolean
  normalizeOutput: (text: string) => string
  formatCall: (name: string, args: unknown[]) => string
}

function createSandbox(): { api: SandboxApi; run: (code: string) => unknown } {
  const context = vm.createContext(Object.create(null))
  vm.runInContext(HARNESS_SOURCE, context)

  const api = (context as { __tr: SandboxApi }).__tr

  return {
    api,
    run: (code: string) => vm.runInContext(`(function(){\n${code}\n})()`, context),
  }
}

describe('харнесс: структурное сравнение', () => {
  const { api } = createSandbox()

  it('примитивы', () => {
    expect(api.deepEqual(1, 1)).toBe(true)
    expect(api.deepEqual(1, '1')).toBe(false)
    expect(api.deepEqual(null, undefined)).toBe(false)
  })

  it('NaN равен NaN', () => {
    expect(api.deepEqual(NaN, NaN)).toBe(true)
    expect(api.deepEqual([NaN], [NaN])).toBe(true)
  })

  it('плюс ноль и минус ноль считаются равными', () => {
    expect(api.deepEqual(0, -0)).toBe(true)
  })

  it('вложенные структуры', () => {
    expect(api.deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(api.deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false)
  })

  it('массив не равен объекту с теми же индексами', () => {
    expect(api.deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false)
  })

  it('Map и Set', () => {
    expect(api.deepEqual(new Map([['k', 1]]), new Map([['k', 1]]))).toBe(true)
    expect(api.deepEqual(new Map([['k', 1]]), new Map([['k', 2]]))).toBe(false)
    expect(api.deepEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true)
  })

  it('Map с объектными ключами сравнивается структурно', () => {
    expect(api.deepEqual(new Map([[{ a: 1 }, 'v']]), new Map([[{ a: 1 }, 'v']]))).toBe(true)
  })

  it('даты и регулярные выражения', () => {
    expect(api.deepEqual(new Date(1000), new Date(1000))).toBe(true)
    expect(api.deepEqual(new Date(1000), new Date(2000))).toBe(false)
    expect(api.deepEqual(/a/g, /a/g)).toBe(true)
    expect(api.deepEqual(/a/g, /a/i)).toBe(false)
  })

  it('циклические ссылки не приводят к зацикливанию', () => {
    const first: Record<string, unknown> = { name: 'x' }
    first.self = first
    const second: Record<string, unknown> = { name: 'x' }
    second.self = second

    expect(api.deepEqual(first, second)).toBe(true)
  })
})

describe('харнесс: сериализация', () => {
  const { api } = createSandbox()

  it('примитивы', () => {
    expect(api.serialize('текст')).toBe('"текст"')
    expect(api.serialize(undefined)).toBe('undefined')
    expect(api.serialize(null)).toBe('null')
    expect(api.serialize(NaN)).toBe('NaN')
    expect(api.serialize(-0)).toBe('-0')
  })

  it('массивы и объекты', () => {
    expect(api.serialize([1, 'a'])).toBe('[1, "a"]')
    expect(api.serialize({ a: 1, 'с пробелом': 2 })).toBe('{ a: 1, "с пробелом": 2 }')
  })

  it('коллекции', () => {
    expect(api.serialize(new Map([['k', 1]]))).toBe('Map(1) { "k" => 1 }')
    expect(api.serialize(new Set([1, 2]))).toBe('Set(2) { 1, 2 }')
  })

  it('функции и циклы', () => {
    expect(api.serialize(function named() {})).toBe('[Function: named]')

    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(api.serialize(cyclic)).toBe('{ self: [Circular] }')
  })

  it('дыры в массиве видны', () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(api.serialize([1, , 3])).toBe('[1, <пусто>, 3]')
  })

  it('экземпляр класса подписан именем', () => {
    class Point {
      constructor(public x: number) {}
    }
    expect(api.serialize(new Point(1))).toBe('Point { x: 1 }')
  })

  it('длинное значение обрезается', () => {
    expect(api.serialize('я'.repeat(2000)).endsWith('… (обрезано)')).toBe(true)
  })

  it('длинный массив показывается частично', () => {
    const many = api.serialize(Array.from({ length: 500 }, (_unused, i) => i))
    expect(many).toContain('… ещё 460')
  })
})

describe('харнесс: способы сравнения', () => {
  const { api } = createSandbox()

  it('strict различает то, что deep считает равным', () => {
    expect(api.compareValues({ a: 1 }, { a: 1 }, 'deep')).toBe(true)
    expect(api.compareValues({ a: 1 }, { a: 1 }, 'strict')).toBe(false)
  })

  it('approx допускает погрешность', () => {
    expect(api.compareValues(0.1 + 0.2, 0.3, 'approx')).toBe(true)
    expect(api.compareValues(0.1 + 0.2, 0.3, 'deep')).toBe(false)
  })

  it('sorted игнорирует порядок', () => {
    expect(api.compareValues([3, 1, 2], [1, 2, 3], 'sorted')).toBe(true)
    expect(api.compareValues([3, 1, 2], [1, 2, 3], 'deep')).toBe(false)
  })

  it('set игнорирует порядок, но не количество', () => {
    expect(api.compareValues([1, 2], [2, 1], 'set')).toBe(true)
    expect(api.compareValues([1, 1, 2], [1, 2], 'set')).toBe(false)
  })
})

describe('харнесс: управляемые часы', () => {
  it('tick двигает время и запускает таймеры', async () => {
    const { run } = createSandbox()

    const result = await (run(`
      var __tr = globalThis.__tr
      test('таймер', function () {
        var fired = false
        setTimeout(function () { fired = true }, 100)
        return __clock.tick(99)
          .then(function () { expect(fired).toBe(false); return __clock.tick(1) })
          .then(function () { expect(fired).toBe(true) })
      })
      return __tr.run()
    `) as Promise<{ status: string }>)

    expect(result.status).toBe('passed')
  })

  it('Date.now идёт вместе с часами', async () => {
    const { run } = createSandbox()

    const result = await (run(`
      var __tr = globalThis.__tr
      test('время', function () {
        var before = Date.now()
        return __clock.tick(500).then(function () {
          expect(Date.now() - before).toBe(500)
        })
      })
      return __tr.run()
    `) as Promise<{ status: string }>)

    expect(result.status).toBe('passed')
  })

  it('clearTimeout отменяет таймер', async () => {
    const { run } = createSandbox()

    const result = await (run(`
      var __tr = globalThis.__tr
      test('отмена', function () {
        var fired = false
        var id = setTimeout(function () { fired = true }, 10)
        clearTimeout(id)
        return __clock.runAll().then(function () { expect(fired).toBe(false) })
      })
      return __tr.run()
    `) as Promise<{ status: string }>)

    expect(result.status).toBe('passed')
  })

  it('runAll доводит до конца цепочку отложенных таймеров', async () => {
    const { run } = createSandbox()

    // Каждый таймер планирует следующий через промис — ровно так ведёт себя
    // retry с экспоненциальной задержкой.
    const result = await (run(`
      var __tr = globalThis.__tr
      test('цепочка', function () {
        var steps = 0
        function step(left) {
          if (left === 0) return Promise.resolve()
          return new Promise(function (resolve) { setTimeout(resolve, 10) })
            .then(function () { steps += 1 })
            .then(function () { return step(left - 1) })
        }
        var done = step(5)
        return __clock.runAll().then(function () { return done }).then(function () {
          expect(steps).toBe(5)
        })
      })
      return __tr.run()
    `) as Promise<{ status: string }>)

    expect(result.status).toBe('passed')
  })

  it('setInterval повторяется и отменяется', async () => {
    const { run } = createSandbox()

    const result = await (run(`
      var __tr = globalThis.__tr
      test('интервал', function () {
        var ticks = 0
        var id = setInterval(function () { ticks += 1 }, 10)
        return __clock.tick(35).then(function () {
          expect(ticks).toBe(3)
          clearInterval(id)
          return __clock.tick(100)
        }).then(function () {
          expect(ticks).toBe(3)
        })
      })
      return __tr.run()
    `) as Promise<{ status: string }>)

    expect(result.status).toBe('passed')
  })
})

describe('харнесс: ассерты и отчёт', () => {
  it('упавший тест отдаёт ожидаемое и фактическое', async () => {
    const { run } = createSandbox()

    const result = (await run(`
      var __tr = globalThis.__tr
      test('падает', function () { expect([1, 2]).toEqual([1, 3]) })
      return __tr.run()
    `)) as { status: string; tests: Array<{ expected?: string; actual?: string }> }

    expect(result.status).toBe('failed')
    expect(result.tests[0].expected).toBe('[1, 3]')
    expect(result.tests[0].actual).toBe('[1, 2]')
  })

  it('toThrow ловит исключение и проверяет сообщение', async () => {
    const { run } = createSandbox()

    const result = (await run(`
      var __tr = globalThis.__tr
      test('бросает', function () {
        expect(function () { throw new TypeError('плохо') }).toThrow('плохо')
        expect(function () { throw new TypeError('плохо') }).toThrow(TypeError)
        expect(function () {}).not.toThrow()
      })
      return __tr.run()
    `)) as { status: string }

    expect(result.status).toBe('passed')
  })

  it('rejects ловит отклонённый промис', async () => {
    const { run } = createSandbox()

    const result = (await run(`
      var __tr = globalThis.__tr
      test('отклонение', function () {
        return expect(Promise.reject(new Error('нет'))).rejects.toThrow('нет')
      })
      return __tr.run()
    `)) as { status: string }

    expect(result.status).toBe('passed')
  })

  it('исключение вне ассерта помечается именем ошибки', async () => {
    const { run } = createSandbox()

    const result = (await run(`
      var __tr = globalThis.__tr
      test('ошибка', function () { return null.x })
      return __tr.run()
    `)) as { status: string; tests: Array<{ errorName?: string }> }

    expect(result.status).toBe('failed')
    expect(result.tests[0].errorName).toBe('TypeError')
  })

  it('скрытый кейс не раскрывает данные', async () => {
    const { run } = createSandbox()

    const result = (await run(`
      var __tr = globalThis.__tr
      function entry(a) { return a }
      __tr.registerCase(
        { name: 'скрытый', hidden: true, entryName: 'entry', compare: 'deep', args: [1], expectedValue: 2 },
        function () { return entry },
      )
      return __tr.run()
    `)) as { tests: Array<{ input?: string; expected?: string; actual?: string }> }

    expect(result.tests[0].input).toBeUndefined()
    expect(result.tests[0].expected).toBeUndefined()
    expect(result.tests[0].actual).toBeUndefined()
  })

  it('отсутствие функции решения даёт понятное сообщение', async () => {
    const { run } = createSandbox()

    const result = (await run(`
      var __tr = globalThis.__tr
      __tr.registerCase(
        { name: 'нет функции', hidden: false, entryName: 'missing', compare: 'deep', args: [], expectedValue: 1 },
        function () { return undefined },
      )
      return __tr.run()
    `)) as { tests: Array<{ message?: string }> }

    expect(result.tests[0].message).toContain('Не найдена функция missing')
  })

  it('исключение из таймера доходит до теста', async () => {
    const { run } = createSandbox()

    const result = (await run(`
      var __tr = globalThis.__tr
      test('таймер падает', function () {
        setTimeout(function () { throw new Error('из таймера') }, 10)
        return __clock.runAll()
      })
      return __tr.run()
    `)) as { status: string; tests: Array<{ message?: string }> }

    expect(result.status).toBe('failed')
    expect(result.tests[0].message).toBe('из таймера')
  })
})

describe('харнесс: перехват консоли', () => {
  it('собирает вывод и сериализует объекты', async () => {
    const { run } = createSandbox()

    const result = (await run(`
      var __tr = globalThis.__tr
      console.log('строка', { a: 1 })
      console.warn('внимание')
      console.error('беда')
      test('пусто', function () {})
      return __tr.run()
    `)) as { consoleOutput: string[] }

    expect(result.consoleOutput).toEqual([
      'строка { a: 1 }',
      '[warn] внимание',
      '[error] беда',
    ])
  })

  it('вывод обрезается по количеству строк', async () => {
    const { run } = createSandbox()

    const result = (await run(`
      var __tr = globalThis.__tr
      for (var i = 0; i < 500; i++) console.log(i)
      test('пусто', function () {})
      return __tr.run()
    `)) as { consoleOutput: string[] }

    expect(result.consoleOutput.length).toBeLessThanOrEqual(201)
    expect(result.consoleOutput[result.consoleOutput.length - 1]).toBe('… вывод обрезан')
  })

  it('сравнение вывода с эталоном нормализует пробелы', () => {
    const { api } = createSandbox()
    expect(api.normalizeOutput('  a  \n\nb \n')).toBe('  a\n\nb')
  })
})

describe('харнесс: AbortController', () => {
  it('доступен в песочнице и уведомляет подписчиков', async () => {
    const { run } = createSandbox()

    const result = (await run(`
      var __tr = globalThis.__tr
      test('отмена', function () {
        var controller = new AbortController()
        var fired = 0
        controller.signal.addEventListener('abort', function () { fired += 1 })

        expect(controller.signal.aborted).toBe(false)
        controller.abort()

        expect(controller.signal.aborted).toBe(true)
        expect(fired).toBe(1)
        expect(controller.signal.reason.name).toBe('AbortError')

        // Повторная отмена ничего не меняет.
        controller.abort()
        expect(fired).toBe(1)
      })
      return __tr.run()
    `)) as { status: string }

    expect(result.status).toBe('passed')
  })
})

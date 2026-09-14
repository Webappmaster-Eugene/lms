/*
 * Рантайм тренажёра: тест-раннер, ассерты, управляемые таймеры, перехват консоли.
 *
 * Этот файл НЕ импортируется как модуль. Он читается как текст скриптом
 * scripts/build-harness.mjs и вшивается строкой в harness-source.generated.ts,
 * после чего исполняется в трёх хостах:
 *   - sandboxed-iframe в браузере  (кнопка «Запустить»)
 *   - isolated-vm на сервере       (кнопка «Отправить», вердикт для XP)
 *   - node:vm в vitest             (проверка каталога задач)
 *
 * Отсюда жёсткие ограничения:
 *   1. Никаких import/export и обращений к Node/DOM API.
 *   2. Никаких реальных таймеров: в isolated-vm нет event loop, setTimeout там не
 *      существует. Поэтому часы подменяются ВСЕГДА, во всех хостах — только так
 *      вердикт браузера и вердикт сервера совпадают.
 *   3. Всё общение с внешним миром — через globalThis.__tr.
 */
;(function (global) {
  'use strict'

  var MAX_CONSOLE_LINES = 200
  var MAX_CONSOLE_CHARS = 10240
  var MAX_SERIALIZED = 600
  var MAX_DEPTH = 6
  var MAX_ITEMS = 40
  // Фиксированная точка отсчёта: Date.now() внутри песочницы детерминирован,
  // иначе тесты на TTL и throttle плавали бы от запуска к запуску.
  var EPOCH = 1700000000000
  var TIMER_GUARD = 100000

  var RealDate = global.Date
  var realNow = RealDate.now.bind(RealDate)

  // ──────────────────────────────────────────────────────────────
  // Сериализация значений для отчёта
  // ──────────────────────────────────────────────────────────────

  function typeTag(value) {
    return Object.prototype.toString.call(value).slice(8, -1)
  }

  function serialize(value) {
    var out = serializeAt(value, 0, [])
    return out.length > MAX_SERIALIZED ? out.slice(0, MAX_SERIALIZED) + '… (обрезано)' : out
  }

  function serializeAt(value, depth, seen) {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'

    var type = typeof value
    if (type === 'string') return JSON.stringify(value)
    if (type === 'number') {
      if (Number.isNaN(value)) return 'NaN'
      if (value === 0 && 1 / value === -Infinity) return '-0'
      return String(value)
    }
    if (type === 'boolean') return String(value)
    if (type === 'bigint') return String(value) + 'n'
    if (type === 'symbol') return String(value)
    if (type === 'function') {
      return '[Function: ' + (value.name || 'anonymous') + ']'
    }

    if (seen.indexOf(value) !== -1) return '[Circular]'
    if (depth > MAX_DEPTH) return '[…]'

    var tag = typeTag(value)
    if (tag === 'Date') return 'Date(' + value.toISOString() + ')'
    if (tag === 'RegExp') return String(value)
    if (tag === 'Error') return value.name + '(' + JSON.stringify(value.message) + ')'
    if (value instanceof Error) return value.name + '(' + JSON.stringify(value.message) + ')'

    var next = seen.concat([value])
    var parts = []
    var i

    if (Array.isArray(value)) {
      for (i = 0; i < value.length && i < MAX_ITEMS; i++) {
        parts.push(i in value ? serializeAt(value[i], depth + 1, next) : '<пусто>')
      }
      if (value.length > MAX_ITEMS) parts.push('… ещё ' + (value.length - MAX_ITEMS))
      return '[' + parts.join(', ') + ']'
    }

    if (tag === 'Map') {
      var mapCount = 0
      value.forEach(function (v, k) {
        if (mapCount < MAX_ITEMS) {
          parts.push(serializeAt(k, depth + 1, next) + ' => ' + serializeAt(v, depth + 1, next))
        }
        mapCount++
      })
      return 'Map(' + value.size + ') {' + (parts.length ? ' ' + parts.join(', ') + ' ' : '') + '}'
    }

    if (tag === 'Set') {
      var setCount = 0
      value.forEach(function (v) {
        if (setCount < MAX_ITEMS) parts.push(serializeAt(v, depth + 1, next))
        setCount++
      })
      return 'Set(' + value.size + ') {' + (parts.length ? ' ' + parts.join(', ') + ' ' : '') + '}'
    }

    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      for (i = 0; i < value.length && i < MAX_ITEMS; i++) parts.push(String(value[i]))
      return tag + '(' + value.length + ') [' + parts.join(', ') + ']'
    }

    if (typeof Promise === 'function' && value instanceof Promise) return 'Promise { … }'

    var keys = Object.keys(value)
    for (i = 0; i < keys.length && i < MAX_ITEMS; i++) {
      parts.push(formatKey(keys[i]) + ': ' + serializeAt(value[keys[i]], depth + 1, next))
    }
    if (keys.length > MAX_ITEMS) parts.push('… ещё ' + (keys.length - MAX_ITEMS))

    var body = parts.length ? '{ ' + parts.join(', ') + ' }' : '{}'
    var ctor = value.constructor
    var name = ctor && ctor.name && ctor.name !== 'Object' ? ctor.name : ''
    if (Object.getPrototypeOf(value) === null) name = '[Object: null prototype]'
    return name ? name + ' ' + body : body
  }

  function formatKey(key) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key)
  }

  // ──────────────────────────────────────────────────────────────
  // Структурное сравнение
  // ──────────────────────────────────────────────────────────────

  function deepEqual(a, b) {
    return equalAt(a, b, [], [])
  }

  function equalAt(a, b, seenA, seenB) {
    if (Object.is(a, b)) return true

    // Object.is различает +0 и -0, а для структурного сравнения это перебор.
    if (typeof a === 'number' && typeof b === 'number' && a === 0 && b === 0) return true

    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false

    var tagA = typeTag(a)
    if (tagA !== typeTag(b)) return false

    var indexA = seenA.indexOf(a)
    if (indexA !== -1) return seenB[indexA] === b
    var nextA = seenA.concat([a])
    var nextB = seenB.concat([b])

    if (tagA === 'Date') return a.getTime() === b.getTime()
    if (tagA === 'RegExp') return String(a) === String(b)
    if (a instanceof Error && b instanceof Error) {
      return a.name === b.name && a.message === b.message
    }

    if (Array.isArray(a)) {
      if (a.length !== b.length) return false
      for (var i = 0; i < a.length; i++) {
        if (!equalAt(a[i], b[i], nextA, nextB)) return false
      }
      return true
    }

    if (tagA === 'Map') {
      if (a.size !== b.size) return false
      var mapKeys = Array.from(a.keys())
      var bKeys = Array.from(b.keys())
      for (var m = 0; m < mapKeys.length; m++) {
        var key = mapKeys[m]
        // Ключи-объекты сравниваем структурно: ищем соответствие среди ключей b.
        if (b.has(key)) {
          if (!equalAt(a.get(key), b.get(key), nextA, nextB)) return false
          continue
        }
        var matched = false
        for (var bk = 0; bk < bKeys.length; bk++) {
          if (equalAt(key, bKeys[bk], nextA, nextB) && equalAt(a.get(key), b.get(bKeys[bk]), nextA, nextB)) {
            matched = true
            break
          }
        }
        if (!matched) return false
      }
      return true
    }

    if (tagA === 'Set') {
      if (a.size !== b.size) return false
      var aValues = Array.from(a.values())
      var bValues = Array.from(b.values())
      var used = new Array(bValues.length)
      for (var s = 0; s < aValues.length; s++) {
        var found = false
        for (var t = 0; t < bValues.length; t++) {
          if (!used[t] && equalAt(aValues[s], bValues[t], nextA, nextB)) {
            used[t] = true
            found = true
            break
          }
        }
        if (!found) return false
      }
      return true
    }

    if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
      if (a.length !== b.length) return false
      for (var v = 0; v < a.length; v++) if (a[v] !== b[v]) return false
      return true
    }

    var keysA = Object.keys(a)
    var keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    for (var k = 0; k < keysA.length; k++) {
      if (!Object.prototype.hasOwnProperty.call(b, keysA[k])) return false
      if (!equalAt(a[keysA[k]], b[keysA[k]], nextA, nextB)) return false
    }
    return true
  }

  function sortedCopy(value) {
    return value.slice().sort(function (x, y) {
      var sx = serializeAt(x, 0, [])
      var sy = serializeAt(y, 0, [])
      return sx < sy ? -1 : sx > sy ? 1 : 0
    })
  }

  function compareValues(actual, expected, mode) {
    if (mode === 'strict') return Object.is(actual, expected)
    if (mode === 'approx') {
      if (typeof actual !== 'number' || typeof expected !== 'number') return deepEqual(actual, expected)
      if (Number.isNaN(actual) && Number.isNaN(expected)) return true
      return Math.abs(actual - expected) < 1e-9
    }
    if (mode === 'sorted' || mode === 'set') {
      if (!Array.isArray(actual) || !Array.isArray(expected)) return false
      if (mode === 'set') {
        if (actual.length !== expected.length) return false
        return deepEqual(sortedCopy(actual), sortedCopy(expected))
      }
      return deepEqual(sortedCopy(actual), sortedCopy(expected))
    }
    return deepEqual(actual, expected)
  }

  // ──────────────────────────────────────────────────────────────
  // Ошибка ассерта
  // ──────────────────────────────────────────────────────────────

  function AssertionError(message, expected, actual, hasValues) {
    var error = new Error(message)
    error.name = 'AssertionError'
    error.__assertion = true
    error.__expected = expected
    error.__actual = actual
    error.__hasValues = hasValues !== false
    return error
  }

  function fail(message, expected, actual, hasValues) {
    throw AssertionError(message, expected, actual, hasValues)
  }

  // ──────────────────────────────────────────────────────────────
  // Управляемые часы
  // ──────────────────────────────────────────────────────────────

  function createClock() {
    var now = EPOCH
    var seq = 0
    var timers = []
    var timerErrors = []

    function schedule(fn, delay, args, isInterval) {
      if (typeof fn !== 'function') {
        throw new TypeError('Первым аргументом таймера должна быть функция')
      }
      var ms = Number(delay)
      if (!Number.isFinite(ms) || ms < 0) ms = 0
      ms = Math.floor(ms)
      var id = ++seq
      timers.push({
        id: id,
        at: now + ms,
        fn: fn,
        args: args,
        interval: isInterval ? Math.max(1, ms) : 0,
      })
      return id
    }

    function clear(id) {
      for (var i = 0; i < timers.length; i++) {
        if (timers[i].id === id) {
          timers.splice(i, 1)
          return
        }
      }
    }

    function drain(hops) {
      var count = typeof hops === 'number' ? hops : 16
      var chain = Promise.resolve()
      for (var i = 0; i < count; i++) chain = chain.then(noop)
      return chain
    }

    function noop() {}

    function nextDue(limit) {
      var best = null
      for (var i = 0; i < timers.length; i++) {
        var t = timers[i]
        if (t.at > limit) continue
        if (!best || t.at < best.at || (t.at === best.at && t.id < best.id)) best = t
      }
      return best
    }

    function advanceTo(target) {
      var guard = 0
      function step() {
        var timer = nextDue(target)
        if (!timer) {
          now = Math.max(now, target)
          return drain()
        }
        if (++guard > TIMER_GUARD) {
          return Promise.reject(new Error('Слишком много срабатываний таймеров — похоже на бесконечный интервал'))
        }
        now = timer.at
        if (timer.interval) {
          timer.at = now + timer.interval
        } else {
          clear(timer.id)
        }
        try {
          timer.fn.apply(undefined, timer.args)
        } catch (err) {
          timerErrors.push(err)
        }
        return drain().then(step)
      }
      return drain().then(step)
    }

    var clock = {
      /** Текущее виртуальное время (мс с эпохи). */
      now: function () {
        return now
      },
      /** Промотать виртуальное время на `ms` вперёд, выполнив все сработавшие таймеры. */
      tick: function (ms) {
        var delta = Number(ms)
        if (!Number.isFinite(delta) || delta < 0) delta = 0
        return advanceTo(now + Math.floor(delta))
      },
      /**
       * Выполнить все запланированные таймеры (для интервалов — не более `maxMs`
       * виртуальных мс).
       *
       * Перед каждой проверкой очередь микрозадач прокручивается, а пустая
       * очередь таймеров подтверждается дважды. Иначе цепочка вида
       * «таймер → .then → .then → следующий setTimeout» обрывалась бы на
       * полпути: в момент проверки следующий таймер ещё не запланирован, и
       * runAll завершался, оставив промис висеть навсегда.
       */
      runAll: function (maxMs) {
        var limit = typeof maxMs === 'number' ? maxMs : 60000
        var deadline = now + limit
        var rounds = 0

        function step(emptyChecks) {
          if (++rounds > TIMER_GUARD) {
            return Promise.reject(
              new Error('Слишком много таймеров — похоже на бесконечно планирующую себя задачу'),
            )
          }

          return drain(32).then(function () {
            var nearest = null
            for (var i = 0; i < timers.length; i++) {
              var timer = timers[i]
              if (timer.at > deadline) continue
              if (!nearest || timer.at < nearest.at || (timer.at === nearest.at && timer.id < nearest.id)) {
                nearest = timer
              }
            }

            if (!nearest) {
              // Подтверждаем пустоту ещё раз: следующий таймер мог не успеть
              // запланироваться за прошлый прокрут микрозадач.
              return emptyChecks >= 1 ? undefined : step(emptyChecks + 1)
            }

            return advanceTo(nearest.at).then(function () {
              return step(0)
            })
          })
        }

        return step(0)
      },
      /** Дать микрозадачам провернуться, не двигая время. */
      flush: function (hops) {
        return drain(hops)
      },
      /** Количество запланированных таймеров — удобно для проверки «всё очищено». */
      pending: function () {
        return timers.length
      },
      takeErrors: function () {
        var taken = timerErrors
        timerErrors = []
        return taken
      },
      reset: function () {
        now = EPOCH
        timers = []
        timerErrors = []
      },
    }

    function install() {
      global.setTimeout = function (fn, delay) {
        return schedule(fn, delay, Array.prototype.slice.call(arguments, 2), false)
      }
      global.setInterval = function (fn, delay) {
        return schedule(fn, delay, Array.prototype.slice.call(arguments, 2), true)
      }
      global.setImmediate = function (fn) {
        return schedule(fn, 0, Array.prototype.slice.call(arguments, 1), false)
      }
      global.clearTimeout = clear
      global.clearInterval = clear
      global.clearImmediate = clear
      global.queueMicrotask = function (fn) {
        Promise.resolve().then(fn)
      }

      function FakeDate() {
        if (arguments.length === 0) return new RealDate(now)
        if (arguments.length === 1) return new RealDate(arguments[0])
        return new RealDate(
          arguments[0], arguments[1], arguments[2], arguments[3],
          arguments[4], arguments[5], arguments[6],
        )
      }
      // Наследуем прототип, чтобы `new Date() instanceof Date` оставалось true.
      FakeDate.prototype = RealDate.prototype
      FakeDate.now = function () {
        return now
      }
      FakeDate.parse = RealDate.parse
      FakeDate.UTC = RealDate.UTC
      global.Date = FakeDate

      if (global.performance && typeof global.performance === 'object') {
        try {
          global.performance.now = function () {
            return now - EPOCH
          }
        } catch (err) {
          // performance.now может быть неперезаписываемым — не критично
        }
      } else {
        global.performance = {
          now: function () {
            return now - EPOCH
          },
        }
      }
    }

    install()
    return clock
  }

  // ──────────────────────────────────────────────────────────────
  // AbortController
  // ──────────────────────────────────────────────────────────────

  /**
   * Своя реализация AbortController — ставится ВСЕГДА, даже если в хосте есть
   * встроенная.
   *
   * В V8-изоляте и в node:vm этого API нет вовсе, а в браузере оно есть. Если
   * положиться на встроенное там, где оно доступно, вердикт браузера и вердикт
   * сервера могли бы разойтись на краевых случаях. Одна реализация на все три
   * хоста снимает этот риск.
   */
  function installAbortController() {
    function AbortSignalShim() {
      this.aborted = false
      this.reason = undefined
      this.onabort = null
      this._listeners = []
    }

    AbortSignalShim.prototype.addEventListener = function (type, listener) {
      if (type === 'abort' && typeof listener === 'function') this._listeners.push(listener)
    }

    AbortSignalShim.prototype.removeEventListener = function (type, listener) {
      if (type !== 'abort') return
      var index = this._listeners.indexOf(listener)
      if (index !== -1) this._listeners.splice(index, 1)
    }

    AbortSignalShim.prototype.throwIfAborted = function () {
      if (this.aborted) throw this.reason
    }

    AbortSignalShim.prototype._fire = function (reason) {
      if (this.aborted) return

      this.aborted = true
      this.reason = reason

      var event = { type: 'abort', target: this }
      if (typeof this.onabort === 'function') this.onabort(event)

      // Копия списка: обработчик вправе отписаться прямо во время рассылки.
      var listeners = this._listeners.slice()
      for (var i = 0; i < listeners.length; i++) {
        try {
          listeners[i](event)
        } catch (err) {
          // Упавший обработчик не должен мешать остальным.
        }
      }
    }

    function AbortControllerShim() {
      this.signal = new AbortSignalShim()
    }

    AbortControllerShim.prototype.abort = function (reason) {
      var error = reason
      if (error === undefined) {
        error = new Error('Операция прервана')
        error.name = 'AbortError'
      }
      this.signal._fire(error)
    }

    global.AbortController = AbortControllerShim
    global.AbortSignal = AbortSignalShim
  }

  // ──────────────────────────────────────────────────────────────
  // Перехват консоли
  // ──────────────────────────────────────────────────────────────

  var consoleLines = []
  var consoleChars = 0
  var consoleTruncated = false

  function captureConsole(prefix) {
    return function () {
      if (consoleLines.length >= MAX_CONSOLE_LINES || consoleChars >= MAX_CONSOLE_CHARS) {
        if (!consoleTruncated) {
          consoleTruncated = true
          consoleLines.push('… вывод обрезан')
        }
        return
      }
      var parts = []
      for (var i = 0; i < arguments.length; i++) {
        var arg = arguments[i]
        parts.push(typeof arg === 'string' ? arg : serialize(arg))
      }
      var line = (prefix || '') + parts.join(' ')
      consoleChars += line.length
      consoleLines.push(line)
    }
  }

  function installConsole() {
    var sandboxConsole = {
      log: captureConsole(''),
      info: captureConsole(''),
      debug: captureConsole(''),
      warn: captureConsole('[warn] '),
      error: captureConsole('[error] '),
      table: captureConsole(''),
      trace: captureConsole(''),
      dir: captureConsole(''),
      group: captureConsole(''),
      groupEnd: function () {},
      time: function () {},
      timeEnd: function () {},
      assert: function () {},
      count: function () {},
    }
    global.console = sandboxConsole
    // Диалоги блокируют весь фрейм и вешают песочницу.
    global.alert = function () {}
    global.prompt = function () {
      return null
    }
    global.confirm = function () {
      return false
    }
  }

  function normalizeOutput(text) {
    return String(text)
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(function (line) {
        return line.replace(/\s+$/, '')
      })
      .join('\n')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '')
  }

  // ──────────────────────────────────────────────────────────────
  // expect
  // ──────────────────────────────────────────────────────────────

  function describeCall(matcher) {
    return 'Ожидалось: ' + matcher
  }

  function makeExpect(actual, negated) {
    function check(condition, message, expected, actualValue, hasValues) {
      var ok = negated ? !condition : condition
      if (ok) return
      fail((negated ? 'НЕ ' : '') + message, expected, actualValue, hasValues)
    }

    var api = {
      toBe: function (expected) {
        check(Object.is(actual, expected), describeCall('строгое равенство (Object.is)'), expected, actual)
      },
      toEqual: function (expected) {
        check(deepEqual(actual, expected), describeCall('структурное равенство'), expected, actual)
      },
      toStrictEqual: function (expected) {
        check(deepEqual(actual, expected), describeCall('структурное равенство'), expected, actual)
      },
      toBeCloseTo: function (expected, precision) {
        var digits = typeof precision === 'number' ? precision : 9
        var ok =
          typeof actual === 'number' &&
          typeof expected === 'number' &&
          Math.abs(actual - expected) < Math.pow(10, -digits) / 2
        check(ok, describeCall('число с точностью до ' + digits + ' знаков'), expected, actual)
      },
      toBeTruthy: function () {
        check(Boolean(actual), describeCall('истинное значение'), true, actual)
      },
      toBeFalsy: function () {
        check(!actual, describeCall('ложное значение'), false, actual)
      },
      toBeNull: function () {
        check(actual === null, describeCall('null'), null, actual)
      },
      toBeUndefined: function () {
        check(actual === undefined, describeCall('undefined'), undefined, actual)
      },
      toBeDefined: function () {
        check(actual !== undefined, describeCall('определённое значение'), 'не undefined', actual)
      },
      toBeNaN: function () {
        check(Number.isNaN(actual), describeCall('NaN'), NaN, actual)
      },
      toBeInstanceOf: function (ctor) {
        check(
          actual instanceof ctor,
          describeCall('экземпляр ' + (ctor && ctor.name ? ctor.name : String(ctor))),
          ctor && ctor.name,
          actual,
        )
      },
      toBeTypeOf: function (type) {
        check(typeof actual === type, describeCall('typeof === ' + type), type, typeof actual)
      },
      toHaveLength: function (length) {
        var got = actual == null ? undefined : actual.length
        check(got === length, describeCall('длина ' + length), length, got)
      },
      toHaveProperty: function (key, value) {
        var has = actual != null && key in Object(actual)
        if (arguments.length < 2) {
          check(has, describeCall('наличие свойства ' + formatKey(String(key))), key, actual)
          return
        }
        check(
          has && deepEqual(actual[key], value),
          describeCall('свойство ' + formatKey(String(key)) + ' равно заданному'),
          value,
          has ? actual[key] : undefined,
        )
      },
      toContain: function (item) {
        var ok = false
        if (typeof actual === 'string') ok = actual.indexOf(item) !== -1
        else if (Array.isArray(actual)) {
          for (var i = 0; i < actual.length; i++) {
            if (Object.is(actual[i], item)) {
              ok = true
              break
            }
          }
        } else if (actual && typeof actual.has === 'function') ok = actual.has(item)
        check(ok, describeCall('содержит значение'), item, actual)
      },
      toContainEqual: function (item) {
        var ok = Array.isArray(actual)
          ? actual.some(function (candidate) {
              return deepEqual(candidate, item)
            })
          : false
        check(ok, describeCall('содержит структурно равное значение'), item, actual)
      },
      toThrow: function (expected) {
        if (typeof actual !== 'function') {
          fail('toThrow применяется к функции, а получено ' + serialize(actual), 'функция', actual)
        }
        var thrown = null
        var didThrow = false
        try {
          actual()
        } catch (err) {
          didThrow = true
          thrown = err
        }
        if (negated) {
          if (didThrow) {
            fail('Ожидалось: функция не бросает исключение', 'без исключения', thrown)
          }
          return
        }
        if (!didThrow) {
          fail(describeCall('функция бросает исключение'), 'исключение', 'вызов завершился без ошибки')
        }
        if (expected === undefined) return
        var message = thrown && thrown.message ? String(thrown.message) : String(thrown)
        var name = thrown && thrown.name ? thrown.name : ''
        if (typeof expected === 'string') {
          if (message.indexOf(expected) === -1) {
            fail('Ожидалось: сообщение содержит заданную подстроку', expected, message)
          }
          return
        }
        if (expected instanceof RegExp) {
          if (!expected.test(message)) {
            fail('Ожидалось: сообщение соответствует шаблону', String(expected), message)
          }
          return
        }
        if (typeof expected === 'function') {
          if (!(thrown instanceof expected)) {
            fail('Ожидалось: исключение типа ' + (expected.name || 'заданного'), expected.name, name)
          }
        }
      },
    }

    api.resolves = {
      toBe: function (expected) {
        return Promise.resolve(actual).then(function (value) {
          makeExpect(value, negated).toBe(expected)
        })
      },
      toEqual: function (expected) {
        return Promise.resolve(actual).then(function (value) {
          makeExpect(value, negated).toEqual(expected)
        })
      },
      toBeTruthy: function () {
        return Promise.resolve(actual).then(function (value) {
          makeExpect(value, negated).toBeTruthy()
        })
      },
    }

    api.rejects = {
      toThrow: function (expected) {
        return Promise.resolve(actual).then(
          function (value) {
            if (negated) return
            fail(describeCall('промис отклоняется'), 'отклонение', 'промис успешно разрешился в ' + serialize(value))
          },
          function (err) {
            if (negated) {
              fail('Ожидалось: промис не отклоняется', 'успешное разрешение', err)
            }
            if (expected === undefined) return
            makeExpect(function () {
              throw err
            }, false).toThrow(expected)
          },
        )
      },
    }

    if (!negated) api.not = makeExpect(actual, true)
    return api
  }

  function expect(actual) {
    return makeExpect(actual, false)
  }

  // ──────────────────────────────────────────────────────────────
  // Реестр тестов и прогон
  // ──────────────────────────────────────────────────────────────

  var tests = []
  var lineBias = 0
  var userStart = 1
  var userEnd = Number.MAX_SAFE_INTEGER

  function register(meta, fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('Тест «' + meta.name + '» должен получать функцию')
    }
    tests.push({
      name: String(meta.name || 'Тест ' + (tests.length + 1)),
      hidden: meta.hidden === true,
      input: meta.input,
      expected: meta.expected,
      fn: fn,
    })
  }

  function test(name, fn) {
    register({ name: name }, fn)
  }

  function rawLine(error) {
    var stack = error && error.stack ? String(error.stack) : ''
    var match = /<anonymous>:(\d+):(\d+)/.exec(stack)
    if (!match) match = /(?:^|[^\w])(?:eval|Function|trainer-sandbox)[^\n]*?:(\d+):(\d+)/.exec(stack)
    if (!match) return null
    return Number(match[1])
  }

  function userLine(error) {
    var raw = rawLine(error)
    if (raw === null) return undefined
    var absolute = raw - lineBias
    if (absolute < userStart || absolute > userEnd) return undefined
    return absolute - userStart + 1
  }

  function describeError(outcome, error, hidden) {
    if (error && error.__assertion) {
      outcome.message = error.message
      // У скрытого кейса значения не раскрываются даже в сообщении об ошибке:
      // иначе весь смысл скрытого теста терялся бы при первом же падении.
      if (error.__hasValues && !hidden) {
        outcome.expected = serialize(error.__expected)
        outcome.actual = serialize(error.__actual)
      }
    } else if (error instanceof Error) {
      outcome.errorName = error.name
      outcome.message = error.message
    } else {
      outcome.errorName = 'Throw'
      outcome.message = 'Брошено значение: ' + serialize(error)
    }
    var line = userLine(error)
    if (line !== undefined) outcome.line = line
  }

  function runSingle(spec) {
    var startedAt = realNow()
    var outcome = { name: spec.name, hidden: spec.hidden, passed: false, durationMs: 0 }
    if (!spec.hidden) {
      if (spec.input !== undefined) outcome.input = spec.input
      if (spec.expected !== undefined) outcome.expected = spec.expected
    }

    return Promise.resolve()
      .then(function () {
        return spec.fn()
      })
      .then(function () {
        var timerErrors = clock.takeErrors()
        if (timerErrors.length) throw timerErrors[0]
        outcome.passed = true
      })
      .catch(function (error) {
        clock.takeErrors()
        outcome.passed = false
        describeError(outcome, error, spec.hidden)
      })
      .then(function () {
        outcome.durationMs = realNow() - startedAt
        return outcome
      })
  }

  function run() {
    var startedAt = realNow()
    var outcomes = []

    function step(index) {
      if (index >= tests.length) return Promise.resolve()
      return runSingle(tests[index]).then(function (outcome) {
        outcomes.push(outcome)
        return step(index + 1)
      })
    }

    return step(0).then(function () {
      var passedCount = outcomes.filter(function (o) {
        return o.passed
      }).length
      return {
        status: tests.length === 0 ? 'error' : passedCount === tests.length ? 'passed' : 'failed',
        tests: outcomes,
        passedCount: passedCount,
        totalCount: outcomes.length,
        consoleOutput: consoleLines.slice(),
        error: tests.length === 0 ? 'У задачи нет ни одного теста' : undefined,
        totalMs: realNow() - startedAt,
      }
    })
  }

  /** Аварийный результат: код не дошёл до прогона тестов. */
  function abort(status, error) {
    var outcome = {
      status: status,
      tests: [],
      passedCount: 0,
      totalCount: 0,
      consoleOutput: consoleLines.slice(),
      totalMs: 0,
    }
    if (error && error.__assertion) {
      outcome.error = error.message
    } else if (error instanceof Error) {
      outcome.error = error.name + ': ' + error.message
    } else {
      outcome.error = String(error)
    }
    var line = userLine(error)
    if (line !== undefined) outcome.errorLine = line
    return outcome
  }

  /** Сравнение перехваченного вывода с эталоном — режим checkMode: 'stdout'. */
  function expectStdout(expected) {
    var actual = normalizeOutput(consoleLines.join('\n'))
    var wanted = normalizeOutput(expected)
    if (actual !== wanted) {
      fail('Вывод не совпадает с ожидаемым', wanted, actual)
    }
  }

  /** Человекочитаемая запись вызова: debounce(1, 2). */
  function formatCall(entryName, args) {
    var parts = []
    for (var i = 0; i < args.length; i++) parts.push(serialize(args[i]))
    return entryName + '(' + parts.join(', ') + ')'
  }

  /**
   * Регистрация табличного тест-кейса: вызвать `entry` с аргументами и сравнить
   * результат. Строки input/expected для отчёта считаются здесь, чтобы у
   * генератора кода не было своей копии сериализатора.
   */
  function registerCase(meta, getEntry) {
    var hidden = meta.hidden === true
    register(
      {
        name: meta.name,
        hidden: hidden,
        input: hidden ? undefined : formatCall(meta.entryName, meta.args),
        expected: hidden ? undefined : serialize(meta.expectedValue),
      },
      function () {
        var entry = getEntry()
        if (typeof entry !== 'function') {
          fail(
            'Не найдена функция ' + meta.entryName + '. Объявите её в решении.',
            'функция ' + meta.entryName,
            entry,
            true,
          )
        }
        return Promise.resolve(entry.apply(undefined, meta.args)).then(function (result) {
          if (!compareValues(result, meta.expectedValue, meta.compare)) {
            fail('Результат не совпадает с ожидаемым', meta.expectedValue, result)
          }
        })
      },
    )
  }

  installConsole()
  installAbortController()
  var clock = createClock()

  global.__tr = {
    expect: expect,
    test: test,
    it: test,
    clock: clock,
    run: run,
    abort: abort,
    fail: fail,
    register: register,
    registerCase: registerCase,
    expectStdout: expectStdout,
    deepEqual: deepEqual,
    compareValues: compareValues,
    serialize: serialize,
    normalizeOutput: normalizeOutput,
    formatCall: formatCall,
    rawLine: rawLine,
    setLineBias: function (bias) {
      lineBias = bias
    },
    setUserRange: function (start, end) {
      userStart = start
      userEnd = end
    },
  }

  global.expect = expect
  global.test = test
  global.it = test
  global.__clock = clock
})(typeof globalThis !== 'undefined' ? globalThis : this)

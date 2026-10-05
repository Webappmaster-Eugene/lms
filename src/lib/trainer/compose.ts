/**
 * Сборка исполняемого скрипта песочницы.
 *
 * Результат — тело функции (без обёртки), которое каждый хост запускает по-своему:
 *   - браузер:      new Function(body)      внутри sandboxed-iframe
 *   - isolated-vm:  (function(){ body })()  внутри изолята
 *   - node:vm:      то же самое в тестах
 *
 * Тестовые замыкания видят объявления решения. Служебный запуск и итоговый
 * результат остаются снаружи отдельно скомпилированной функции решения.
 */

import { HARNESS_SOURCE } from './harness-source.generated'
import type { TrainerCaseSpec, TrainerExecSpec } from './types'

export type ComposedScript = {
  /** Тело функции для запуска в хосте. */
  source: string
  /** Отдельная проверка синтаксиса без выполнения решения. */
  validationSource: string
  /** Номер строки, с которой начинается код пользователя (1-based). */
  userStartLine: number
  /** Номер последней строки кода пользователя (1-based). */
  userEndLine: number
}

/**
 * Генерирует код регистрации табличного кейса.
 *
 * `getEntry` возвращает функцию пользователя по имени. Проверка через `typeof`
 * обязательна: если пользователь её не объявил, обращение к необъявленному
 * идентификатору бросило бы ReferenceError мимо нашего сообщения.
 */
function renderCase(spec: TrainerCaseSpec, entryName: string, index: number): string {
  const meta = [
    `name: ${JSON.stringify(spec.name || `Кейс ${index + 1}`)}`,
    `hidden: ${spec.hidden ? 'true' : 'false'}`,
    `entryName: ${JSON.stringify(entryName)}`,
    `compare: ${JSON.stringify(spec.compare)}`,
    `args: [${spec.argsCode}]`,
    `expectedValue: (${spec.expectedCode})`,
  ].join(', ')

  return (
    `__tr.registerCase({ ${meta} }, ` +
    `function () { return typeof ${entryName} === 'undefined' ? undefined : ${entryName} });`
  )
}

/** Единственный «тест» для легаси-режима сравнения вывода. */
function renderStdoutCase(expectedOutput: string): string {
  return (
    `__tr.register({ name: 'Вывод программы совпадает с ожидаемым' }, ` +
    `function () { __tr.expectStdout(${JSON.stringify(expectedOutput)}) });`
  )
}

function splitLines(text: string): string[] {
  // Пустая строка всё равно занимает одну строку в скрипте — иначе поедут смещения.
  return text.replace(/\r\n/g, '\n').split('\n')
}

/** Решение и служебный результат исполняются в разных лексических областях. */
export function composeScript(spec: TrainerExecSpec): ComposedScript {
  const userLines = splitLines(spec.userCode)
  const tests = spec.checkMode === 'stdout'
    ? renderStdoutCase(spec.expectedOutput ?? '')
    : [...spec.cases.map((item, index) => renderCase(item, spec.entryName, index)), spec.testCode]
      .filter(part => part.trim()).join('\n')
  const aliases = [
    'Object', 'Function', 'Array', 'Number', 'String', 'Boolean', 'Symbol', 'BigInt',
    'Promise', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Error', 'TypeError',
    'RangeError', 'SyntaxError', 'Reflect', 'Math', 'JSON', 'Date', 'ArrayBuffer', 'DataView',
    'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
    'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'console', 'AbortController',
  ]
  const initializer = [
    "'use strict';",
    ...splitLines(spec.setupCode),
    '{',
    'const __tr = arguments[0];',
    'const test = __tr.test, it = __tr.it, expect = __tr.expect, __clock = __tr.clock;',
    ...aliases.map(name => `const ${name} = __tr.intrinsics.${name};`),
    '__tr.registerSuite(function () {',
    ...splitLines(tests),
    '});',
    '}',
  ]
  const userStartLine = initializer.length + 1
  initializer.push(...userLines)
  const userEndLine = initializer.length
  const validationSource = "'use strict';\n" + spec.userCode
  const source = [
    "'use strict';",
    `var __tr = ${HARNESS_SOURCE};`,
    `__tr.setUserRange(${userStartLine}, ${userEndLine});`,
    '__tr.setLineBias(2);',
    'var initialize;',
    'try {',
    `new Function(${JSON.stringify(validationSource)});`,
    `initialize = new Function(${JSON.stringify(initializer.join('\n'))});`,
    '} catch (error) { return __tr.abort("compile_error", error); }',
    'try {',
    'initialize(__tr.publicApi);',
    `return __tr.run(${spec.allowNoTests === true ? 'true' : ''});`,
    '} catch (error) { return __tr.abort("error", error); }',
  ].join('\n')
  return { source, userStartLine, userEndLine, validationSource }
}

/**
 * Пересчитывает номер строки из сообщения SyntaxError в номер строки кода
 * пользователя. Синтаксическую ошибку ловит хост ещё до запуска скрипта, когда
 * харнесс не создан и пересчитать смещение изнутри уже некому.
 */
export function mapCompileLine(
  rawLine: number | null,
  composed: ComposedScript,
  hostLineBias: number,
): number | undefined {
  if (rawLine === null) return undefined
  const absolute = rawLine - hostLineBias
  if (absolute < composed.userStartLine || absolute > composed.userEndLine) return undefined
  return absolute - composed.userStartLine + 1
}

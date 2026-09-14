/**
 * Сборка исполняемого скрипта песочницы.
 *
 * Результат — тело функции (без обёртки), которое каждый хост запускает по-своему:
 *   - браузер:      new Function(body)      внутри sandboxed-iframe
 *   - isolated-vm:  (function(){ body })()  внутри изолята
 *   - node:vm:      то же самое в тестах
 *
 * Порядок частей важен: код пользователя и тесты обязаны оказаться в ОДНОЙ
 * области видимости. Объявил `function debounce(){}` — тесты его видят, ровно
 * как на живом собеседовании. Поэтому никаких модулей и никаких отдельных
 * замыканий между ними.
 */

import { HARNESS_SOURCE } from './harness-source.generated'
import type { TrainerCaseSpec, TrainerExecSpec } from './types'

export type ComposedScript = {
  /** Тело функции для запуска в хосте. */
  source: string
  /** Номер строки, с которой начинается код пользователя (1-based). */
  userStartLine: number
  /** Номер последней строки кода пользователя (1-based). */
  userEndLine: number
}

/** Имена, которые харнесс кладёт в глобальную область песочницы. */
const RESERVED_GLOBALS = ['test', 'it', 'expect', '__clock', '__tr'] as const

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

/**
 * Собирает скрипт. Вызывается дважды: первый проход нужен, чтобы узнать
 * номера строк кода пользователя, второй — чтобы вшить их в `setUserRange`
 * ДО этого кода. Обе сборки дают одинаковое число строк, поэтому смещения,
 * посчитанные на первом проходе, верны и на втором.
 */
function build(spec: TrainerExecSpec, range: { start: number; end: number }): ComposedScript {
  const harnessLines = splitLines(HARNESS_SOURCE)
  const setupLines = splitLines(spec.setupCode)
  const userLines = splitLines(spec.userCode)

  const testSource =
    spec.checkMode === 'stdout'
      ? renderStdoutCase(spec.expectedOutput ?? '')
      : [
          ...spec.cases.map((testCase, index) => renderCase(testCase, spec.entryName, index)),
          spec.testCode,
        ]
          .filter((part) => part.trim().length > 0)
          .join('\n')

  const lines: string[] = []

  lines.push(...harnessLines)

  // Калибровка смещения строк. Хост может обернуть тело (new Function добавляет
  // две строки сверху), поэтому bias измеряется изнутри: бросаем ошибку на
  // заведомо известной строке и сравниваем с тем, что сказал стек.
  const calibrationLine = lines.length + 1
  lines.push(
    `;(function(){ try { throw new Error('calibrate') } catch (e) { ` +
      `var raw = globalThis.__tr.rawLine(e); ` +
      `globalThis.__tr.setLineBias(raw === null ? 0 : raw - ${calibrationLine}) } })();`,
  )

  lines.push(`;globalThis.__tr.setUserRange(${range.start}, ${range.end});`)
  lines.push('var __tr = globalThis.__tr;')
  lines.push('return (function () { try { return (function () {')

  lines.push(...setupLines)

  const userStartLine = lines.length + 1
  lines.push(...userLines)
  const userEndLine = lines.length

  lines.push(
    `if (typeof test !== 'function' || typeof expect !== 'function' || typeof __tr !== 'object') ` +
      `{ return globalThis.__tr.abort('error', new Error(` +
      `'Решение переопределяет служебные имена (${RESERVED_GLOBALS.join(', ')}) — тесты запустить нельзя')) }`,
  )

  lines.push(...splitLines(testSource))
  lines.push('return __tr.run();')
  lines.push('})(); } catch (e) { return globalThis.__tr.abort("error", e) } })();')

  return { source: lines.join('\n'), userStartLine, userEndLine }
}

/** Собирает исполняемый скрипт для переданной спецификации задачи. */
export function composeScript(spec: TrainerExecSpec): ComposedScript {
  const probe = build(spec, { start: 1, end: Number.MAX_SAFE_INTEGER })
  return build(spec, { start: probe.userStartLine, end: probe.userEndLine })
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

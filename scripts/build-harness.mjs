#!/usr/bin/env node
/**
 * Вшивает src/lib/trainer/harness.js строкой в harness-source.generated.ts.
 *
 * Зачем генерация, а не импорт: харнесс должен доехать до песочницы как ТЕКСТ,
 * байт в байт. Если бы он лежал в шаблонной строке внутри .ts, каждый обратный
 * слэш и бэктик пришлось бы экранировать вручную; если бы собирался через
 * Function.prototype.toString(), его мог бы переписать SWC при сборке Next.
 * JSON.stringify снимает оба риска: содержимое строки бандлеры не трогают.
 *
 * Запускается из pretest/prebuild. Тест tests/unit/trainer/harnessSource.test.ts
 * падает, если сгенерированный файл разошёлся с исходником.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'src/lib/trainer/harness.js')
const targetPath = path.join(root, 'src/lib/trainer/harness-source.generated.ts')

export function renderHarnessModule(harnessSource) {
  return `/* eslint-disable */
/**
 * СГЕНЕРИРОВАННЫЙ ФАЙЛ — не редактировать вручную.
 * Источник: src/lib/trainer/harness.js
 * Команда:  node scripts/build-harness.mjs
 */

export const HARNESS_SOURCE: string = ${JSON.stringify(harnessSource)}

/** Число строк в харнессе — нужно для пересчёта номеров строк в отчёте. */
export const HARNESS_LINE_COUNT: number = ${harnessSource.split('\n').length}
`
}

export function readHarnessSource() {
  return readFileSync(sourcePath, 'utf8')
}

export function readGeneratedModule() {
  try {
    return readFileSync(targetPath, 'utf8')
  } catch {
    return null
  }
}

function main() {
  const harnessSource = readHarnessSource()
  const next = renderHarnessModule(harnessSource)
  if (readGeneratedModule() === next) {
    process.stdout.write('harness-source.generated.ts уже актуален\n')
    return
  }
  writeFileSync(targetPath, next, 'utf8')
  process.stdout.write(`harness-source.generated.ts обновлён (${harnessSource.length} байт)\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}

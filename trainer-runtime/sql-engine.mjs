// Логика одного SQL-кейса поверх готового экземпляра PGlite. Класс PGlite сюда
// не импортируется: воркер берёт его из своего пакета, тесты LMS - из своего.

import { canonicalTable } from './sql-result.mjs'

// Вывод дат и чисел не должен зависеть от машины, на которой считали эталон.
export const SESSION_SQL = "SET TimeZone = 'UTC'; SET DateStyle = 'ISO, YMD'; SET IntervalStyle = 'postgres'; SET extra_float_digits = 0; SET client_min_messages = 'warning'"

/** Тождественные parsers: сравниваем текст Postgres, а не значения JavaScript. */
export async function rawParsers(db) {
  const { rows } = await db.query('select oid from pg_type')
  return Object.fromEntries(rows.map((row) => [row.oid, (value) => value]))
}

export async function prepareCase(db, setup) {
  await db.exec(SESSION_SQL)
  if (setup) await db.exec(setup)
  return rawParsers(db)
}

function lastTable(results) {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    if (results[index].fields.length > 0) return results[index]
  }
  return undefined
}

function lineAt(code, position) {
  if (!Number.isInteger(position) || position < 1) return undefined
  return code.slice(0, position - 1).split('\n').length
}

export function describeError(error, code) {
  const message = error instanceof Error ? error.message : 'Ошибка выполнения запроса'
  const line = lineAt(code, Number(error?.position))
  const hint = typeof error?.hint === 'string' && error.hint ? ` Подсказка Postgres: ${error.hint}` : ''
  return { error: `${line ? `Строка ${line}: ` : ''}${message}${hint}`.slice(0, 600), ...(line ? { line } : {}) }
}

/**
 * Выполняет решение и возвращает каноническую таблицу. Для задач на изменение
 * данных таблицу даёт проверочный запрос, а не последний оператор решения.
 */
export async function runSolutionCase(db, { code, check, ordered, parsers }) {
  let results
  try {
    results = await db.exec(code, { parsers, rowMode: 'array' })
  } catch (error) {
    return { status: 'error', ...describeError(error, code) }
  }
  let table = lastTable(results)
  if (check) {
    try {
      // На сервере незафиксированная транзакция пропадает вместе с сеансом: решение без COMMIT не засчитывается.
      await db.exec('ROLLBACK')
      table = lastTable(await db.exec(check, { parsers, rowMode: 'array' }))
    } catch (error) {
      return { status: 'error', error: `Проверочный запрос не выполнился: ${describeError(error, check).error}` }
    }
  }
  if (!table) return { status: 'empty' }
  try {
    return { status: 'ok', table: canonicalTable({ columns: table.fields.map((field) => field.name), types: table.fields.map((field) => field.dataTypeID), rows: table.rows }, { ordered }) }
  } catch (error) {
    return { status: 'error', error: error instanceof RangeError ? error.message : 'Не удалось прочитать результат запроса' }
  }
}

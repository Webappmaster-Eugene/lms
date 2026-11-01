// Каноническая текстовая таблица результата SQL. Её сравнивает gateway, её же
// генерирует каталог эталонов, поэтому модуль чистый и без зависимостей.

export const SQL_RESULT_LIMITS = Object.freeze({ rows: 200, columns: 20, cell: 120, preview: 600 })

const NUMERIC = 1700
const FLOATS = new Set([700, 701])
const BOOLEAN = 16

/** Короткая контрольная сумма: обрезанная ячейка и длинный результат всё равно сравниваются целиком. */
function digest(text) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

// Таблица выравнивается пробелами, поэтому значение, которое иначе совпало бы с другим
// (пробел по краю, пустая строка, текст NULL, разделитель столбцов), пишется литералом в кавычках.
const AMBIGUOUS = /^$|^\s|\s$|^'|\||^NULL$/

/** NUMERIC(10,2) и AVG дают хвостовые нули, которые не меняют ответ по смыслу. */
export function normalizeCell(value, typeId) {
  if (value === null || value === undefined) return 'NULL'
  let text = String(value)
  if (typeId === NUMERIC && /^-?\d+\.\d+$/.test(text)) text = text.replace(/0+$/, '').replace(/\.$/, '')
  if (FLOATS.has(typeId) && text === '-0') text = '0'
  if (typeId === BOOLEAN) text = text === 't' ? 'true' : text === 'f' ? 'false' : text
  text = text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
  if (AMBIGUOUS.test(text)) text = `'${text.replace(/'/g, "''")}'`
  const chars = Array.from(text)
  if (chars.length <= SQL_RESULT_LIMITS.cell) return text
  return `${chars.slice(0, SQL_RESULT_LIMITS.cell - 11).join('')}…#${digest(text)}`
}

function width(text) {
  return Array.from(text).length
}

function pad(text, size) {
  return text + ' '.repeat(Math.max(0, size - width(text)))
}

export function rowsLabel(count) {
  const tens = count % 100
  const ones = count % 10
  if (tens >= 11 && tens <= 14) return `${count} строк`
  if (ones === 1) return `${count} строка`
  if (ones >= 2 && ones <= 4) return `${count} строки`
  return `${count} строк`
}

function compareRows(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] < right[index]) return -1
    if (left[index] > right[index]) return 1
  }
  return 0
}

/**
 * @param {{ columns: string[], types: number[], rows: (string | null)[][] }} result
 * @param {{ ordered?: boolean }} [options]
 */
export function canonicalTable(result, options = {}) {
  if (result.columns.length > SQL_RESULT_LIMITS.columns) throw new RangeError(`В результате больше ${SQL_RESULT_LIMITS.columns} столбцов`)
  const columns = result.columns.map((name) => normalizeCell(name, 25))
  const rows = result.rows.map((row) => columns.map((_, index) => normalizeCell(row[index], result.types[index])))
  if (!options.ordered) rows.sort(compareRows)
  const shown = rows.slice(0, SQL_RESULT_LIMITS.rows)
  const widths = columns.map((name, index) => Math.max(width(name), ...shown.map((row) => width(row[index]))))
  const line = (cells) => ` ${cells.map((cell, index) => pad(cell, widths[index])).join(' | ')}`.trimEnd()
  // Строки сверх показанных тоже входят в сравнение через контрольную сумму.
  const footer = rows.length > shown.length ? `(показаны ${shown.length} из ${rowsLabel(rows.length)}, контрольная сумма ${digest(rows.map((row) => row.join('\u0000')).join('\n'))})` : `(${rowsLabel(rows.length)})`
  return [line(columns), widths.map((size) => '-'.repeat(size + 2)).join('+'), ...shown.map(line), footer].join('\n')
}

/** Короткая версия для полей «Ожидалось/Получено»: интерфейс обрезает их до 600 символов. */
export function previewTable(table, maxChars = SQL_RESULT_LIMITS.preview) {
  if (table.length <= maxChars) return table
  const lines = table.split('\n')
  const footer = lines.at(-1)
  const kept = lines.slice(0, 2)
  let size = kept.join('\n').length + footer.length + 4
  for (const row of lines.slice(2, -1)) {
    if (size + row.length + 1 > maxChars) break
    kept.push(row)
    size += row.length + 1
  }
  return [...kept.map((row) => Array.from(row).slice(0, maxChars - 8).join('')), '…', footer].join('\n')
}

function header(table) {
  return table.split('\n')[0].trim().split(/\s+\|\s+/)
}

function count(table) {
  const footer = table.split('\n').at(-1) ?? ''
  const match = /(\d+) строк\S*(?:, контрольная сумма \w+)?\)$/.exec(footer)
  return match ? Number(match[1]) : undefined
}

/** Подсказка без раскрытия ожидаемых значений сверх того, что ученик уже видит. */
export function explainMismatch(expected, actual) {
  const wantColumns = header(expected)
  const gotColumns = header(actual)
  if (wantColumns.join('|') !== gotColumns.join('|')) return `Столбцы не совпадают: нужны ${wantColumns.join(', ')}, получены ${gotColumns.join(', ')}`
  const want = count(expected)
  const got = count(actual)
  if (want !== undefined && got !== undefined && want !== got) return `Ожидалось ${rowsLabel(want)}, получено ${rowsLabel(got)}`
  return 'Значения в строках отличаются от ожидаемых'
}

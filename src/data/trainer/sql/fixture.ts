/**
 * Наборы данных SQL-задач и уроков курса.
 *
 * Один и тот же набор описывает и SQL подготовки базы, и таблицы в условии:
 * ученик видит ровно те строки, на которых проверяется открытый пример.
 * Скрытые варианты повторяют схему с другими строками, чтобы ответ нельзя было
 * подставить вручную.
 */

export type SqlValue = string | number | boolean | null

export type SqlTable = {
  name: string
  /** Пары «столбец - тип с ограничениями», как в CREATE TABLE. */
  columns: ReadonlyArray<readonly [string, string]>
  /** Ограничения уровня таблицы: составной ключ, CHECK. */
  constraints?: readonly string[]
}

export type SqlRows = Readonly<Record<string, ReadonlyArray<ReadonlyArray<SqlValue>>>>

export type SqlFixture = {
  slug: string
  title: string
  /** Порядок важен: таблица с внешним ключом идёт после той, на которую ссылается. */
  tables: readonly SqlTable[]
  rows: SqlRows
  hidden: readonly SqlRows[]
  /** Дополнительный SQL после вставки строк: индексы, представления, выравнивание последовательностей. */
  after?: string
}

export function sqlLiteral(value: SqlValue): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Нечисловое значение в фикстуре: ${value}`)
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return `'${value.replace(/'/g, "''")}'`
}

function tableRows(fixture: SqlFixture, rows: SqlRows, table: SqlTable): ReadonlyArray<ReadonlyArray<SqlValue>> {
  const values = rows[table.name]
  if (!values) throw new Error(`В наборе «${fixture.slug}» нет строк таблицы ${table.name}`)
  for (const row of values) {
    if (row.length !== table.columns.length) throw new Error(`В наборе «${fixture.slug}» строка таблицы ${table.name} не совпадает со столбцами: ${JSON.stringify(row)}`)
  }
  return values
}

export function fixtureRows(fixture: SqlFixture, variant: number): SqlRows {
  if (variant === 0) return fixture.rows
  const rows = fixture.hidden[variant - 1]
  if (!rows) throw new Error(`У набора «${fixture.slug}» нет скрытого варианта ${variant}`)
  return rows
}

export type RowPermutation = 'reversed' | 'rotated' | 'interleaved'

/** Разные перестановки ловят разные ничьи: у полной сортировки и у top-N в Postgres свой порядок равных строк. */
export const ROW_PERMUTATIONS: Readonly<Record<RowPermutation, <T>(rows: readonly T[]) => T[]>> = {
  reversed: (rows) => [...rows].reverse(),
  rotated: (rows) => [...rows.slice(Math.ceil(rows.length / 2)), ...rows.slice(0, Math.ceil(rows.length / 2))],
  interleaved: (rows) => [...rows.filter((_, index) => index % 2 === 1), ...rows.filter((_, index) => index % 2 === 0)],
}

/**
 * SQL подготовки базы: вариант 0 - открытые данные, 1.. - скрытые.
 * `permutation` вставляет строки в другом порядке и без внешних ключей: так тест каталога
 * находит задачи, чей ответ зависит от физического порядка строк.
 */
export function setupSql(fixture: SqlFixture, variant = 0, options: { permutation?: RowPermutation } = {}): string {
  const rows = fixtureRows(fixture, variant)
  const statements: string[] = []
  const columnType = (type: string) => options.permutation ? type.replace(/\s+REFERENCES\s+\w+\s*\([^)]*\)/g, '') : type
  for (const table of fixture.tables) {
    const definition = [...table.columns.map(([name, type]) => `  ${name} ${columnType(type)}`), ...(table.constraints ?? []).map((item) => `  ${item}`)]
    statements.push(`CREATE TABLE ${table.name} (\n${definition.join(',\n')}\n);`)
  }
  for (const table of fixture.tables) {
    const ordered = tableRows(fixture, rows, table)
    const values = options.permutation ? ROW_PERMUTATIONS[options.permutation](ordered) : ordered
    if (values.length === 0) continue
    const columns = table.columns.map(([name]) => name).join(', ')
    statements.push(`INSERT INTO ${table.name} (${columns}) VALUES\n${values.map((row) => `  (${row.map(sqlLiteral).join(', ')})`).join(',\n')};`)
  }
  if (fixture.after) statements.push(fixture.after.trim())
  return statements.join('\n\n')
}

/** Ячейка Markdown: GFM срезает пробелы по краям, HTML схлопывает двойные, а задачи бывают ровно про них. */
export function markdownCellText(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/ {2,}/g, (run) => ` ${'\u00a0'.repeat(run.length - 1)}`)
}

function markdownCell(value: SqlValue): string {
  if (value === null) return 'NULL'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  let text = String(value).replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
  // То же правило, что у таблицы результата: такое значение без кавычек не отличить от другого.
  if (typeof value === 'string' && /^$|^\s|\s$|^'|^NULL$/.test(text)) text = `'${text.replace(/'/g, "''")}'`
  return markdownCellText(text)
}

/** Таблицы открытого варианта для условия задачи или урока. */
export function fixtureMarkdown(fixture: SqlFixture, only?: readonly string[]): string {
  const tables = only ? fixture.tables.filter((table) => only.includes(table.name)) : fixture.tables
  if (only && tables.length !== only.length) throw new Error(`В наборе «${fixture.slug}» нет таблиц: ${only.join(', ')}`)
  return tables.map((table) => {
    const header = table.columns.map(([name]) => name)
    const lines = [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`]
    for (const row of tableRows(fixture, fixture.rows, table)) lines.push(`| ${row.map(markdownCell).join(' | ')} |`)
    return `Таблица \`${table.name}\`:\n\n${lines.join('\n')}`
  }).join('\n\n')
}

/** Структура таблиц без данных: для задач, где таблицу создаёт сам ученик. */
export function schemaMarkdown(fixture: SqlFixture, only?: readonly string[]): string {
  const tables = only ? fixture.tables.filter((table) => only.includes(table.name)) : fixture.tables
  return tables.map((table) => `Таблица \`${table.name}\`:\n\n| столбец | тип |\n| --- | --- |\n${table.columns.map(([name, type]) => `| ${name} | ${type.replace(/\|/g, '\\|')} |`).join('\n')}`).join('\n\n')
}

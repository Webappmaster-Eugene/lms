import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runJob } from '../gateway.mjs'
import { canonicalTable, explainMismatch, normalizeCell, previewTable, rowsLabel } from '../sql-result.mjs'
import { InputError, validateRequest } from '../validation.mjs'

const enabled = process.env.TRAINER_RUNTIME_INTEGRATION === '1'
const setupA = "create table staff(id int primary key, name text, salary numeric(10,2)); insert into staff values (1, 'Анна', 1200.50), (2, 'Борис', 900), (3, 'Вера', null)"
const setupB = "create table staff(id int primary key, name text, salary numeric(10,2)); insert into staff values (1, 'Глеб', 2000), (2, 'Дина', 700)"
const names = (...rows) => canonicalTable({ columns: ['name'], types: [25], rows: rows.map((name) => [name]) })
const cases = [
  { name: 'Пример', hidden: false, input: setupA, expected: names('Анна') },
  { name: 'secret-case', hidden: true, input: setupB, expected: names('Глеб') },
]
const sql = (code, extra = {}) => ({ language: 'sql', code, cases, timeLimitMs: 2000, ...extra })

test('SQL values are compared as Postgres text with harmless numeric differences removed', () => {
  assert.equal(normalizeCell('1200.50', 1700), '1200.5')
  assert.equal(normalizeCell('2.000', 1700), '2')
  assert.equal(normalizeCell('100', 1700), '100')
  assert.equal(normalizeCell('-0', 701), '0')
  assert.equal(normalizeCell('t', 16), 'true')
  assert.equal(normalizeCell(null, 25), 'NULL')
  assert.equal(normalizeCell('a\nb', 25), 'a\\nb')
  const long = normalizeCell('я'.repeat(500), 25)
  assert.ok(Array.from(long).length <= 120)
  assert.match(long, /…#[0-9a-f]{8}$/)
  assert.notEqual(normalizeCell(`${'я'.repeat(400)}а`, 25), normalizeCell(`${'я'.repeat(400)}б`, 25))
})

test('SQL text that the aligned table would blur is written as a quoted literal', () => {
  assert.equal(normalizeCell('Анна ', 25), "'Анна '")
  assert.equal(normalizeCell(' Анна', 25), "' Анна'")
  assert.equal(normalizeCell('', 25), "''")
  assert.equal(normalizeCell('NULL', 25), "'NULL'")
  assert.equal(normalizeCell("'x'", 25), "'''x'''")
  assert.equal(normalizeCell('a | b', 25), "'a | b'")
  assert.equal(normalizeCell('Анна  Белова', 25), 'Анна  Белова')
  const table = (...values) => canonicalTable({ columns: ['id', 'name'], types: [23, 25], rows: values.map((value, index) => [String(index + 1), value]) }, { ordered: true })
  // Раньше выравнивание и обрезка хвоста делали эти пары одинаковыми.
  assert.notEqual(table('Анна Белова ', 'Иван Карпов!'), table('Анна Белова', 'Иван Карпов!'))
  assert.notEqual(table('Иван Карпов '), table('Иван Карпов'))
  assert.notEqual(table(null), table('NULL'))
})

test('SQL canonical table sorts rows unless order matters and labels counts in Russian', () => {
  const result = { columns: ['id', 'name'], types: [23, 25], rows: [['2', 'Борис'], ['1', 'Анна']] }
  assert.equal(canonicalTable(result), ' id | name\n----+-------\n 1  | Анна\n 2  | Борис\n(2 строки)')
  assert.equal(canonicalTable(result, { ordered: true }).split('\n')[2], ' 2  | Борис')
  assert.equal(rowsLabel(1), '1 строка')
  assert.equal(rowsLabel(12), '12 строк')
  assert.equal(rowsLabel(22), '22 строки')
  assert.equal(rowsLabel(25), '25 строк')
  assert.throws(() => canonicalTable({ columns: Array.from({ length: 21 }, (_, index) => `c${index}`), types: [], rows: [] }), RangeError)
  const many = canonicalTable({ columns: ['n'], types: [23], rows: Array.from({ length: 250 }, (_, index) => [String(index)]) }, { ordered: true })
  assert.match(many, /\(показаны 200 из 250 строк, контрольная сумма [0-9a-f]{8}\)$/)
  const tail = canonicalTable({ columns: ['n'], types: [23], rows: Array.from({ length: 250 }, (_, index) => [String(index === 249 ? 999 : index)]) }, { ordered: true })
  assert.notEqual(many, tail)
  const preview = previewTable(many)
  assert.ok(preview.length <= 600)
  assert.match(preview, /…\n\(показаны 200 из 250 строк, контрольная сумма [0-9a-f]{8}\)$/)
  assert.equal(explainMismatch(many, canonicalTable({ columns: ['n'], types: [23], rows: [['1']] })), 'Ожидалось 250 строк, получено 1 строка')
})

test('SQL mismatch explanation names columns and row counts only', () => {
  assert.match(explainMismatch(names('Анна'), canonicalTable({ columns: ['id'], types: [23], rows: [['1']] })), /нужны name, получены id/)
  assert.match(explainMismatch(names('Анна'), names('Анна', 'Борис')), /Ожидалось 1 строка, получено 2 строки/)
  assert.equal(explainMismatch(names('Анна'), names('Вера')), 'Значения в строках отличаются от ожидаемых')
})

test('SQL requests need data sets and accept only a bounded check query and an order flag', () => {
  const request = { language: 'sql', code: 'select 1', cases: [{ name: 'Пример', hidden: false, input: '', expected: '' }], timeLimitMs: 2000 }
  assert.deepEqual(Object.keys(validateRequest(request)).sort(), ['allowNoTests', 'cases', 'check', 'code', 'includePreview', 'language', 'ordered', 'timeLimitMs'])
  assert.equal(validateRequest({ ...request, check: 'select * from t', ordered: true }).ordered, true)
  assert.throws(() => validateRequest({ ...request, cases: [] }), InputError)
  assert.throws(() => validateRequest({ ...request, cases: [], allowNoTests: true }), InputError)
  assert.throws(() => validateRequest({ ...request, check: 'x'.repeat(4001) }), InputError)
  assert.throws(() => validateRequest({ ...request, ordered: 'yes' }), InputError)
  assert.throws(() => validateRequest(request, true), InputError)
})

test('SQL job entrypoint has the process lifetime watchdog and exposes gc for instance reuse', async () => {
  const source = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8')
  assert.ok(source.includes('ENTRYPOINT ["/usr/bin/timeout", "--signal=KILL", "180s", "node", "--expose-gc", "/runtime/sql-worker.mjs"]'))
  assert.match(source, /COPY [^\n]*sql-result\.mjs \.\/\nENV NODE_ENV=production PORT=3100/)
})

test('SQL correct, hardcoded and wrong solutions get honest verdicts without leaking hidden data', { skip: !enabled, timeout: 120000 }, async () => {
  const correct = await runJob(sql('select name from staff where salary > 1000'))
  assert.equal(correct.status, 'passed', JSON.stringify(correct))
  assert.deepEqual(correct.consoleOutput, [' name', '------', ' Анна', '(1 строка)'])
  const hardcoded = await runJob(sql("select 'Анна' as name"))
  assert.equal(hardcoded.status, 'failed', JSON.stringify(hardcoded))
  assert.deepEqual(hardcoded.tests.map((item) => item.passed), [true, false])
  const wrong = await runJob(sql('select name, salary from staff where salary > 1000'))
  assert.match(wrong.tests[0].message, /Столбцы не совпадают/)
  for (const secret of ['secret-case', 'Глеб', 'Дина']) {
    for (const result of [correct, hardcoded, wrong]) assert.equal(JSON.stringify(result).includes(secret), false, secret)
  }
})

test('SQL errors point to the student line, empty answers explain what is missing', { skip: !enabled, timeout: 120000 }, async () => {
  const syntax = await runJob(sql('select name\nfrom staff wher salary > 1000'))
  assert.equal(syntax.status, 'failed')
  assert.match(syntax.tests[0].message, /^Ошибка SQL\. Строка 2: syntax error/)
  assert.equal(syntax.tests[0].line, 2)
  const empty = await runJob(sql('-- пока пусто'))
  assert.match(empty.tests[0].message, /не вернуло таблицу/)
})

test('SQL data changes are checked by the trusted query in a fresh database per case', { skip: !enabled, timeout: 120000 }, async () => {
  const expected = canonicalTable({ columns: ['id', 'salary'], types: [23, 1700], rows: [['1', '1200.50'], ['2', '1800.00'], ['3', null]] }, { ordered: true })
  const job = { language: 'sql', code: 'update staff set salary = salary * 2 where salary < 1000', check: 'select id, salary from staff order by id', ordered: true, timeLimitMs: 2000, cases: [
    { name: 'Первый', hidden: false, input: setupA, expected },
    { name: 'Повтор на свежей базе', hidden: false, input: setupA, expected },
  ] }
  const result = await runJob(job)
  assert.equal(result.status, 'passed', JSON.stringify(result))
})

test('SQL runaway queries stop at the time or memory limit and later cases still run', { skip: !enabled, timeout: 180000 }, async () => {
  for (const code of ['select pg_sleep(30)', 'with recursive r(n) as (select 1 union all select n + 1 from r) select count(*) as name from r', "select string_agg(md5(g::text), '') as name from generate_series(1, 5000000) g"]) {
    const result = await runJob(sql(code, { timeLimitMs: 3000 }))
    assert.equal(result.status, 'failed', JSON.stringify(result))
    assert.match(result.tests[0].message, /Превышен лимит (времени|памяти)/)
  }
  // Первый кейс зависает только на своих данных: следующий обязан получить новый поток и пройти.
  const recovering = await runJob({ ...sql("select name from staff where salary > 1000 and (select count(*) from staff) <> 3 or (select count(*) from staff) = 3 and pg_sleep(30) is null"), timeLimitMs: 2000 })
  assert.deepEqual(recovering.tests.map((item) => item.passed), [false, true], JSON.stringify(recovering))
})

test('SQL engine sees only its own virtual filesystem and cannot run programs', { skip: !enabled, timeout: 120000 }, async () => {
  const probe = (code) => runJob({ language: 'sql', code, timeLimitMs: 2000, cases: [{ name: 'probe', hidden: false, input: '', expected: canonicalTable({ columns: ['ok'], types: [16], rows: [['t']] }) }] })
  const passwd = await probe("select pg_read_file('/etc/passwd') is not null as ok")
  assert.match(passwd.tests[0].message, /could not open file/)
  const listing = await probe("select bool_and(name not in ('runtime', 'etc', 'usr')) as ok from pg_ls_dir('/') as name")
  assert.equal(listing.status, 'passed', JSON.stringify(listing))
  const program = await probe("copy (select 1) to program 'id'; select true as ok")
  assert.equal(program.tests[0].passed, false)
})

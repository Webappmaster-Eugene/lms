import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { openSqlRunner, type SqlRunner } from '../../../scripts/lib/sql-catalog'

/**
 * Правила исполнения решения, общие для тренажёра и генератора ожиданий: тот же
 * runSolutionCase, тот же PGlite. Здесь - то, что каталог задач не покрывает напрямую.
 */

const setup = 'CREATE TABLE accounts (id integer PRIMARY KEY, balance integer NOT NULL); INSERT INTO accounts VALUES (1, 100), (2, 50);'
const check = 'SELECT id, balance FROM accounts ORDER BY id'
const balances = (first: number, second: number) => ` id | balance\n----+---------\n 1  | ${first}\n 2  | ${second}\n(2 строки)`

let runner: SqlRunner
beforeAll(async () => { runner = await openSqlRunner() }, 120_000)
afterAll(async () => { await runner?.close() })

describe('изменения данных и транзакции', () => {
  it('без COMMIT открытая транзакция пропадает, как при отключении от сервера', async () => {
    const forgot = await runner.run({ setup, check, ordered: true, code: 'BEGIN; UPDATE accounts SET balance = balance - 30 WHERE id = 1; UPDATE accounts SET balance = balance + 30 WHERE id = 2;' })
    const committed = await runner.run({ setup, check, ordered: true, code: 'BEGIN; UPDATE accounts SET balance = balance - 30 WHERE id = 1; UPDATE accounts SET balance = balance + 30 WHERE id = 2; COMMIT;' })
    expect(forgot.status).toBe('ok')
    expect(forgot.table).toBe(balances(100, 50))
    expect(committed.table).toBe(balances(70, 80))
  })

  it('код идёт одним запросом: без BEGIN он фиксируется целиком, а BEGIN втягивает в транзакцию и команды перед ним', async () => {
    const plain = await runner.run({ setup, check, ordered: true, code: 'UPDATE accounts SET balance = 0 WHERE id = 2;' })
    const swallowed = await runner.run({ setup, check, ordered: true, code: 'UPDATE accounts SET balance = 0 WHERE id = 2; BEGIN; DELETE FROM accounts; ROLLBACK;' })
    const committedFirst = await runner.run({ setup, check, ordered: true, code: 'BEGIN; UPDATE accounts SET balance = 0 WHERE id = 2; COMMIT; BEGIN; DELETE FROM accounts; ROLLBACK;' })
    expect(plain.table).toBe(balances(100, 0))
    expect(swallowed.table).toBe(balances(100, 50))
    expect(committedFirst.table).toBe(balances(100, 0))
  })

  it('решение, упавшее посреди транзакции, получает ошибку с номером строки, а не проверку', async () => {
    const failed = await runner.run({ setup, check, code: 'BEGIN;\nUPDATE accounts SET balance = balance - 30 WHERE id = 1;\nUPDATE accounts SET missing = 1;\nCOMMIT;' })
    expect(failed.status).toBe('error')
    expect(failed.error).toMatch(/^Строка 3:/)
  })
})

/**
 * Разбор идентификатора задачи из запроса.
 *
 * Идентификаторы в БД — целые числа (`serial`). Если передать в выборку
 * произвольную строку, Postgres ответит ошибкой приведения типа, и роут вернул
 * бы 500 вместо честного 400 или 404.
 */
export function parseTaskId(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null
  }

  if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value)) return null

  return Number(value)
}

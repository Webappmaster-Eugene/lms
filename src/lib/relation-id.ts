/**
 * Id связи из документа Payload. Поле приходит либо числом, либо развёрнутым
 * документом — в зависимости от `depth` запроса, которым документ получен.
 *
 * Приводить такой id к строке нельзя: выборки строку принимают, а запись в поле
 * связи — нет, и `create` падает валидацией уже в рантайме.
 */
export function relationId(value: unknown): number {
  const raw = value !== null && typeof value === 'object' ? (value as { id?: unknown }).id : value

  // Number(null) и Number('') дают 0 — без этой проверки пустая связь
  // превратилась бы в ссылку на запись с id 0
  if (raw === null || raw === undefined || raw === '') {
    throw new TypeError('id связи не задан')
  }

  const id = Number(raw)

  if (!Number.isInteger(id)) {
    throw new TypeError(`ожидался числовой id связи, получено: ${JSON.stringify(raw)}`)
  }

  return id
}

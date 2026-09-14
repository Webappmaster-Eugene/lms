import type { PayloadRequest, RequestContext } from 'payload'

/**
 * Payload мержит переданный в операцию `context` прямо в объект `req`
 * (`createLocalReq` → `getRequestContext`). Поэтому вложенный вызов вида
 * `req.payload.create({ req, context: { skipHooks: true } })` навсегда ставит
 * `skipHooks` на общий запрос — и все последующие хуки в цепочке `afterChange`
 * молча выключаются: первый же хук глушит соседей.
 *
 * Здесь отдаём наследника запроса: собственное поле `context` перекрывает
 * родительское, всё остальное (включая `transactionID`, `payload`, `user`,
 * заголовки) читается через цепочку прототипов, так что вложенная запись
 * остаётся в той же транзакции, а родительский `req` не мутируется.
 */
export function childReq(req: PayloadRequest, context: RequestContext): PayloadRequest {
  const child: PayloadRequest = Object.create(req)
  child.context = { ...req.context, ...context }
  return child
}

/** Сокращение для самого частого случая — вложенной записи без повторного запуска хуков. */
export function skipHooksReq(req: PayloadRequest): PayloadRequest {
  return childReq(req, { skipHooks: true })
}

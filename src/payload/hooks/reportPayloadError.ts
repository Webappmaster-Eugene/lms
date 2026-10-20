import { Sentry } from '@/lib/error-reporting/sdk'
import { defaultLoggerOptions, type AfterErrorHook, type Config } from 'payload'
import { captureServerError, captureThrottled } from '@/lib/error-reporting/capture'
import { redactText } from '@/lib/error-reporting/redact'

/** Ошибки, уже отправленные хуком afterError: логгер Payload пишет их раньше хука и отправил бы второй раз. */
const reportedByHook = new WeakSet<object>()

function statusOf(error: unknown): number {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
  return typeof status === 'number' ? status : 500
}

/**
 * Ошибки REST, GraphQL и админки Payload. 4xx — штатные ответы (неверный пароль,
 * валидация, нет доступа), в трекер уходят только сбои сервера.
 */
export const reportPayloadError: AfterErrorHook = ({ collection, error, req }) => {
  if (statusOf(error) < 500) return
  reportedByHook.add(error)
  captureServerError(error, {
    tags: { source: 'payload', ...(collection ? { collection: collection.slug } : {}) },
    attributes: { userId: typeof req.user?.id === 'number' ? req.user.id : undefined, method: req.method },
  })
}

function errorFrom(args: readonly unknown[]): Error | undefined {
  const [first] = args
  if (first instanceof Error) return first
  if (first && typeof first === 'object' && 'err' in first && first.err instanceof Error) return first.err
  return undefined
}

function messageFrom(args: readonly unknown[]): string | undefined {
  const text = args.find((arg): arg is string => typeof arg === 'string')
  if (text) return text
  const [first] = args
  if (first && typeof first === 'object' && 'msg' in first && typeof first.msg === 'string') return first.msg
  return undefined
}

/** Уровень pino для error; fatal — 60. */
const PINO_ERROR = 50

/**
 * Записи уровня error из логгера Payload: падение подключения к БД и миграций,
 * отказ SMTP при проверке транспорта, ошибки onInit. Повтор одной и той же
 * ошибки на каждый запрос (лежит БД) не должен съедать квоту Sentry.
 */
export function reportPayloadLog(args: readonly unknown[], level: number): void {
  if (level < PINO_ERROR) return
  const error = errorFrom(args)
  const message = messageFrom(args)
  if (error && statusOf(error) < 500) return

  const report = () => {
    if (error && reportedByHook.has(error)) return
    const key = `payload-log:${redactText(error ? `${error.name}:${error.message}` : message ?? '').slice(0, 120)}`
    captureThrottled(key, 10_000, error ?? message, { message, level: level > PINO_ERROR ? 'fatal' : 'error', tags: { source: 'payload-logger' }, fingerprint: error ? undefined : [key] })
  }
  // routeError Payload пишет лог и только потом вызывает afterError: ждём хук,
  // чтобы ушло одно событие с коллекцией и пользователем, а не два.
  if (error) setImmediate(report)
  else report()
}

type Migration = { name: string; up: (args: never) => Promise<void> }

/**
 * Упавшая на старте контейнера миграция: drizzle пишет лог и сразу вызывает
 * process.exit(1), и отправка из лога не успевает уйти. Поэтому каждая миграция
 * сама отправляет свою ошибку и ждёт доставки, прежде чем пробросить её дальше.
 */
export function reportMigrationFailures<T extends Migration>(migrations: readonly T[]): T[] {
  return migrations.map((migration) => ({
    ...migration,
    up: async (args: Parameters<T['up']>[0]) => {
      try {
        await migration.up(args)
      } catch (error) {
        captureServerError(error, { level: 'fatal', message: `Миграция ${migration.name} упала`, tags: { component: 'migrations' }, attributes: { migration: migration.name } })
        await Sentry.flush(5_000)
        throw error
      }
    },
  }))
}

/** Логгер Payload в прежнем формате (pino-pretty в stdout) с отправкой ошибок в Sentry. */
export const payloadLogger: Config['logger'] = {
  options: {
    hooks: {
      logMethod(args, method, level) {
        reportPayloadLog(args, level)
        return method.apply(this, args)
      },
    },
  },
  destination: defaultLoggerOptions,
}

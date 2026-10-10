import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { readTrainerBody, TrainerInputError } from '@/lib/trainer/request-body'
import { TRAINER_LIMITS } from '@/lib/trainer/constants'
import { isRuntimeLanguage, isProgramLanguage, isFrontendLanguage, parseFrontendFiles, runtimeCases } from '@/lib/trainer/runtime-spec'
import { parseTaskId } from '@/lib/trainer/task-id'
import { supportsLanguage, TrainerSpecError } from '@/lib/trainer/spec'
import { getTrainerAccess } from '@/server/trainer-access'
import { runRuntime, runRuntimePreview } from '@/server/trainer/runtime'
import { TrainerRunnerError } from '@/server/trainer/pool'
import { createRateLimiter } from '@/server/trainer/rate-limit'
import { logger } from '@/lib/telemetry'

const limiter = createRateLimiter('runtime-run', 20, 60_000)

/** Публичные проверки и предпросмотр: этот маршрут не пишет прогресс. */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 })
  if (!limiter.take(String(user.id))) return NextResponse.json({ error: 'Слишком много запусков. Подождите минуту.' }, { status: 429 })
  let body: Record<string, unknown>
  try { body = await readTrainerBody(request) } catch (error) {
    return NextResponse.json({ error: error instanceof TrainerInputError ? error.message : 'Не удалось прочитать запрос' }, { status: error instanceof TrainerInputError ? error.status : 400 })
  }
  const taskId = parseTaskId(body.taskId)
  if (taskId === null || !isRuntimeLanguage(body.language) || typeof body.code !== 'string' || !body.code.trim() || body.code.length > TRAINER_LIMITS.maxCodeLength) {
    return NextResponse.json({ error: 'Укажите задачу, язык и код в пределах лимита размера' }, { status: 400 })
  }
  const language = body.language
  if (!(await getTrainerAccess(payload, user)).canAccessTask(taskId)) return NextResponse.json({ error: 'Доступ к этой задаче не назначен' }, { status: 403 })
  const found = await payload.find({ collection: 'trainer-tasks', where: { id: { equals: taskId }, isPublished: { equals: true } }, limit: 1, depth: 0, overrideAccess: true })
  const task = found.docs[0]
  if (!task) return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 })
  if (!supportsLanguage(task, language) || (isProgramLanguage(language) ? task.checkMode !== 'program' : task.checkMode !== 'dom')) return NextResponse.json({ error: 'Язык не соответствует этой задаче' }, { status: 400 })
  try {
    if (isFrontendLanguage(language)) parseFrontendFiles(body.code)
    const cases = runtimeCases(task, true)
    if (isProgramLanguage(language) && body.customCases !== undefined) {
      const custom = runtimeCases({ runtimeCases: body.customCases }, true)
      if (custom.length > 10 || custom.some((item) => item.expected === undefined || item.checks || item.path || item.viewport || (item.input?.length ?? 0) + (item.expected?.length ?? 0) > 2000)) throw new TrainerSpecError('Добавьте до 10 собственных проверок: ввод и ожидаемый вывод до 2000 символов')
      if (cases.length + custom.length > 50) throw new TrainerSpecError('За один запуск можно проверить до 50 тестов')
      cases.push(...custom.map((item) => ({ ...item, hidden: false })))
    }
    const timeLimitMs = Math.min(Math.max(task.timeLimitMs ?? 5000, 500), TRAINER_LIMITS.maxTimeLimitMs)
    const output = isFrontendLanguage(language)
      ? await runRuntimePreview({ language, code: body.code, cases, timeLimitMs })
      : { result: await runRuntime({ language, code: body.code, cases, timeLimitMs, allowNoTests: true }) }
    return NextResponse.json(output, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof TrainerSpecError) return NextResponse.json({ error: error.message }, { status: 400 })
    logger.error('Не удалось выполнить публичный прогон тренажёра', error, { 'trainer.task.id': taskId })
    return NextResponse.json({ error: error instanceof TrainerRunnerError ? 'Среда выполнения временно недоступна. Повторите запуск позже.' : 'Не удалось запустить решение' }, { status: error instanceof TrainerRunnerError ? 503 : 500 })
  }
}

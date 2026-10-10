import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { isTrainerLanguage } from '@/lib/trainer/runtime-spec'
import { readTrainerBody, TrainerInputError } from '@/lib/trainer/request-body'
import { TRAINER_LIMITS } from '@/lib/trainer/constants'
import { supportsLanguage } from '@/lib/trainer/spec'
import { TrainerSpecError } from '@/lib/trainer/spec'
import type { SubmitResponse } from '@/lib/trainer/api'
import type { TrainerLanguage, TrainerRunResult } from '@/lib/trainer/types'
import { parseTaskId } from '@/lib/trainer/task-id'
import { getTrainerAccess, TrainerAccessError } from '@/server/trainer-access'
import { runSolution, TrainerRunnerError } from '@/server/trainer/sandbox'
import { createRateLimiter } from '@/server/trainer/rate-limit'
import { logger } from '@/lib/telemetry'
import { saveTrainerProgress } from '@/lib/trainer/save-progress'

/**
 * POST /api/trainer/submit
 *
 * Отправка решения. Сервер пересобирает скрипт из своей копии тестов и
 * запускает его в изолированной песочнице — результат клиента здесь не
 * принимается вообще. Прогресс и баллы пишутся только по серверному вердикту.
 */

/** Отправок на пользователя в минуту. Прогон стоит процессорного времени. */
const rateLimiter = createRateLimiter('submit', 30, 60_000)

export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config })

  const { user } = await payload.auth({ headers: request.headers })
  if (!user) {
    return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try { body = await readTrainerBody(request) } catch (error) {
    return NextResponse.json({ error: error instanceof TrainerInputError ? error.message : 'Не удалось прочитать запрос' }, { status: error instanceof TrainerInputError ? error.status : 400 })
  }

  const taskId = parseTaskId(body.taskId)
  if (body.language !== undefined && !isTrainerLanguage(body.language)) return NextResponse.json({ error: 'Неизвестный язык решения' }, { status: 400 })
  const language: TrainerLanguage = isTrainerLanguage(body.language) ? body.language : 'js'
  const code = typeof body.code === 'string' ? body.code : ''

  if (taskId === null || code.trim().length === 0) {
    return NextResponse.json({ error: 'Обязательные поля: taskId, code' }, { status: 400 })
  }

  if (code.length > TRAINER_LIMITS.maxCodeLength) {
    return NextResponse.json(
      { error: `Решение не должно превышать ${TRAINER_LIMITS.maxCodeLength} символов` },
      { status: 400 },
    )
  }

  if (!rateLimiter.take(String(user.id))) {
    return NextResponse.json(
      { error: 'Слишком много отправок подряд. Подождите минуту.' },
      { status: 429 },
    )
  }

  if (!(await getTrainerAccess(payload, user)).canAccessTask(taskId)) {
    return NextResponse.json({ error: 'Доступ к этой задаче не назначен' }, { status: 403 })
  }

  const tasks = await payload.find({
    collection: 'trainer-tasks',
    where: { id: { equals: taskId }, isPublished: { equals: true } },
    limit: 1,
    // Эталонное решение читается полем с admin-only доступом; тесты берём
    // из документа напрямую, а не из того, что прислал клиент.
    overrideAccess: true,
  })

  const task = tasks.docs[0]
  if (!task) {
    return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 })
  }

  if (!supportsLanguage(task, language)) {
    return NextResponse.json(
      { error: 'Эта задача не решается на выбранном языке' },
      { status: 400 },
    )
  }

  let result: TrainerRunResult
  try {
    result = await runSolution(task, language, code)
  } catch (error) {
    if (error instanceof TrainerSpecError) {
      logger.error('Задача тренажёра настроена некорректно', error, { 'trainer.task.id': taskId })
      return NextResponse.json(
        { error: 'Задача настроена некорректно, мы уже знаем об этом' },
        { status: 500 },
      )
    }
    if (error instanceof TrainerRunnerError) {
      logger.error('Песочница тренажёра недоступна', error, { 'trainer.task.id': taskId })
      return NextResponse.json(
        {
          error: error.overloaded
            ? 'Проверка перегружена, попробуйте через несколько секунд'
            : 'Проверка временно недоступна, попробуйте ещё раз',
        },
        { status: 503 },
      )
    }
    logger.error('Непредвиденная ошибка проверки решения', error, { 'trainer.task.id': taskId })
    return NextResponse.json({ error: 'Не удалось проверить решение' }, { status: 500 })
  }

  let progress: Omit<SubmitResponse, 'result'>
  try {
    progress = await saveTrainerProgress({ payload, user, task, language, code, result })
  } catch (error) {
    if (error instanceof TrainerAccessError) return NextResponse.json({ error: error.message }, { status: 403 })
    logger.error('Не удалось сохранить прогресс тренажёра', error, {
      'trainer.task.id': taskId,
      'user.id': String(user.id),
    })
    return NextResponse.json(
      { error: 'Решение проверено, но прогресс сохранить не удалось. Повторите отправку.' },
      { status: 500 },
    )
  }

  const response: SubmitResponse = { result, ...progress }

  return NextResponse.json(response)
}

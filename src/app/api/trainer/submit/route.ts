import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { TRAINER_LIMITS } from '@/lib/trainer/constants'
import { supportsLanguage } from '@/lib/trainer/spec'
import { TrainerSpecError } from '@/lib/trainer/spec'
import type { SubmitResponse } from '@/lib/trainer/api'
import type { TrainerLanguage, TrainerRunResult } from '@/lib/trainer/types'
import { parseTaskId } from '@/lib/trainer/task-id'
import { runSolution, TrainerRunnerError } from '@/server/trainer/sandbox'
import { createRateLimiter } from '@/server/trainer/rate-limit'
import { logger } from '@/lib/telemetry'
import { relationId } from '@/lib/relation-id'

/**
 * POST /api/trainer/submit
 *
 * Отправка решения. Сервер пересобирает скрипт из своей копии тестов и
 * запускает его в изолированной песочнице — результат клиента здесь не
 * принимается вообще. Прогресс и баллы пишутся только по серверному вердикту.
 */

/** Отправок на пользователя в минуту. Прогон стоит процессорного времени. */
const rateLimiter = createRateLimiter('submit', 30, 60_000)

/** Краткая сводка прогона для хранения: полный отчёт в БД не нужен. */
function summarize(result: TrainerRunResult, language: TrainerLanguage) {
  return {
    status: result.status,
    language,
    passed: result.passedCount,
    total: result.totalCount,
    failedTests: result.tests
      .filter((test) => !test.passed)
      .slice(0, 10)
      .map((test) => test.name),
    ...(result.error ? { error: result.error.slice(0, 300) } : {}),
    at: new Date().toISOString(),
  }
}

export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config })

  const { user } = await payload.auth({ headers: request.headers })
  if (!user) {
    return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 })
  }

  let body: { taskId?: unknown; language?: unknown; code?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Невалидный JSON' }, { status: 400 })
  }

  const taskId = parseTaskId(body.taskId)
  const language: TrainerLanguage = body.language === 'ts' ? 'ts' : 'js'
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

  const passed = result.status === 'passed'

  const existing = await payload.find({
    collection: 'user-trainer-progress',
    where: { user: { equals: user.id }, task: { equals: task.id } },
    limit: 1,
    overrideAccess: true,
  })

  const previous = existing.docs[0]
  const wasCompleted = previous?.isCompleted === true
  const attempts = (previous?.attempts ?? 0) + 1
  const failedAttempts = (previous?.failedAttempts ?? 0) + (passed ? 0 : 1)

  const data = {
    isCompleted: wasCompleted || passed,
    userCode: code,
    language,
    attempts,
    failedAttempts,
    lastResult: summarize(result, language),
    ...(passed ? { verifiedBy: 'server' as const } : {}),
    // Дата решения выставляется один раз — при первом успехе.
    ...(passed && !wasCompleted ? { completedAt: new Date().toISOString() } : {}),
  }

  try {
    if (previous) {
      await payload.update({
        collection: 'user-trainer-progress',
        id: previous.id,
        data,
        overrideAccess: true,
      })
    } else {
      try {
        await payload.create({
          collection: 'user-trainer-progress',
          data: {
            ...data,
            user: relationId(user.id),
            task: relationId(task.id),
          },
          overrideAccess: true,
        })
      } catch (error) {
        // Две одновременные отправки: обе не нашли записи и обе пошли создавать.
        // Уникальный индекс (user_id, task_id) пропустит только первую — вторая
        // дописывается в уже существующую запись, а не теряет результат.
        const conflicting = await payload.find({
          collection: 'user-trainer-progress',
          where: { user: { equals: user.id }, task: { equals: task.id } },
          limit: 1,
          overrideAccess: true,
        })

        const created = conflicting.docs[0]
        if (!created) throw error

        await payload.update({
          collection: 'user-trainer-progress',
          id: created.id,
          data: {
            ...data,
            isCompleted: created.isCompleted === true || passed,
            attempts: (created.attempts ?? 0) + 1,
            failedAttempts: (created.failedAttempts ?? 0) + (passed ? 0 : 1),
          },
          overrideAccess: true,
        })
      }
    }
  } catch (error) {
    logger.error('Не удалось сохранить прогресс тренажёра', error, {
      'trainer.task.id': taskId,
      'user.id': String(user.id),
    })
    return NextResponse.json(
      { error: 'Решение проверено, но прогресс сохранить не удалось. Повторите отправку.' },
      { status: 500 },
    )
  }

  const response: SubmitResponse = {
    result,
    completed: wasCompleted || passed,
    awardedPoints: passed && !wasCompleted ? (task.pointsReward ?? 10) : null,
    attempts,
  }

  return NextResponse.json(response)
}

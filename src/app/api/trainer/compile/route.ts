import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { TRAINER_LIMITS } from '@/lib/trainer/constants'
import { supportsLanguage } from '@/lib/trainer/spec'
import type { TrainerDiagnostic } from '@/lib/trainer/types'
import { parseTaskId } from '@/lib/trainer/task-id'
import { compileTypeScript, TrainerRunnerError } from '@/server/trainer/sandbox'
import { createRateLimiter } from '@/server/trainer/rate-limit'
import { logger } from '@/lib/telemetry'

/**
 * POST /api/trainer/compile
 *
 * Транспилирует решение на TypeScript в JavaScript и возвращает диагностики
 * компилятора. Нужен кнопке «Запустить»: сам прогон идёт в браузере, но
 * компилятор туда не тащим — пакет typescript весит около 8 МБ, а проверка
 * типов всё равно обязана совпадать с серверной.
 *
 * Эндпоинт ничего не пишет и баллов не начисляет: вердикт даёт только
 * /api/trainer/submit.
 */

export type CompileResponse = {
  js: string
  diagnostics: TrainerDiagnostic[]
}

/** Компиляций на пользователя в минуту: она дешевле прогона, лимит мягче. */
const rateLimiter = createRateLimiter('compile', 60, 60_000)

export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config })

  const { user } = await payload.auth({ headers: request.headers })
  if (!user) {
    return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 })
  }

  let body: { taskId?: unknown; code?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Невалидный JSON' }, { status: 400 })
  }

  const taskId = parseTaskId(body.taskId)
  const code = typeof body.code === 'string' ? body.code : ''

  if (taskId === null || code.length === 0) {
    return NextResponse.json({ error: 'Обязательные поля: taskId, code' }, { status: 400 })
  }

  if (code.length > TRAINER_LIMITS.maxCodeLength) {
    return NextResponse.json(
      { error: `Решение не должно превышать ${TRAINER_LIMITS.maxCodeLength} символов` },
      { status: 400 },
    )
  }

  if (!rateLimiter.take(String(user.id))) {
    return NextResponse.json({ error: 'Слишком много запросов. Подождите минуту.' }, { status: 429 })
  }

  const tasks = await payload.find({
    collection: 'trainer-tasks',
    where: { id: { equals: taskId }, isPublished: { equals: true } },
    limit: 1,
    overrideAccess: true,
  })

  const task = tasks.docs[0]
  if (!task) {
    return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 })
  }

  if (!supportsLanguage(task, 'ts')) {
    return NextResponse.json({ error: 'Эта задача не решается на TypeScript' }, { status: 400 })
  }

  try {
    const compiled = await compileTypeScript({
      code,
      setupCode: task.setupTypes?.trim() || (task.setupCode ?? ''),
      // Блок проверки типов подключается только у задач на систему типов:
      // в остальных он навязал бы решению чужие ограничения.
      typeHarness: task.checkMode === 'types' ? (task.typeHarness ?? '') : '',
      checkTypes: true,
    })

    const response: CompileResponse = { js: compiled.js, diagnostics: compiled.diagnostics }
    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof TrainerRunnerError) {
      logger.error('Компилятор TypeScript недоступен', error, { 'trainer.task.id': taskId })
      return NextResponse.json(
        {
          error: error.overloaded
            ? 'Компилятор перегружен, попробуйте через несколько секунд'
            : 'Компилятор временно недоступен',
        },
        { status: 503 },
      )
    }
    logger.error('Непредвиденная ошибка компиляции', error, { 'trainer.task.id': taskId })
    return NextResponse.json({ error: 'Не удалось скомпилировать решение' }, { status: 500 })
  }
}

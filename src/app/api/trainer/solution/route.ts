import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import type { SolutionResponse } from '@/lib/trainer/api'
import { parseTaskId } from '@/lib/trainer/task-id'

/**
 * GET /api/trainer/solution?taskId=...
 *
 * Отдаёт эталонное решение и разбор. Поля solutionCode* закрыты доступом уровня
 * поля (только админ), поэтому обычным REST их не достать — этот роут снимает
 * ограничение адресно и только тогда, когда пользователь заслужил разбор.
 *
 * Право появляется после успешной сдачи либо после нескольких неудачных
 * попыток: так разбор остаётся наградой, но не превращается в тупик.
 */

const UNLOCK_AFTER_FAILED_ATTEMPTS = 5

export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config })

  const { user } = await payload.auth({ headers: request.headers })
  if (!user) {
    return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 })
  }

  const taskId = parseTaskId(new URL(request.url).searchParams.get('taskId'))
  if (taskId === null) {
    return NextResponse.json({ error: 'Не указан taskId' }, { status: 400 })
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

  if (user.role !== 'admin') {
    const progress = await payload.find({
      collection: 'user-trainer-progress',
      where: { user: { equals: user.id }, task: { equals: task.id } },
      limit: 1,
      overrideAccess: true,
    })

    const record = progress.docs[0]
    const unlocked =
      record?.isCompleted === true ||
      (record?.failedAttempts ?? 0) >= UNLOCK_AFTER_FAILED_ATTEMPTS

    if (!unlocked) {
      return NextResponse.json(
        {
          error: `Решение откроется после успешной сдачи или ${UNLOCK_AFTER_FAILED_ATTEMPTS} неудачных попыток`,
        },
        { status: 403 },
      )
    }
  }

  const response: SolutionResponse = {
    solutionCode: task.solutionCode ?? null,
    solutionCodeTs: task.solutionCodeTs ?? null,
    solutionNotes: task.solutionNotes ?? null,
  }

  return NextResponse.json(response)
}

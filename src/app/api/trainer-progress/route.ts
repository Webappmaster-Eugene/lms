import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { validateOutput } from '@/lib/trainer-validation'

const MAX_CODE_LENGTH = 10000
const MAX_OUTPUT_LENGTH = 10240

/**
 * POST /api/trainer-progress
 * Сохраняет прогресс решения задачи тренажёра.
 * Валидирует output серверно перед сохранением.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })

  const { user } = await payload.auth({ headers: request.headers })
  if (!user) {
    return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 })
  }

  let body: { taskId: string; userCode: string; output: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Невалидный JSON' }, { status: 400 })
  }

  const { taskId, userCode, output } = body

  if (!taskId || !userCode || typeof output !== 'string') {
    return NextResponse.json({ error: 'Обязательные поля: taskId, userCode, output' }, { status: 400 })
  }

  if (userCode.length > MAX_CODE_LENGTH) {
    return NextResponse.json({ error: `Код не должен превышать ${MAX_CODE_LENGTH} символов` }, { status: 400 })
  }

  if (output.length > MAX_OUTPUT_LENGTH) {
    return NextResponse.json({ error: 'Вывод слишком длинный' }, { status: 400 })
  }

  // Validate that task exists and is published
  const taskResult = await payload.find({
    collection: 'trainer-tasks',
    where: {
      id: { equals: taskId },
      isPublished: { equals: true },
    },
    limit: 1,
  })

  if (taskResult.totalDocs === 0) {
    return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 })
  }

  const task = taskResult.docs[0]

  // Серверная валидация output
  const expectedOutput = task.expectedOutput ?? ''
  if (!validateOutput(output, expectedOutput)) {
    return NextResponse.json(
      { error: 'Вывод не совпадает с ожидаемым', passed: false },
      { status: 400 },
    )
  }

  // Check if already has progress record
  const existing = await payload.find({
    collection: 'user-trainer-progress',
    where: {
      user: { equals: user.id },
      task: { equals: taskId },
    },
    limit: 1,
  })

  if (existing.totalDocs > 0) {
    const doc = existing.docs[0]
    await payload.update({
      collection: 'user-trainer-progress',
      id: doc.id,
      data: {
        isCompleted: true,
        userCode,
        completedAt: new Date().toISOString(),
        attempts: (doc.attempts ?? 0) + 1,
      },
    })

    return NextResponse.json({ success: true, updated: true })
  }

  // Create new progress record
  await payload.create({
    collection: 'user-trainer-progress',
    data: {
      user: user.id,
      task: taskId as unknown as number,
      isCompleted: true,
      userCode,
      completedAt: new Date().toISOString(),
      attempts: 1,
    },
  })

  return NextResponse.json({ success: true, created: true })
}

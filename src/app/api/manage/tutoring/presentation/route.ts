import { createLocalReq } from 'payload'

import { getPayload } from '@/lib/payload'
import { logger } from '@/lib/telemetry'
import { isTutoringMeeting, isTutoringProgram } from '@/lib/tutoring'
import { sameOriginRequest } from '@/server/error-tunnel'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { TutoringProblem } from '@/server/tutoring'
import { saveTutoringDeck, saveTutoringIntroduction, TUTORING_REQUEST_LIMIT } from '@/server/tutoring-decks'

export const runtime = 'nodejs'

const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
const failure = (error: string, status: number) => json({ error }, status)

async function readForm(request: Request) {
  const type = request.headers.get('content-type') ?? ''
  if (!type.startsWith('multipart/form-data;') || !request.body) throw new TutoringProblem('Приложите PDF и PPTX')
  const length = request.headers.get('content-length')
  if (length && Number(length) > TUTORING_REQUEST_LIMIT) throw new TutoringProblem('Каждый файл должен занимать до 10 МБ')
  let read = 0
  const bounded = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      read += chunk.length
      if (read > TUTORING_REQUEST_LIMIT) throw new TutoringProblem('Каждый файл должен занимать до 10 МБ')
      controller.enqueue(chunk)
    },
  }))
  return new Response(bounded, { headers: { 'Content-Type': type } }).formData()
}

function parseMaterial(raw: string) {
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object') throw new TutoringProblem('Проверьте данные импорта')
  const { program, number, title, homework, instructorNotes, sourceDigest } = parsed as Record<string, unknown>
  if (!isTutoringProgram(program) || !isTutoringMeeting(number, program) || typeof title !== 'string' || !title.trim() || title.length > 240 ||
    typeof instructorNotes !== 'string' || !instructorNotes.trim() || instructorNotes.length > 80_000 ||
    typeof sourceDigest !== 'string' || !/^[a-f0-9]{64}$/.test(sourceDigest) ||
    !Array.isArray(homework) || homework.length < 1 || homework.length > 2) throw new TutoringProblem('Проверьте данные импорта')
  const tasks = homework.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new TutoringProblem('Проверьте домашнюю работу')
    const { stage, description, assignment, practice } = item as Record<string, unknown>
    if (typeof stage !== 'number' || !Number.isInteger(stage) || stage < 0 || stage > 20 ||
      typeof description !== 'string' || !description.trim() || description.length > 1200 ||
      (assignment !== undefined && (typeof assignment !== 'string' || assignment.length > 50_000)) ||
      typeof practice !== 'string' || !practice.startsWith(`/lessons/${program}-bootcamp-${String(stage).padStart(2, '0')}-`) ||
      !/^\/lessons\/[a-z0-9-]+-practice$/.test(practice)) {
      throw new TutoringProblem('Проверьте домашнюю работу')
    }
    return { stage, description, assignment, practice }
  })
  if (new Set(tasks.map(task => task.stage)).size !== tasks.length) throw new TutoringProblem('Этапы домашней работы должны различаться')
  return { program, number, title, homework: tasks, instructorNotes, sourceDigest }
}

export async function POST(request: Request) {
  const headers = new Headers(request.headers)
  const authorization = headers.get('authorization')
  if (authorization !== null) {
    if (!/^(?:JWT|Bearer) \S+$/.test(authorization)) return failure('Требуется авторизация', 401)
    headers.delete('cookie')
  } else if (!sameOriginRequest(request)) return failure('Действие доступно со страницы MentorCareer', 403)

  const payload = await getPayload()
  const req = await createLocalReq({}, payload)
  const { user } = await payload.auth({ headers, req })
  if (!user) return failure('Требуется авторизация', 401)
  if ((await getAuthoritativeLearningPolicy(payload, user.id, req)).role !== 'admin') return failure('Недостаточно прав', 403)

  let form: FormData
  try { form = await readForm(request) } catch (error) {
    return failure(error instanceof TutoringProblem ? error.message : 'Не удалось прочитать файлы', 400)
  }
  const id = Number(form.get('id'))
  const updatedAt = String(form.get('updatedAt') ?? '')
  if (!Number.isSafeInteger(id) || id < 0 || (id > 0 && !Number.isFinite(Date.parse(updatedAt)))) return failure('Проверьте номер и версию лекции', 400)
  const imported = form.get('material')
  const decksOnly = form.get('decksOnly') === 'true'
  try {
    if (form.has('introduction')) {
      const program = form.get('introduction')
      if (!isTutoringProgram(program) || decksOnly) return failure('Проверьте программу вводной встречи', 400)
      if (imported === null) {
        if (!id) return failure('Вводная встреча не найдена', 404)
        return json(await saveTutoringIntroduction(payload, user, form, program, updatedAt, undefined, id))
      }
      if (authorization === null || typeof imported !== 'string') return failure('Требуется авторизованный импорт', 403)
      const fields: unknown = JSON.parse(imported)
      if (!fields || typeof fields !== 'object' || !('instructorNotes' in fields) || !('sourceDigest' in fields) ||
        typeof fields.instructorNotes !== 'string' || !fields.instructorNotes.trim() || fields.instructorNotes.length > 80_000 ||
        typeof fields.sourceDigest !== 'string' || !/^[a-f0-9]{64}$/.test(fields.sourceDigest)) return failure('Проверьте сценарий вводной встречи', 400)
      return json(await saveTutoringIntroduction(payload, user, form, program, updatedAt,
        { instructorNotes: fields.instructorNotes, sourceDigest: fields.sourceDigest }, id))
    }
    if (typeof imported === 'string' && authorization !== null) {
      if (decksOnly && !id) return failure('Для обновления презентации нужна существующая лекция', 400)
      const material = parseMaterial(imported)
      const result = await saveTutoringDeck(payload, user, form, { id: id || null, updatedAt, material, decksOnly })
      return json(result)
    }
    if (!id || imported !== null) return failure('Лекция не найдена', 404)
    return json(await saveTutoringDeck(payload, user, form, { id, updatedAt }))
  } catch (error) {
    if (error instanceof TutoringProblem || error instanceof SyntaxError) return failure(error instanceof TutoringProblem ? error.message : 'Проверьте данные импорта', 400)
    logger.error('Tutoring presentation write failed', error)
    return failure('Не удалось сохранить презентацию. Обновите страницу и повторите попытку', 500)
  }
}

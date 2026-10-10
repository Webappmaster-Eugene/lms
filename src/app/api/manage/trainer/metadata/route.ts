import { APIError, createLocalReq } from 'payload'
import { getPayload } from '@/lib/payload'
import { backfillTrainerMetadata } from '@/server/trainer/metadata-backfill'
import { readTrainerBody, TrainerInputError } from '@/lib/trainer/request-body'
import { logger } from '@/lib/telemetry'

export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return Response.json({ error: 'Войдите в аккаунт' }, { status: 401 })
  if (user.role !== 'admin') return Response.json({ error: 'Требуются права администратора' }, { status: 403 })
  const origin = request.headers.get('origin')
  if (origin && origin !== payload.config.serverURL) return Response.json({ error: 'Изменения доступны только на сайте платформы' }, { status: 403 })
  let value: unknown
  try { value = await readTrainerBody(request) } catch (error) {
    return Response.json({ error: error instanceof TrainerInputError ? error.message : 'Некорректный JSON' }, { status: error instanceof TrainerInputError ? error.status : 400 })
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('dryRun' in value) || typeof value.dryRun !== 'boolean' || Object.keys(value).length !== 1) {
    return Response.json({ error: 'Укажите только dryRun: true для просмотра либо false для применения' }, { status: 400 })
  }
  try {
    const req = await createLocalReq({ user, req: { url: request.url, headers: request.headers } }, payload)
    const result = await backfillTrainerMetadata(req, value.dryRun)
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    logger.error('Не удалось обновить метаданные тренажёра', error)
    return Response.json({ error: error instanceof APIError ? error.message : 'Не удалось обновить метаданные. Изменения отменены.' }, { status: error instanceof APIError ? error.status : 500 })
  }
}

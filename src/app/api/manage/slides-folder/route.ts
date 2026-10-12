import { getPayload } from 'payload'
import config from '@payload-config'

import { listSlideFolder, SlidesError } from '@/server/slides-folder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 8192
const HEADERS = { 'Cache-Control': 'private, no-store' }

const failure = (error: string, status: number) => Response.json({ error }, { status, headers: HEADERS })

/**
 * POST /api/manage/slides-folder — файлы публичной папки Диска в порядке показа.
 * Только читает Диск: список попадёт в урок, когда администратор сохранит форму.
 */
export async function POST(request: Request): Promise<Response> {
  // Запрос с чужого сайта не должен заставлять сервер ходить на Диск от имени администратора.
  if (request.headers.get('sec-fetch-site') === 'cross-site') return failure('Запрос доступен только со страницы платформы', 403)
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return failure('Требуется авторизация', 401)
  if (user.role !== 'admin') return failure('Управление контентом доступно только администратору', 403)
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return failure('Слишком длинная ссылка', 413)
  let url: unknown
  try {
    const body: unknown = JSON.parse(raw)
    url = body && typeof body === 'object' && 'url' in body ? body.url : undefined
  } catch {
    return failure('Невалидный JSON', 400)
  }
  if (typeof url !== 'string' || !url.trim()) return failure('Укажите ссылку на папку Яндекс Диска', 400)
  try {
    return Response.json({ files: await listSlideFolder(url) }, { headers: HEADERS })
  } catch (error) {
    if (error instanceof SlidesError) return failure(error.message, 400)
    payload.logger.error({ msg: 'Slides folder listing failed', error: error instanceof Error ? error.name : 'UnknownError' })
    return failure('Не удалось прочитать папку. Повторите попытку', 502)
  }
}

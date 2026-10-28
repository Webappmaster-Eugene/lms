import { BootcampLeadError, parseBootcampLead } from '@/lib/bootcamp-leads'
import { getPayload } from '@/lib/payload'
import { logger } from '@/lib/telemetry'
import { saveBootcampLead } from '@/server/bootcamp-leads'
import { readRequestJson, RequestBodyError } from '@/server/read-json-body'
import { trustedClientIp } from '@/server/client-ip'
// Форма живёт на лендинге, а nginx лендинга проксирует сюда тот же путь: запрос приходит с того же origin.
import { foreignPage } from '@/server/foreign-page'
import { createRateLimiter } from '@/server/trainer/rate-limit'

export const dynamic = 'force-dynamic'

const WINDOW_MS = 10 * 60_000
// Человеку хватает одной-двух отправок; общий предел держит базу, если адрес клиента неизвестен.
const perClient = createRateLimiter('bootcamp-leads-client', 5, WINDOW_MS)
const overall = createRateLimiter('bootcamp-leads-all', 200, WINDOW_MS)

const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

/** POST /api/bootcamp/leads — предзапись с лендинга без входа в LMS. */
export async function POST(request: Request) {
  try {
    if (foreignPage(request.headers)) return response({ error: 'Отправьте заявку со страницы буткемпа.' }, 403)
    const input = parseBootcampLead(await readRequestJson(request, 4096))
    const ip = trustedClientIp(request.headers)
    // Сначала лимит адреса: иначе отсечённые запросы одного клиента выбирали бы общий и закрывали форму всем.
    if ((ip !== null && !perClient.take(ip)) || !overall.take('all')) {
      return response({ error: 'Слишком много заявок подряд. Попробуйте через 10 минут.' }, 429, { 'Retry-After': String(WINDOW_MS / 1000) })
    }
    // Роботу — тот же ответ, что человеку, чтобы он не подбирал обход.
    if (input.trap) return response({ ok: true })
    const saved = await saveBootcampLead(await getPayload(), input)
    void saved.notification
    return response({ ok: true })
  } catch (error) {
    if (error instanceof BootcampLeadError || error instanceof RequestBodyError) return response({ error: error.message }, error.status)
    logger.error('Bootcamp lead was not saved', error)
    return response({ error: 'Заявка не сохранилась из-за ошибки на сервере. Отправьте её ещё раз через минуту.' }, 500)
  }
}

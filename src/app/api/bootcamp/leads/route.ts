import { BootcampLeadError, isLeadTrap, LEAD_BODY_MAX_BYTES, leadBodyFromForm, parseBootcampLead } from '@/lib/bootcamp-leads'
import { getPayload } from '@/lib/payload'
import { logger } from '@/lib/telemetry'
import { readLeadResume, saveBootcampLead } from '@/server/bootcamp-leads'
import { readRequestForm, RequestBodyError } from '@/server/read-json-body'
import { trustedClientIp } from '@/server/client-ip'
// Форма живёт на лендинге, а nginx лендинга проксирует сюда тот же путь: запрос приходит с того же origin.
import { foreignPage } from '@/server/foreign-page'
import { createRateLimiter } from '@/server/trainer/rate-limit'

export const dynamic = 'force-dynamic'

const WINDOW_MS = 10 * 60_000
// Человеку хватает одной-двух отправок; общий предел держит базу, если адрес клиента неизвестен.
const perClient = createRateLimiter('bootcamp-leads-client', 5, WINDOW_MS)
const overall = createRateLimiter('bootcamp-leads-all', 200, WINDOW_MS)

// Заявка держит в памяти до 5 МБ, а лимиты выше считают запросы за окно, а не одновременные чтения.
const MAX_CONCURRENT = 8
const BODY_DEADLINE_MS = 120_000
let processing = 0

const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

/** POST /api/bootcamp/leads — предзапись с лендинга без входа в LMS. */
export async function POST(request: Request) {
  try {
    if (foreignPage(request.headers)) return response({ error: 'Отправьте заявку со страницы буткемпа.' }, 403)
    const ip = trustedClientIp(request.headers)
    // Сначала лимит адреса: иначе отсечённые запросы одного клиента выбирали бы общий и закрывали форму всем.
    // До чтения тела: разбирать пять мегабайт ради отказа незачем.
    if ((ip !== null && !perClient.take(ip)) || !overall.take('all')) {
      return response({ error: 'Слишком много заявок подряд. Попробуйте через 10 минут.' }, 429, { 'Retry-After': String(WINDOW_MS / 1000) })
    }
    if (processing >= MAX_CONCURRENT) {
      return response({ error: 'Сейчас много заявок. Отправьте ещё раз через минуту, введённое осталось в форме.' }, 503, { 'Retry-After': '60' })
    }
    processing += 1
    try {
      const form = await readRequestForm(request, LEAD_BODY_MAX_BYTES, BODY_DEADLINE_MS)
      const body = leadBodyFromForm(form)
      // Роботу - тот же ответ, что человеку, и раньше проверок: по их текстам он подбирал бы обход.
      if (isLeadTrap(body)) return response({ ok: true })
      const input = parseBootcampLead(body)
      const resume = await readLeadResume(form.get('resume'))
      const saved = await saveBootcampLead(await getPayload(), input, resume)
      void saved.notification
      return response({ ok: true })
    } finally {
      processing -= 1
    }
  } catch (error) {
    if (error instanceof BootcampLeadError) return response({ error: error.message, field: error.field }, error.status)
    if (error instanceof RequestBodyError && error.status === 413) return response({ error: 'Файл резюме больше 5 МБ. Приложите файл поменьше или дайте ссылку на него.', field: 'resume' }, 413)
    // Страница, открытая до выката, шлёт JSON без анкеты.
    if (error instanceof RequestBodyError && error.status === 415) return response({ error: 'Форма на странице устарела. Обновите страницу и заполните заявку ещё раз.' }, 415)
    if (error instanceof RequestBodyError) return response({ error: error.message }, error.status)
    logger.error('Bootcamp lead was not saved', error)
    return response({ error: 'Заявка не сохранилась из-за ошибки на сервере. Отправьте её ещё раз через минуту.' }, 500)
  }
}

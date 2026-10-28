import 'server-only'

import { getPayload } from '@/lib/payload'
import { logger } from '@/lib/telemetry'
import { TrainerSpecError } from '@/lib/trainer/spec'
import { findLeadByEntryTaskToken } from '@/server/bootcamp-entry-task'
import { EntrySubmissionError } from '@/server/bootcamp-entry-submission'
import { foreignPage } from '@/server/foreign-page'
import { RequestBodyError } from '@/server/read-json-body'
import type { RateLimiter } from '@/server/trainer/rate-limit'
import { TrainerRunnerError } from '@/server/trainer/pool'
import type { BootcampLead } from '@/payload-types'
import type { Payload } from 'payload'

export const entryTaskResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

type Limits = { perLink: RateLimiter, overall: RateLimiter, windowSeconds: number }

/**
 * Общая часть «Проверить» и «Отправить решение»: запрос со своей страницы, живая
 * личная ссылка, предел на ссылку и общий. Пул песочниц общий с тренажёром.
 */
export async function handleEntryTaskRequest(
  request: Request,
  token: string,
  limits: Limits,
  action: (payload: Payload, lead: BootcampLead) => Promise<Response>,
): Promise<Response> {
  try {
    if (foreignPage(request.headers)) return entryTaskResponse({ error: 'Откройте задание по ссылке из письма.' }, 403)
    const payload = await getPayload()
    const lead = await findLeadByEntryTaskToken(payload, token)
    if (!lead) return entryTaskResponse({ error: 'Ссылка на задание не найдена. Проверьте адрес из письма.' }, 404)
    if (!limits.perLink.take(token) || !limits.overall.take('all')) {
      return entryTaskResponse({ error: 'Слишком много запросов подряд. Подождите минуту и попробуйте снова.' }, 429, { 'Retry-After': String(limits.windowSeconds) })
    }
    return await action(payload, lead)
  } catch (error) {
    if (error instanceof EntrySubmissionError || error instanceof RequestBodyError) return entryTaskResponse({ error: error.message }, error.status)
    if (error instanceof TrainerRunnerError) {
      logger.error('Entry task sandbox is unavailable', error)
      return entryTaskResponse({ error: error.overloaded ? 'Проверка сейчас загружена. Попробуйте через несколько секунд.' : 'Проверка временно недоступна. Попробуйте ещё раз через минуту.' }, 503)
    }
    if (error instanceof TrainerSpecError) logger.error('Entry task is misconfigured', error)
    else logger.error('Entry task request failed', error)
    return entryTaskResponse({ error: 'Не получилось проверить решение из-за ошибки на сервере. Попробуйте ещё раз через минуту.' }, 500)
  }
}

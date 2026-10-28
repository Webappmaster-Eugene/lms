import { parseEntrySolutions, submitEntrySolutions } from '@/server/bootcamp-entry-submission'
import { entryTaskResponse, handleEntryTaskRequest } from '@/server/entry-task-route'
import { readRequestJson } from '@/server/read-json-body'
import { createRateLimiter } from '@/server/trainer/rate-limit'

export const dynamic = 'force-dynamic'

// Каждая отправка пишет заявку и шлёт письмо команде: людям хватает нескольких попыток.
const perLink = createRateLimiter('entry-task-submit-link', 5, 10 * 60_000)
const overall = createRateLimiter('entry-task-submit-all', 100, 10 * 60_000)

type Props = { params: Promise<{ token: string }> }

/** POST /api/entry-task/<токен>/submit — серверный прогон всех задач и запись решения в заявку. */
export async function POST(request: Request, { params }: Props) {
  const { token } = await params
  return handleEntryTaskRequest(request, token, { perLink, overall, windowSeconds: 600 }, async (payload, lead) => {
    const solutions = parseEntrySolutions(await readRequestJson(request, 256 * 1024))
    return entryTaskResponse(await submitEntrySolutions(payload, lead, solutions))
  })
}

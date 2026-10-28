import { checkEntryTask, parseEntryCheck } from '@/server/bootcamp-entry-submission'
import { entryTaskResponse, handleEntryTaskRequest } from '@/server/entry-task-route'
import { readRequestJson } from '@/server/read-json-body'
import { createRateLimiter } from '@/server/trainer/rate-limit'

export const dynamic = 'force-dynamic'

// Человек жмёт «Проверить» раз в несколько секунд; общий предел бережёт песочницы тренажёра.
const perLink = createRateLimiter('entry-task-check-link', 30, 60_000)
const overall = createRateLimiter('entry-task-check-all', 300, 60_000)

type Props = { params: Promise<{ token: string }> }

/** POST /api/entry-task/<токен>/check — прогон тестов одной задачи без записи результата. */
export async function POST(request: Request, { params }: Props) {
  const { token } = await params
  return handleEntryTaskRequest(request, token, { perLink, overall, windowSeconds: 60 }, async () => {
    // 20 000 знаков кода с кириллицей в комментариях занимают до 60 КБ.
    const { task, code } = parseEntryCheck(await readRequestJson(request, 128 * 1024))
    return entryTaskResponse({ result: await checkEntryTask(task, code) })
  })
}

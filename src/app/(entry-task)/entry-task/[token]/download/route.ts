import { getPayload } from '@/lib/payload'
import { logger } from '@/lib/telemetry'
import { currentEntryTask, findLeadByEntryTaskToken, readEntryTaskArchive } from '@/server/bootcamp-entry-task'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

const notFound = (message: string) => new Response(message, {
  status: 404,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
})

/** Архив задания по личной ссылке кандидата: без ссылки файл видит только администратор. */
export async function GET(_request: Request, { params }: Context): Promise<Response> {
  try {
    const { token } = await params
    const payload = await getPayload()
    const lead = await findLeadByEntryTaskToken(payload, token)
    if (!lead) return notFound('Ссылка на задание не найдена')
    const task = await currentEntryTask(payload, lead.program)
    const archive = task ? await readEntryTaskArchive(payload, task) : null
    if (!archive) return notFound('Задание сейчас обновляется. Попробуйте позже или ответьте на письмо с заданием.')
    return new Response(new Uint8Array(archive), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="mentorcareer-entry-task.zip"',
        'Content-Length': String(archive.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch (error) {
    logger.error('Bootcamp entry task download failed', error)
    return new Response('Не удалось отдать задание. Попробуйте через минуту.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
}

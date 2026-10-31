import { getPayload } from '@/lib/payload'
import { logger } from '@/lib/telemetry'
import { handleResultNotice } from '@/server/bootcamp-payment'

export const dynamic = 'force-dynamic'

const plain = (body: string, status: number) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

async function respond(params: Record<string, string>): Promise<Response> {
  try {
    const { status, body } = await handleResultNotice(await getPayload(), params)
    return plain(body, status)
  } catch (error) {
    // Ошибка базы или почты: не 'OK', чтобы Робокасса повторила уведомление позже.
    logger.error('Robokassa notice failed', error)
    return plain('error', 500)
  }
}

// Уведомление Робокассы - десяток коротких полей; адрес открыт без входа, поэтому тело ограничено.
const MAX_NOTICE_BYTES = 16 * 1024

async function readForm(request: Request): Promise<Record<string, string> | null> {
  if (Number(request.headers.get('content-length')) > MAX_NOTICE_BYTES) return null
  const reader = request.body?.getReader()
  if (!reader) return {}
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > MAX_NOTICE_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')).entries())
}

/** ResultURL магазина (метод POST в настройках Робокассы, тело application/x-www-form-urlencoded). */
export async function POST(request: Request) {
  const params = await readForm(request).catch(() => null)
  if (!params) return plain('bad request', 400)
  return respond(params)
}

/** Тот же ResultURL, если в настройках магазина выбран GET. */
export async function GET(request: Request) {
  return respond(Object.fromEntries(new URL(request.url).searchParams.entries()))
}

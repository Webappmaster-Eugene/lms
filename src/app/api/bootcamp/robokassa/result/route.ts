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

/** ResultURL магазина (метод POST в настройках Робокассы). */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  if (!form) return plain('bad request', 400)
  const params: Record<string, string> = {}
  for (const [key, value] of form.entries()) if (typeof value === 'string') params[key] = value
  return respond(params)
}

/** Тот же ResultURL, если в настройках магазина выбран GET. */
export async function GET(request: Request) {
  return respond(Object.fromEntries(new URL(request.url).searchParams.entries()))
}

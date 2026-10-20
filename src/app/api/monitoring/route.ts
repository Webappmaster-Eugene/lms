import { forwardEnvelope } from '@/server/error-tunnel'

export const dynamic = 'force-dynamic'

/** Туннель отчётов браузера в Sentry, см. src/lib/error-reporting/sentry-options.ts. */
export async function POST(request: Request): Promise<Response> {
  return forwardEnvelope(request)
}

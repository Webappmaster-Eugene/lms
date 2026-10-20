import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { captureThrottled } from '@/lib/error-reporting/capture'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config })
    await payload.find({ collection: 'users', limit: 1, depth: 0 })

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[health] проверка не прошла', error)
    // Docker спрашивает здоровье каждые 30 секунд: о лежащей базе нужно одно
    // событие в несколько минут, а не сотня за время сбоя.
    captureThrottled('health-check-failed', 5 * 60_000, error, {
      level: 'fatal',
      message: 'Проверка здоровья не прошла: Payload или PostgreSQL недоступны',
      tags: { component: 'health' },
      fingerprint: ['health-check-failed'],
    })

    return NextResponse.json(
      { status: 'error', timestamp: new Date().toISOString() },
      { status: 503 },
    )
  }
}

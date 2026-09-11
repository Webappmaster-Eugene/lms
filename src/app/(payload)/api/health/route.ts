import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

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
    // Наружу причина не отдаётся, но без неё unhealthy-контейнер нечем объяснить:
    // Traefik снимает такой контейнер с маршрутизации, и снаружи виден только 404
    console.error('[health] проверка не прошла', error)

    return NextResponse.json(
      { status: 'error', timestamp: new Date().toISOString() },
      { status: 503 },
    )
  }
}

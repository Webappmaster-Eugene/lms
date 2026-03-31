import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config })
    await payload.find({ collection: 'users', limit: 0 })

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json(
      { status: 'error', timestamp: new Date().toISOString() },
      { status: 503 },
    )
  }
}

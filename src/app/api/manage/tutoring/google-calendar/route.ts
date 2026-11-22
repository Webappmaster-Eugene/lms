import type { NextRequest } from 'next/server'

import { logger } from '@/lib/telemetry'
import { disconnectTutoringCalendar } from '@/server/tutoring-calendar-account'
import { calendarAdmin, calendarRedirect, calendarResult, setCalendarState } from '@/server/tutoring-calendar-http'
import { googleStateLifetime, startGoogleAuthorization, tutoringGoogleConfig, tutoringGoogleOrigin } from '@/server/tutoring-google'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== tutoringGoogleOrigin()) return new Response(null, { status: 403 })
  try {
    const admin = await calendarAdmin(request)
    if (!admin) return new Response(null, { status: 403 })
    if (request.nextUrl.searchParams.get('operation') === 'disconnect') {
      await disconnectTutoringCalendar(admin.payload, admin.user)
      return calendarResult('disconnected')
    }
    const config = tutoringGoogleConfig()
    if (!config) return calendarResult('unavailable')
    const { url, sealedState } = startGoogleAuthorization(config, admin.user.id, admin.session)
    return setCalendarState(calendarRedirect(url), sealedState, googleStateLifetime)
  } catch {
    logger.warn('Tutoring calendar account action failed')
    return calendarResult('failed')
  }
}

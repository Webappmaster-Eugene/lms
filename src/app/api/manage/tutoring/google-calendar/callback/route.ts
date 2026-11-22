import type { NextRequest } from 'next/server'

import { logger } from '@/lib/telemetry'
import { connectTutoringCalendar } from '@/server/tutoring-calendar-account'
import { calendarAdmin, calendarResult } from '@/server/tutoring-calendar-http'
import { GoogleCalendarError, exchangeGoogleCode, googleStateCookie, tutoringGoogleConfig, verifyGoogleState } from '@/server/tutoring-google'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const config = tutoringGoogleConfig()
  if (!config) return calendarResult('unavailable')

  try {
    const admin = await calendarAdmin(request)
    const sealedState = request.cookies.get(googleStateCookie)?.value
    const state = request.nextUrl.searchParams.get('state')
    if (!admin || !sealedState || !state) return calendarResult('expired')
    const verifier = verifyGoogleState(config, sealedState, state, admin.user.id, admin.session)
    if (!verifier) return calendarResult('expired')
    if (request.nextUrl.searchParams.has('error')) return calendarResult('denied')
    const code = request.nextUrl.searchParams.get('code')
    if (!code) return calendarResult('failed')

    const google = await exchangeGoogleCode(config, code, verifier)
    const connected = await connectTutoringCalendar(admin.payload, admin.user, config, google)
    return calendarResult(connected ? 'connected' : 'different-account')
  } catch (error) {
    if (error instanceof GoogleCalendarError && error.reason === 'consent') return calendarResult('denied')
    logger.warn('Tutoring calendar OAuth callback failed', { 'google.status': error instanceof GoogleCalendarError ? error.status : 0 })
    return calendarResult('failed')
  }
}

import 'server-only'

import { type NextRequest, NextResponse } from 'next/server'
import { createLocalReq } from 'payload'

import { getPayload } from '@/lib/payload'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { googleCalendarAdminPath, googleCalendarApiPath, googleStateCookie, tutoringGoogleOrigin } from '@/server/tutoring-google'

export async function calendarAdmin(request: NextRequest) {
  const session = request.cookies.get('payload-token')?.value
  if (!session) return null
  const payload = await getPayload()
  const req = await createLocalReq({}, payload)
  // The start route verifies Origin. The cross-site callback verifies the state bound to this session.
  const { user } = await payload.auth({ headers: new Headers({ authorization: `JWT ${session}`, DisableAutologin: 'true' }), req })
  if (!user || user.isActive === false || (await getAuthoritativeLearningPolicy(payload, user.id, req)).role !== 'admin') return null
  return { payload, user, session }
}

export function calendarRedirect(url: URL) {
  const response = NextResponse.redirect(url, 303)
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

export function setCalendarState(response: NextResponse, value: string, maxAge: number) {
  response.cookies.set(googleStateCookie, value, {
    path: `${googleCalendarApiPath}/callback`, maxAge, httpOnly: true, sameSite: 'lax', secure: tutoringGoogleOrigin().startsWith('https:'),
  })
  return response
}

export function calendarResult(result: string) {
  const url = new URL(googleCalendarAdminPath, tutoringGoogleOrigin())
  url.searchParams.set('result', result)
  return setCalendarState(calendarRedirect(url), '', 0)
}

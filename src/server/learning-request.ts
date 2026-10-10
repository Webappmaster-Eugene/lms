import 'server-only'

import { cache } from 'react'
import { headers } from 'next/headers'
import { createLocalReq } from 'payload'
import { getPayload } from '@/lib/payload'

/** React scopes this memo to one render, including its layout and metadata. */
export const getLearningRequest = cache(async () => {
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: await headers() })
  const req = await createLocalReq({ user: user ?? undefined }, payload)
  return { payload, user, req }
})

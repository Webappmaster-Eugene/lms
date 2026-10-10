import 'server-only'

import { cache } from 'react'
import { headers } from 'next/headers'
import { createLocalReq } from 'payload'
import { getPayload } from '@/lib/payload'

/** React scopes this memo to one render, including its layout and metadata. */
export const getLearningRequest = cache(async () => {
  const payload = await getPayload()
  // Payload auth evaluates collection access; retain that request's already calculated policy.
  const req = await createLocalReq({}, payload)
  const { user } = await payload.auth({ headers: await headers(), req })
  return { payload, user, req }
})

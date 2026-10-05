import 'server-only'

import { cache } from 'react'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import type { CollectionSlug, Where } from 'payload'

import { getPayload } from '@/lib/payload'
import { collectAllPages } from '@/lib/paginate'

export const requireContentAdmin = cache(async () => {
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect('/login?redirect=%2Fmanage')
  if (user.role !== 'admin') notFound()
  return { payload, user }
})

export function contentId(value: string) {
  const id = Number(value)
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id)) notFound()
  return id
}

export function relationId(value: number | { id: number } | null | undefined) {
  return typeof value === 'object' ? value?.id ?? null : value ?? null
}

export async function managedDocument<T extends CollectionSlug>(collection: T, value: string) {
  const id = contentId(value)
  const { payload, user } = await requireContentAdmin()
  try {
    return await payload.findByID({ collection, id, depth: 0, user, overrideAccess: false })
  } catch (error) {
    if (typeof error === 'object' && error && 'status' in error && error.status === 404) notFound()
    throw error
  }
}

export async function managedList<T extends CollectionSlug>(collection: T, where?: Where) {
  const { payload, user } = await requireContentAdmin()
  return collectAllPages(
    ({ page, limit }) => payload.find({ collection, where, depth: 0, user, overrideAccess: false, sort: ['order', 'id'], page, limit }),
    { label: `управление ${collection}` },
  )
}

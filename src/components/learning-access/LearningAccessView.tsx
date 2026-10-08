import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { redirect } from 'next/navigation'

import { LearningAccessManager } from './LearningAccessManager'

export function LearningAccessView({ params, searchParams, initPageResult }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult
  if (req.user?.role !== 'admin') redirect('/')
  const raw = searchParams?.user
  const initialUserId = typeof raw === 'string' && /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null
  return (
    <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user} visibleEntities={visibleEntities}>
      <LearningAccessManager initialUserId={initialUserId} />
    </DefaultTemplate>
  )
}

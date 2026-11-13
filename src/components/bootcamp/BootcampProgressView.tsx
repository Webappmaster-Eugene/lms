import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { redirect } from 'next/navigation'

import { getLearningAccess } from '@/server/learning-access'
import { BootcampProgressManager } from './BootcampProgressManager'

export async function BootcampProgressView({ params, searchParams, initPageResult }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult
  if (!req.user || !(await getLearningAccess(req.payload, req.user, req)).admin) redirect('/')
  const raw = searchParams?.stream
  const initialStream = typeof raw === 'string' && /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null
  return (
    <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user} visibleEntities={visibleEntities}>
      <BootcampProgressManager initialStream={initialStream} />
    </DefaultTemplate>
  )
}

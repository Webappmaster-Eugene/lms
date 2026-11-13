import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { redirect } from 'next/navigation'

import { getLearningAccess } from '@/server/learning-access'
import { LearningAnalyticsManager } from './LearningAnalyticsManager'

export async function LearningAnalyticsView({ params, searchParams, initPageResult }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult
  if (!req.user || !(await getLearningAccess(req.payload, req.user, req)).admin) redirect('/')
  return (
    <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user} visibleEntities={visibleEntities}>
      <LearningAnalyticsManager />
    </DefaultTemplate>
  )
}

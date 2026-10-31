import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { redirect } from 'next/navigation'

import { parseFunnelFilter } from '@/lib/bootcamp-funnel'
import { logger } from '@/lib/telemetry'
import { bootcampFunnel, FUNNEL_ADMIN_PATH, type FunnelReport } from '@/server/bootcamp-funnel'
import { getLearningAccess } from '@/server/learning-access'
import { BootcampFunnelReport } from './BootcampFunnelReport'

export async function BootcampFunnelView({ params, searchParams, initPageResult }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult
  if (!req.user || !(await getLearningAccess(req.payload, req.user, req)).admin) redirect('/')
  const filter = parseFunnelFilter(searchParams, new Date())
  let report: FunnelReport | null = null
  try {
    report = await bootcampFunnel(req.payload, filter)
  } catch (error) {
    logger.error('Bootcamp funnel report failed', error)
  }
  return (
    <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user} visibleEntities={visibleEntities}>
      {report
        ? <BootcampFunnelReport report={report} filter={filter} action={FUNNEL_ADMIN_PATH} />
        : <div className="bootcamp-funnel"><h1>Воронка буткемпа</h1><p role="alert">Не удалось посчитать воронку: база не ответила. Обновите страницу через минуту, подробности в журнале приложения.</p></div>}
    </DefaultTemplate>
  )
}

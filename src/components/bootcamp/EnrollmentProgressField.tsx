import Link from 'next/link'
import type { UIFieldServerProps } from 'payload'

import { readSteps, statusLabel, stepLabel } from '@/lib/bootcamp-enrollment'
import { relationId } from '@/lib/relation-id'
import { EnrollmentSteps } from './EnrollmentSteps'
import { DefensePanel } from './DefensePanel'
import { LegacyCoursePanel } from './LegacyCoursePanel'
import { legacyCourseChoices } from '@/server/bootcamp-course-confirmation'
import { webLink } from '@/lib/bootcamp-defense'

import './enrollment-admin.scss'

/** Карточка зачисления в CMS: шаги по порядку и ссылки на заявку и проект. */
export async function EnrollmentProgressField({ id, req }: UIFieldServerProps) {
  if (req.user?.role !== 'admin' || id === undefined) return null
  const doc = await req.payload.findByID({ collection: 'bootcamp-enrollments', id: Number(id), depth: 0, overrideAccess: true, disableErrors: true })
  if (!doc) return null
  const studentId = doc.lmsUser ? relationId(doc.lmsUser) : null
  const url = webLink(doc.defenseUrl)
  const defense = doc.defenseOutcome && url && doc.defenseRecordedAt
    ? { outcome: doc.defenseOutcome, url, recordedAt: doc.defenseRecordedAt } : null
  return (
    <div className="enrollment">
      <p className="enrollment__title">{statusLabel(doc.status)}</p>
      <EnrollmentSteps steps={readSteps(doc.steps).map((step) => ({ ...step, label: stepLabel(step.key) }))} />
      {doc.error && <p className="enrollment__error">{doc.error}</p>}
      <p className="enrollment__links">
        <Link href={`/admin/collections/bootcamp-leads/${relationId(doc.lead)}`}>Заявка: повторить или посмотреть ход</Link>
        {doc.gitlabProjectUrl && <a href={doc.gitlabProjectUrl} target="_blank" rel="noreferrer">Проект в GitLab</a>}
      </p>
      {!doc.manualsCourse && <LegacyCoursePanel id={doc.id} studentId={studentId} choices={studentId ? await legacyCourseChoices(req, studentId) : []} refunded={Boolean(doc.revokeRequestedAt || doc.revokedAt)} />}
      {doc.status === 'done' && !doc.revokeRequestedAt && !doc.revokedAt && <DefensePanel enrollment={doc.id} initial={defense} />}
    </div>
  )
}

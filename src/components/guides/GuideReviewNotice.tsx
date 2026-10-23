import Link from 'next/link'
import type { BeforeListServerProps } from 'payload'

import { guideReviewHorizon, guideReviewState } from '@/lib/guides'
import { collectAllPages } from '@/lib/paginate'
import { formatDate } from '@/lib/utils'

import './guide-admin.scss'

/** Над списком гайдов в CMS: что пора пересмотреть — цифры в гайдах устаревают быстрее текста. */
export async function GuideReviewNotice({ payload, user }: BeforeListServerProps) {
  if (user?.role !== 'admin') return null
  const soon = guideReviewHorizon()
  const guides = await collectAllPages(
    ({ page, limit }) => payload.find({ collection: 'guides', where: { reviewBy: { less_than_equal: soon } }, select: { title: true, reviewBy: true, isPublished: true }, sort: 'reviewBy', depth: 0, page, limit, overrideAccess: true }),
    { label: 'гайды к пересмотру' },
  )
  const unreviewed = await payload.count({ collection: 'guides', where: { reviewedAt: { exists: false } }, overrideAccess: true })
  if (!guides.length && !unreviewed.totalDocs) return null
  return (
    <section className="guide-review-notice" aria-labelledby="guide-review-notice-title">
      <h2 id="guide-review-notice-title">Пора пересмотреть</h2>
      {guides.length > 0 && (
        <ul>
          {guides.map((guide) => (
            <li key={guide.id}>
              <Link href={`/admin/collections/guides/${guide.id}`}>{guide.title}</Link>
              <span className={guideReviewState(guide.reviewBy) === 'overdue' ? 'guide-review-notice__overdue' : undefined}>
                {guideReviewState(guide.reviewBy) === 'overdue' ? 'срок прошёл' : 'срок'} {formatDate(guide.reviewBy ?? '')}
                {!guide.isPublished && ' · черновик'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {unreviewed.totalDocs > 0 && (
        <p>
          Без даты проверки: {unreviewed.totalDocs}. Сверьте цифры и ссылки, поставьте «Данные проверены» — ученик увидит, насколько свежий гайд.
        </p>
      )}
      <p className="guide-review-notice__hint">Ссылки всех гайдов проверяет команда <code>pnpm guide:check-links</code>.</p>
    </section>
  )
}

import Link from 'next/link'
import type { UIFieldServerProps } from 'payload'

import './guide-admin.scss'

/** Боковая панель гайда в CMS: сколько учеников открыли гайд и что о нём сказали. */
export async function GuideStats({ id, req }: UIFieldServerProps) {
  if (req.user?.role !== 'admin' || id === undefined) return null
  const guide = Number(id)
  const count = (helpful?: 'yes' | 'no', comment = false) => req.payload.count({
    collection: 'guide-reads',
    where: { and: [{ guide: { equals: guide } }, ...(helpful ? [{ helpful: { equals: helpful } }] : []), ...(comment ? [{ comment: { exists: true } }] : [])] },
    overrideAccess: true,
    req,
  }).then((result) => result.totalDocs)
  const [readers, yes, no, comments] = await Promise.all([count(), count('yes'), count('no'), count(undefined, true)])
  const list = `/admin/collections/guide-reads?where[guide][equals]=${guide}`
  return (
    <div className="guide-stats">
      <p className="guide-stats__title">Ученики</p>
      <dl>
        <div><dt>Открыли</dt><dd>{readers}</dd></div>
        <div><dt>Помог</dt><dd>{yes}</dd></div>
        <div><dt>Не помог</dt><dd>{no}</dd></div>
        <div><dt>Комментарии</dt><dd>{comments}</dd></div>
      </dl>
      {readers > 0 && <Link href={list}>Все прочтения и отзывы</Link>}
    </div>
  )
}

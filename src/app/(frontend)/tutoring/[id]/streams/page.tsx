import { randomUUID } from 'node:crypto'
import Link from 'next/link'

import { ManagementHeading } from '@/components/content-management/ManagementHeading'
import { TutoringWorkQueue } from '@/components/tutoring/TutoringWorkQueue'
import { notFound } from 'next/navigation'
import { requireTutoringProgram } from '@/server/tutoring-bootcamps'
import { collectAllPages } from '@/lib/paginate'
import { isMoscowTuesday, scheduledTutoringMeeting, tutoringDateLabel, tutoringPrograms } from '@/lib/tutoring'
import { TutoringStreamForm } from '@/components/tutoring/TutoringStreamForm'

export const metadata = { title: 'Потоки репетиторства' }
const labels = { draft: 'Черновик', active: 'Открыт', archived: 'Архив' }

export default async function TutoringManagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; tasks?: string; page?: string }> }) {
  const { payload, user, req, isAdmin, course, base } = await requireTutoringProgram((await params).id)
  if (!isAdmin) notFound()
  const [streams, calendars, query] = await Promise.all([
    collectAllPages(({ page, limit }) => payload.find({ collection: 'tutoring-streams', depth: 0, overrideAccess: false, user, req, where: { program: { equals: course.program } }, page, limit, sort: '-startsAt' }), { label: 'Потоки репетиторства' }),
    collectAllPages(({ page, limit }) => payload.find({
      collection: 'bootcamp-streams', page, limit, depth: 0, req, overrideAccess: false,
      where: { program: { equals: course.program } }, sort: '-startsAt', select: { title: true, startsAt: true },
    }), { label: 'Календари буткемпа' }),
    searchParams,
  ])

  return <>
    <ManagementHeading title="Потоки репетиторства" description="Назначайте встречи и проверяйте домашние работы учеников." />
    <TutoringWorkQueue program={course.program} streams={streams} kind={query.tasks} page={query.page} />
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label="Список потоков" className="min-w-0">
        {streams.length === 0 ? <p className="border-y border-border py-6 text-muted-foreground">Потоков пока нет. Создайте первый поток и добавьте учеников.</p> :
          <ul className="divide-y divide-border border-y border-border">
            {streams.map(stream => <li key={stream.id}>
              <Link href={`${base}/streams/${stream.id}`} className="block rounded-md px-3 py-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                <span className="block wrap-anywhere font-semibold">{stream.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {tutoringPrograms[stream.program].label} · {labels[stream.status]} · {tutoringDateLabel(scheduledTutoringMeeting(stream, 1).start)}, МСК
                </span>
              </Link>
            </li>)}
          </ul>}
      </section>
      <TutoringStreamForm program={course.program} creationKey={randomUUID()} initialError={query.error}
        calendars={calendars.filter(item => isMoscowTuesday(item.startsAt)).map(item => ({
          id: item.id, label: `${item.title} · ${tutoringDateLabel(new Date(item.startsAt))}`,
        }))} />
    </div>
  </>
}

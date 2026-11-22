import Link from 'next/link'

import { ManagementHeading, managementPrimary } from '@/components/content-management/ManagementHeading'
import { notFound } from 'next/navigation'
import { requireTutoringBootcamp } from '@/server/tutoring-bootcamps'
import { collectAllPages } from '@/lib/paginate'
import { scheduledTutoringMeeting, tutoringDateLabel, tutoringPrograms } from '@/lib/tutoring'
import { createTutoringStream } from '@/server/tutoring-actions'

export const metadata = { title: 'Потоки репетиторства' }
const labels = { draft: 'Черновик', active: 'Открыт', archived: 'Архив' }

export default async function TutoringManagePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { payload, user, req, isAdmin, course, base } = await requireTutoringBootcamp((await params).slug)
  if (!isAdmin) notFound()
  const [streams, query] = await Promise.all([
    collectAllPages(({ page, limit }) => payload.find({ collection: 'tutoring-streams', depth: 0, overrideAccess: false, user, req, where: { program: { equals: course.program } }, page, limit, sort: '-startsAt' }), { label: 'Потоки репетиторства' }),
    searchParams,
  ])

  return <>
    <ManagementHeading title="Потоки репетиторства" description="Назначайте встречи и проверяйте домашние работы учеников." />
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label="Список потоков" className="min-w-0">
        {streams.length === 0 ? <p className="border-y border-border py-6 text-muted-foreground">Потоков пока нет. Создайте первый поток и добавьте учеников.</p> :
          <ul className="divide-y divide-border border-y border-border">
            {streams.map(stream => <li key={stream.id}>
              <Link href={`${base}/streams/${stream.id}`} className="block rounded-md px-3 py-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                <span className="block font-semibold">{stream.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {tutoringPrograms[stream.program].label} · {labels[stream.status]} · {tutoringDateLabel(scheduledTutoringMeeting(stream, 1).start)}, МСК
                </span>
              </Link>
            </li>)}
          </ul>}
      </section>
      <form action={createTutoringStream.bind(null, course.program)} className="grid h-fit gap-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Создать поток</h2>
        {query.error && <p role="alert" className="text-sm text-destructive">{query.error}</p>}
        <label className="grid gap-1 text-sm">Название<input className="rounded-md border border-input bg-background p-2" name="title" required maxLength={120} /></label>
        <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
          <label className="grid min-w-0 gap-1 text-sm">Первый вторник<input className="min-w-0 rounded-md border border-input bg-background p-2" name="date" type="date" required /></label>
          <label className="grid gap-1 text-sm">Время МСК<input className="min-w-0 rounded-md border border-input bg-background p-2" name="time" type="time" defaultValue="20:00" required /></label>
        </div>
        <label className="grid gap-1 text-sm">Ссылка на созвон<input className="rounded-md border border-input bg-background p-2" name="meetingUrl" type="url" maxLength={1000} /></label>
        <button className={managementPrimary}>Создать черновик</button>
      </form>
    </div>
  </>
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LearningHistoryList, RecentLearningCourses } from '@/components/learning/LearningHistory'
import { learningHistory, recentLearningCourses } from '@/server/learning-history'
import { getLearningRequest } from '@/server/learning-request'

export const metadata: Metadata = { title: 'История обучения' }

type Props = { searchParams: Promise<{ page?: string; course?: string }> }

export default async function LearningHistoryPage({ searchParams }: Props) {
  const { payload, user, req } = await getLearningRequest()
  if (!user) redirect('/login?redirect=%2Flearning-history')
  const params = await searchParams
  const page = Number(params.page ?? 1)
  const courseId = params.course ? Number(params.course) : undefined
  if (!Number.isSafeInteger(page) || page < 1 || (courseId !== undefined && (!Number.isSafeInteger(courseId) || courseId < 1))) redirect('/learning-history')
  const [history, recentCourses] = await Promise.all([
    learningHistory(payload, user, { page, limit: 20, courseId }, req),
    courseId === undefined && page === 1 ? recentLearningCourses(payload, user, 6, req) : Promise.resolve([]),
  ])
  const pageHref = (next: number) => `/learning-history?${new URLSearchParams({ page: String(next), ...(courseId === undefined ? {} : { course: String(courseId) }) })}`

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-xl font-bold sm:text-2xl">История обучения</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Здесь сохраняются открытые уроки и место остановки в видео. Повторный просмотр поднимает урок в начало списка; отметка «Пройден» появляется после завершения урока.</p>
      </header>
      <RecentLearningCourses entries={recentCourses} showHistoryLink={false} />
      <section className="space-y-4" aria-labelledby="learning-history-title">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h2 id="learning-history-title" className="text-lg font-semibold">{courseId === undefined ? 'Последние просмотры' : history.docs[0]?.course ?? 'Просмотры курса'}</h2>
          {courseId !== undefined && <Link href="/learning-history" prefetch={false} className="inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">Все курсы</Link>}
        </div>
        {history.docs.length > 0 ? <LearningHistoryList entries={history.docs} /> : <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">{page > 1 ? 'На этой странице нет просмотров. Вернитесь к предыдущей странице.' : courseId === undefined ? 'Откройте первый урок — он появится здесь. Просмотры сохраняются в аккаунте и доступны на другом устройстве.' : 'Доступных просмотров этого курса пока нет.'}</p>
          {page === 1 && courseId === undefined && <Link href="/courses" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Выбрать курс</Link>}
        </div>}
        {(page > 1 || history.hasNextPage) && <nav aria-label="Страницы истории" className="flex flex-wrap items-center justify-between gap-3">
          {page > 1 && <Link href={pageHref(page - 1)} prefetch={false} className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium">Предыдущая страница</Link>}
          <span className="text-sm text-muted-foreground">Страница {page}</span>
          {history.hasNextPage && <Link href={pageHref(page + 1)} prefetch={false} className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium">Следующая страница</Link>}
        </nav>}
      </section>
    </div>
  )
}

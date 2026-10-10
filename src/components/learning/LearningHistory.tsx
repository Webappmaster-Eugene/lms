import Link from 'next/link'
import { ArrowRight, BookOpen, CheckCircle2, History } from 'lucide-react'
import type { LearningHistoryEntry } from '@/lib/learning-history'
import { formatTime } from '@/lib/video-memory'

function viewedAt(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
  }).format(date) + ' МСК' : 'Недавно'
}

function VideoCheckpoint({ entry }: { entry: LearningHistoryEntry }) {
  if (!entry.videoTitle) return null
  return <p className="mt-1 break-words text-sm text-muted-foreground">{entry.videoTitle} · {entry.ended ? 'Видео досмотрено' : `Остановились на ${formatTime(entry.seconds ?? 0)}`}</p>
}

export function RecentLearningCourses({ entries, showHistoryLink = true }: { entries: LearningHistoryEntry[]; showHistoryLink?: boolean }) {
  if (entries.length === 0) return null
  return (
    <section aria-labelledby="recent-learning-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id="recent-learning-title" className="text-lg font-semibold">Ваше обучение</h2>
        {showHistoryLink && <Link href="/learning-history" prefetch={false} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"><History aria-hidden="true" className="h-4 w-4" />История обучения</Link>}
      </div>
      <p className="text-sm text-muted-foreground">Место остановки в каждом курсе — удобно, если учитесь параллельно.</p>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card px-4 sm:px-5">
        {entries.map(entry => <li key={entry.courseId} className="py-4">
          <Link href={entry.href} prefetch={false} className="group flex min-h-11 items-start gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
            <BookOpen aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium text-muted-foreground">{entry.course}</p>
              <p className="mt-1 break-words font-semibold group-hover:underline">{entry.title}</p>
              <VideoCheckpoint entry={entry} />
              <p className="mt-2 text-xs text-muted-foreground"><time dateTime={entry.lastViewedAt}>{viewedAt(entry.lastViewedAt)}</time>{entry.isCompleted && ' · Урок пройден'}</p>
            </div>
            <ArrowRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
          </Link>
          <Link href={`/learning-history?course=${entry.courseId}`} prefetch={false} className="mt-1 inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">Все просмотры этого курса</Link>
        </li>)}
      </ul>
    </section>
  )
}

export function LearningHistoryList({ entries }: { entries: LearningHistoryEntry[] }) {
  return (
    <ol aria-label="Просмотренные уроки" className="divide-y divide-border rounded-xl border border-border bg-card px-4 sm:px-5">
      {entries.map(entry => <li key={entry.lessonId} className="py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <time dateTime={entry.lastViewedAt}>{viewedAt(entry.lastViewedAt)}</time>
          <span className="inline-flex items-center gap-1.5">{entry.isCompleted ? <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success" /> : <BookOpen aria-hidden="true" className="h-4 w-4" />}{entry.isCompleted ? 'Урок пройден' : 'Урок открыт'}</span>
        </div>
        <Link href={`/learning-history?course=${entry.courseId}`} prefetch={false} className="mt-1 inline-flex min-h-11 items-center break-words text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{entry.course}</Link>
        <Link href={entry.href} prefetch={false} className="group flex min-h-11 items-start gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
          <div className="min-w-0 flex-1"><p className="break-words font-semibold group-hover:underline">{entry.title}</p><VideoCheckpoint entry={entry} /></div>
          <ArrowRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
        </Link>
      </li>)}
    </ol>
  )
}

import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { SlidesBlock } from '@/components/lesson/SlidesBlock'
import { tutoringDateLabel, tutoringMeetingDate } from '@/lib/tutoring'
import type { TutoringMeeting, TutoringStream } from '@/payload-types'

type Meeting = Pick<TutoringMeeting, 'title' | 'number' | 'filename' | 'homework' | 'instructorNotes'>

function MaterialText({ children }: { children: string }) {
  return <div className="prose prose-sm dark:prose-invert max-w-none break-words">
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{children}</ReactMarkdown>
  </div>
}

export function TutoringMeetingCard({ meeting, stream, mentor = false }: { meeting: Meeting; stream: TutoringStream; mentor?: boolean }) {
  return <section aria-labelledby="meeting-title" className="min-w-0 space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div>
        <p className="text-sm text-muted-foreground">Встреча {meeting.number} · {tutoringDateLabel(tutoringMeetingDate(stream.startsAt, meeting.number))}, МСК · {meeting.number % 2 ? 120 : 90} минут</p>
        <h2 id="meeting-title" className="mt-1 text-2xl font-semibold leading-tight">{meeting.title}</h2>
      </div>
      {stream.meetingUrl && <Link href={stream.meetingUrl} target="_blank" rel="noopener noreferrer"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring">Открыть созвон</Link>}
    </header>
    {meeting.filename ? <SlidesBlock title="Презентация" items={[{
      fileName: meeting.filename,
      url: `/api/tutoring-meetings/file/${encodeURIComponent(meeting.filename)}`,
    }]} /> : <p className="text-sm text-muted-foreground">Презентация пока не загружена.</p>}
    <section aria-label="Домашнее задание" className="space-y-2">
      <h3 className="text-lg font-semibold">Домашняя работа</h3>
      <ul className="divide-y divide-border border-y border-border">
        {meeting.homework.map(({ stage, description, assignment, practice }) => <li key={stage} className="space-y-2 py-4">
          <h4 className="text-sm font-semibold">Этап {String(stage).padStart(2, '0')}</h4>
          <p className="text-sm">{description}</p>
          {mentor && practice?.startsWith('/lessons/') && <Link href={practice} className="text-sm text-primary hover:underline">Практикум буткемпа</Link>}
          {assignment && <details className="rounded-lg bg-muted/40 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">Полное задание и проверка</summary>
            <div className="mt-3"><MaterialText>{assignment}</MaterialText></div>
          </details>}
        </li>)}
      </ul>
    </section>
    {mentor && meeting.instructorNotes && <details className="rounded-xl border border-border bg-card p-4">
      <summary className="cursor-pointer font-semibold">Сценарий и заметки ведущего</summary>
      <div className="mt-4"><MaterialText>{meeting.instructorNotes}</MaterialText></div>
    </details>}
  </section>
}

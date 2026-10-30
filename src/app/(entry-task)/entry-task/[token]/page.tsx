import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EntryTaskWorkspace } from '@/components/bootcamp/EntryTaskWorkspace'
import { GuideMarkdown } from '@/components/guides/GuideMarkdown'
import { ENTRY_TASK_MINUTES, ENTRY_TASKS } from '@/data/bootcamp-entry/tasks'
import { ENTRY_TASK_DUE_DAYS, ENTRY_TASK_MAX_SUBMISSIONS, ENTRY_TASK_REVIEW_DAYS, formatEntryTaskDate } from '@/lib/bootcamp-entry-task'
import { BOOTCAMP_PROGRAMS } from '@/lib/bootcamp-leads'
import { getPayload } from '@/lib/payload'
import { findLeadByEntryTaskToken } from '@/server/bootcamp-entry-task'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  // Свой заголовок целиком: шаблон платформы добавил бы длинное тире, а кандидат видит текст буткемпа.
  title: { absolute: 'Входное задание буткемпа - MentorCareer' },
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ token: string }> }

function savedSolutions(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

/** Личная страница кандидата: ссылка приходит письмом сразу после заявки на буткемп. */
export default async function EntryTaskPage({ params }: Props) {
  const { token } = await params
  const payload = await getPayload()
  const lead = await findLeadByEntryTaskToken(payload, token)
  if (!lead) notFound()
  const program = BOOTCAMP_PROGRAMS.find((item) => item.value === lead.program)?.short ?? lead.program
  // Страница динамическая: срок сверяется с моментом запроса.
  const now = new Date()
  const overdue = lead.entryTaskDueAt ? Date.parse(lead.entryTaskDueAt) < now.getTime() : false
  const name = lead.name?.trim()
  const lastSubmission = lead.entrySubmittedAt && typeof lead.entryPassed === 'number' && typeof lead.entryTotal === 'number'
    ? { at: lead.entrySubmittedAt, passed: lead.entryPassed, total: lead.entryTotal }
    : null

  return (
    <article className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Входное задание буткемпа {program}</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          {name ? `${name}, спасибо за заявку. ` : 'Спасибо за заявку. '}
          Здесь три небольшие задачи на JavaScript из жизни проката инструментов: на них обычно уходит {ENTRY_TASK_MINUTES} минут.
          Решайте прямо на этой странице, ничего устанавливать не нужно. Кнопка «Проверить» сразу прогоняет тесты и показывает, что получилось.
          Так мы поймём, с чего вам удобнее начать, а вы увидите, как устроены задачи в буткемпе.
        </p>
        <div className="rounded-xl border border-border bg-card px-5 py-4 text-base leading-relaxed">
          {lead.entryTaskDueAt
            ? overdue
              ? <p>Срок, который мы называли, прошёл {formatEntryTaskDate(lead.entryTaskDueAt)}. Решение всё равно можно отправить, мы его посмотрим.</p>
              : <p>Отправьте решение до {formatEntryTaskDate(lead.entryTaskDueAt)} включительно. Мы ответим в течение {ENTRY_TASK_REVIEW_DAYS} дней после отправки.</p>
            : <p>На задание {ENTRY_TASK_DUE_DAYS} дней с момента письма. Мы ответим в течение {ENTRY_TASK_REVIEW_DAYS} дней после отправки.</p>}
          <p className="mt-2 text-muted-foreground">Ссылка на эту страницу личная, пожалуйста, не пересылайте её.</p>
        </div>
      </header>

      <EntryTaskWorkspace
        token={token}
        tasks={ENTRY_TASKS.map((task) => ({
          slug: task.slug,
          title: task.title,
          starterCode: task.starterCode,
          testCount: task.cases.length,
          description: <GuideMarkdown markdown={task.descriptionMd} />,
        }))}
        saved={savedSolutions(lead.entrySolutions)}
        lastSubmission={lastSubmission}
        maxSubmissions={ENTRY_TASK_MAX_SUBMISSIONS}
        submissionsLeft={Math.max(0, ENTRY_TASK_MAX_SUBMISSIONS - (lead.entrySubmissionCount ?? 0))}
        reviewDays={ENTRY_TASK_REVIEW_DAYS}
      />
    </article>
  )
}

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Download } from 'lucide-react'
import { GuideMarkdown } from '@/components/guides/GuideMarkdown'
import { ENTRY_TASK_DUE_DAYS, ENTRY_TASK_REVIEW_DAYS, entryTaskPath, formatEntryTaskDate } from '@/lib/bootcamp-entry-task'
import { BOOTCAMP_PROGRAMS } from '@/lib/bootcamp-leads'
import { getPayload } from '@/lib/payload'
import { currentEntryTask, findLeadByEntryTaskToken } from '@/server/bootcamp-entry-task'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Входное задание буткемпа',
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ token: string }> }

/** Личная страница кандидата: ссылка приходит письмом сразу после заявки на буткемп. */
export default async function EntryTaskPage({ params }: Props) {
  const { token } = await params
  const payload = await getPayload()
  const lead = await findLeadByEntryTaskToken(payload, token)
  if (!lead) notFound()
  const task = await currentEntryTask(payload, lead.program)
  const program = BOOTCAMP_PROGRAMS.find((item) => item.value === lead.program)?.short ?? lead.program
  // Страница динамическая: срок сверяется с моментом запроса.
  const now = new Date()
  const overdue = lead.entryTaskDueAt ? Date.parse(lead.entryTaskDueAt) < now.getTime() : false
  const purpose = 'задание показывает, хватает ли базы по JavaScript, TypeScript и Git, чтобы с первой недели работать над backend. На него обычно уходит 3-4 часа.'
  const intro = lead.name?.trim() ? `${lead.name.trim()}, ${purpose}` : `${purpose.charAt(0).toUpperCase()}${purpose.slice(1)}`

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Входное задание буткемпа {program}</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">{intro}</p>
        <div className="rounded-xl border border-border bg-card px-5 py-4 text-base leading-relaxed">
          {lead.entryTaskDueAt
            ? overdue
              ? <p>Срок сдачи прошёл {formatEntryTaskDate(lead.entryTaskDueAt)}. Если вы всё ещё хотите сдать задание, ответьте на письмо с этой ссылкой.</p>
              : <p>Сдать решение нужно до {formatEntryTaskDate(lead.entryTaskDueAt)} включительно. Мы ответим в течение {ENTRY_TASK_REVIEW_DAYS} дней после сдачи.</p>
            : <p>На задание {ENTRY_TASK_DUE_DAYS} дней с момента письма. Мы ответим в течение {ENTRY_TASK_REVIEW_DAYS} дней после сдачи.</p>}
          <p className="mt-2 text-muted-foreground">Ссылка на эту страницу личная, не пересылайте её.</p>
        </div>
      </header>

      {task
        ? (
          <>
            <a
              href={`${entryTaskPath(token)}/download`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-base font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Download className="h-5 w-5" aria-hidden="true" />
              Скачать задание (ZIP)
            </a>
            <section aria-label="Условие задания">
              {/* Заголовок README повторил бы h1 страницы: второй h1 сбивает навигацию по заголовкам. */}
              <GuideMarkdown markdown={task.readme.replace(/^\s*#\s[^\n]*\n+/, '')} />
            </section>
          </>
        )
        : <p className="text-base leading-relaxed">Задание сейчас обновляется. Откройте эту ссылку позже или ответьте на письмо, и мы пришлём задание вручную.</p>}
    </article>
  )
}

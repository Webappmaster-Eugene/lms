import { notFound } from 'next/navigation'

import { contentId, requireContentAdmin } from '@/lib/content-management/pages'
import { ManagementHeading } from '@/components/content-management/ManagementHeading'
import { BroadcastActions } from '@/components/broadcasts/BroadcastActions'
import { BroadcastStatusBadge, audienceLabel, broadcastDate } from '@/components/broadcasts/BroadcastStatusBadge'
import { broadcastPreview, broadcastProblems, broadcastStatusCounts, emailTransportReady, resolveBroadcastAudience } from '@/server/broadcasts/service'

export const metadata = { title: 'Рассылка' }

const COUNTERS = [
  ['sent', 'Отправлено'],
  ['pending', 'В очереди'],
  ['processing', 'Отправляется'],
  ['failed', 'Не доставлено'],
  ['skipped', 'Пропущено'],
  ['cancelled', 'Остановлено'],
] as const

export default async function BroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  const id = contentId((await params).id)
  const { payload, user } = await requireContentAdmin()
  const found = await payload.find({ collection: 'email-broadcasts', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true })
  const broadcast = found.docs[0]
  if (!broadcast) notFound()
  const draft = broadcast.status === 'draft'
  const [preview, counts, problems, audience] = await Promise.all([
    broadcastPreview(payload, broadcast, user),
    draft ? null : broadcastStatusCounts(payload, id),
    draft ? [] : broadcastProblems(payload, id),
    draft ? resolveBroadcastAudience(payload, broadcast) : null,
  ])
  const transportReady = emailTransportReady(payload)
  const total = broadcast.recipientsTotal ?? 0
  const progress = counts && total > 0 ? Math.round(((counts.sent + counts.failed + counts.skipped + counts.cancelled) / total) * 100) : 0

  return (
    <>
      <ManagementHeading
        title={broadcast.subject}
        breadcrumbs={[{ href: '/manage/broadcasts', label: 'Email-рассылки' }, { href: `/manage/broadcasts/${id}`, label: broadcast.subject }]}
        actions={<BroadcastStatusBadge status={broadcast.status} />}
      />
      {!transportReady && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
          Исходящая почта на сервере не настроена. Запуск и тестовая отправка станут доступны после настройки SMTP.
        </p>
      )}
      <section aria-labelledby="broadcast-summary" className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2 id="broadcast-summary" className="sr-only">Сводка</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Получатели</dt><dd className="mt-1 font-medium text-foreground">{audienceLabel(broadcast)}</dd></div>
          <div><dt className="text-muted-foreground">{draft ? 'Получат сейчас' : 'Писем в рассылке'}</dt><dd className="mt-1 font-medium text-foreground">{draft ? audience?.userIds.length ?? 0 : total}{(draft ? audience?.excluded : broadcast.excludedCount) ? <span className="font-normal text-muted-foreground"> · исключено {draft ? audience?.excluded : broadcast.excludedCount}</span> : null}</dd></div>
          <div><dt className="text-muted-foreground">{draft ? 'Создана' : broadcast.completedAt ? 'Завершена' : 'Запущена'}</dt><dd className="mt-1 font-medium text-foreground">{broadcastDate(draft ? broadcast.createdAt : broadcast.completedAt ?? broadcast.queuedAt)}</dd></div>
        </dl>
        {counts && (
          <div className="space-y-3">
            <div className="h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Обработано писем" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${progress}%` }} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
              {COUNTERS.map(([key, label]) => (
                <div key={key} className="rounded-md border border-border p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{counts[key]}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <BroadcastActions id={id} status={broadcast.status} estimatedRecipients={draft ? audience?.userIds.length ?? 0 : total} adminEmail={user.email} transportReady={transportReady} />
      </section>

      {problems.length > 0 && (
        <section aria-labelledby="broadcast-problems" className="space-y-3">
          <h2 id="broadcast-problems" className="text-lg font-semibold text-foreground">Не доставлено и пропущено</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
            {problems.map((problem) => (
              <li key={problem.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 break-words text-foreground">{problem.name}{problem.email && <span className="text-muted-foreground"> · {problem.email}</span>}</span>
                <span className={problem.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{problem.reason || (problem.status === 'failed' ? 'не доставлено' : 'пропущено')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="broadcast-preview" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="broadcast-preview" className="text-lg font-semibold text-foreground">Предпросмотр письма</h2>
          <p className="text-xs text-muted-foreground">Так письмо увидите вы; ученики получат его со своим именем и ссылкой отписки.</p>
        </div>
        <p className="break-words rounded-md border border-border bg-card px-3 py-2 text-sm"><span className="text-muted-foreground">Тема: </span>{preview.subject}</p>
        <iframe title="Предпросмотр письма рассылки" srcDoc={preview.html} sandbox="" className="h-[640px] w-full rounded-lg border border-border bg-white" />
      </section>
    </>
  )
}

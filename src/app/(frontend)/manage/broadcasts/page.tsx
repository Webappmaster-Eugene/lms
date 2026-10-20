import Link from 'next/link'
import { Mail, Plus } from 'lucide-react'

import { requireContentAdmin } from '@/lib/content-management/pages'
import { ManagementHeading, managementLink, managementPrimary } from '@/components/content-management/ManagementHeading'
import { BroadcastStatusBadge, audienceLabel, broadcastDate } from '@/components/broadcasts/BroadcastStatusBadge'
import { emailTransportReady } from '@/server/broadcasts/service'

export const metadata = { title: 'Email-рассылки' }

const PAGE_SIZE = 30

export default async function BroadcastsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { payload } = await requireContentAdmin()
  const raw = Number((await searchParams).page ?? '1')
  const page = Number.isSafeInteger(raw) && raw > 0 && raw <= 10_000 ? raw : 1
  const list = await payload.find({ collection: 'email-broadcasts', sort: '-createdAt', page, limit: PAGE_SIZE, depth: 0, overrideAccess: true })
  const sent = await Promise.all(list.docs.map((broadcast) => broadcast.status === 'draft'
    ? Promise.resolve(0)
    : payload.count({ collection: 'email-broadcast-deliveries', where: { and: [{ broadcast: { equals: broadcast.id } }, { status: { equals: 'sent' } }] }, overrideAccess: true }).then((result) => result.totalDocs)))
  const transportReady = emailTransportReady(payload)

  return (
    <>
      <ManagementHeading
        title="Email-рассылки"
        description="Письма ученикам от имени платформы: новости, анонсы курсов, важные объявления. Каждое письмо содержит ссылку отписки."
        breadcrumbs={[{ href: '/manage/broadcasts', label: 'Email-рассылки' }]}
        actions={<Link href="/manage/broadcasts/new" className={managementPrimary}><Plus aria-hidden="true" size={16} />Новая рассылка</Link>}
      />
      {!transportReady && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
          Исходящая почта на сервере не настроена: черновики можно готовить, но письма не уйдут, пока не заданы переменные SMTP.
        </p>
      )}
      {list.docs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <Mail aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium text-foreground">Рассылок пока нет</p>
          <p className="max-w-md text-sm text-muted-foreground">Создайте черновик, посмотрите письмо в предпросмотре, отправьте тест себе и только потом запускайте рассылку.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {list.docs.map((broadcast, index) => (
            <li key={broadcast.id}>
              <Link href={`/manage/broadcasts/${broadcast.id}`} className="flex flex-col gap-2 p-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 space-y-1">
                  <span className="block break-words font-medium text-foreground">{broadcast.subject}</span>
                  <span className="block text-xs text-muted-foreground">
                    {audienceLabel(broadcast)} · {broadcast.status === 'draft' ? `создана ${broadcastDate(broadcast.createdAt)}` : `запущена ${broadcastDate(broadcast.queuedAt)}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
                  {broadcast.status !== 'draft' && <span>{sent[index]} из {broadcast.recipientsTotal ?? 0}</span>}
                  <BroadcastStatusBadge status={broadcast.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(list.hasPrevPage || list.hasNextPage) && (
        <nav aria-label="Страницы рассылок" className="flex gap-2">
          {list.hasPrevPage && <Link href={`/manage/broadcasts?page=${page - 1}`} className={managementLink}>Назад</Link>}
          {list.hasNextPage && <Link href={`/manage/broadcasts?page=${page + 1}`} className={managementLink}>Дальше</Link>}
        </nav>
      )}
    </>
  )
}

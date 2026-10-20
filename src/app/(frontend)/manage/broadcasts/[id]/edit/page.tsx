import { notFound, redirect } from 'next/navigation'

import { contentId, requireContentAdmin } from '@/lib/content-management/pages'
import { ManagementHeading } from '@/components/content-management/ManagementHeading'
import { BroadcastForm } from '@/components/broadcasts/BroadcastForm'
import { relationId } from '@/lib/relation-id'
import { resolveBroadcastAudience } from '@/server/broadcasts/service'

export const metadata = { title: 'Редактирование рассылки' }

export default async function EditBroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  const id = contentId((await params).id)
  const { payload } = await requireContentAdmin()
  const found = await payload.find({ collection: 'email-broadcasts', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true })
  const broadcast = found.docs[0]
  if (!broadcast) notFound()
  if (broadcast.status !== 'draft') redirect(`/manage/broadcasts/${id}`)
  const recipientIds = (broadcast.recipients ?? []).map(relationId)
  const [audience, users] = await Promise.all([
    resolveBroadcastAudience(payload, { audience: 'all', recipients: [] }),
    recipientIds.length
      ? payload.find({ collection: 'users', where: { id: { in: recipientIds } }, select: { firstName: true, lastName: true, email: true }, limit: recipientIds.length, depth: 0, overrideAccess: true })
      : Promise.resolve({ docs: [] }),
  ])
  const titles = new Map(users.docs.map((user) => [user.id, `${user.firstName} ${user.lastName} (${user.email})`]))
  return (
    <>
      <ManagementHeading title="Редактирование рассылки" breadcrumbs={[{ href: '/manage/broadcasts', label: 'Email-рассылки' }, { href: `/manage/broadcasts/${id}`, label: broadcast.subject }]} />
      <BroadcastForm
        allStudents={{ recipients: audience.userIds.length, excluded: audience.excluded }}
        initial={{
          id,
          subject: broadcast.subject,
          body: broadcast.body,
          ctaLabel: broadcast.ctaLabel ?? '',
          ctaUrl: broadcast.ctaUrl ?? '',
          audience: broadcast.audience,
          recipients: recipientIds.map((recipient) => ({ id: recipient, title: titles.get(recipient) ?? `Удалённый аккаунт #${recipient}` })),
        }}
      />
    </>
  )
}

import { requireContentAdmin } from '@/lib/content-management/pages'
import { ManagementHeading } from '@/components/content-management/ManagementHeading'
import { BroadcastForm } from '@/components/broadcasts/BroadcastForm'
import { resolveBroadcastAudience } from '@/server/broadcasts/service'

export const metadata = { title: 'Новая рассылка' }

export default async function NewBroadcastPage() {
  const { payload } = await requireContentAdmin()
  const audience = await resolveBroadcastAudience(payload, { audience: 'all', recipients: [] })
  return (
    <>
      <ManagementHeading title="Новая рассылка" description="Сначала сохраните черновик — письмо можно будет посмотреть и проверить тестовой отправкой." breadcrumbs={[{ href: '/manage/broadcasts', label: 'Email-рассылки' }, { href: '/manage/broadcasts/new', label: 'Новая' }]} />
      <BroadcastForm allStudents={{ recipients: audience.userIds.length, excluded: audience.excluded }} />
    </>
  )
}

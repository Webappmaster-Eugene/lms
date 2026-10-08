import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from '@/lib/payload'
import { NotificationInbox } from '@/components/notifications/NotificationInbox'

export const metadata: Metadata = { title: 'Уведомления' }

export default async function NotificationsPage() {
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect('/login?redirect=%2Fnotifications')
  return <div className="mx-auto max-w-3xl space-y-6"><div className="space-y-2"><h1 className="text-xl font-bold sm:text-2xl">Уведомления</h1><p className="text-sm text-muted-foreground">Ответы ментора, достижения и напоминания — в одном месте.</p></div><NotificationInbox userId={user.id} /></div>
}

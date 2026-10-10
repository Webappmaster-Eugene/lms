import type { Metadata } from 'next'
import { NotificationSettings } from '@/components/pwa/NotificationSettings'

export const metadata: Metadata = { title: 'Уведомления' }

export default function NotificationsSettingsPage() {
  return <NotificationSettings />
}

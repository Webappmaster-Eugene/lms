import type { Metadata } from 'next'
import { NotificationSettings } from '@/components/pwa/NotificationSettings'

export const metadata: Metadata = { title: 'Приложение и уведомления' }

export default function NotificationsSettingsPage() {
  return <NotificationSettings />
}

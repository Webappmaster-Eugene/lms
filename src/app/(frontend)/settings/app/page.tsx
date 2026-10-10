import type { Metadata } from 'next'
import { AppSettings } from '@/components/pwa/AppSettings'

export const metadata: Metadata = { title: 'Приложение' }

export default function AppSettingsPage() {
  return <AppSettings />
}

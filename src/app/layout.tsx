import type { Metadata, Viewport } from 'next'
import { ROOT_METADATA } from '@/lib/site-metadata'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = ROOT_METADATA

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}

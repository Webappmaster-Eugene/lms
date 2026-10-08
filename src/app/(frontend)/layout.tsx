import '@/app/globals.css'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { SidebarProvider } from '@/components/layout/SidebarContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { BottomNav } from '@/components/layout/BottomNav'
import { Footer } from '@/components/layout/Footer'
import { ToastProvider } from '@/components/ui/Toast'
import { NavigationProgress } from '@/components/layout/NavigationProgress'
import { KeyboardShortcuts } from '@/components/layout/KeyboardShortcuts'
import { Suspense } from 'react'
import { headers } from 'next/headers'
import { getPayload } from '@/lib/payload'
import { redirect } from 'next/navigation'
import { PwaProvider } from '@/components/pwa/PwaProvider'

const inter = Inter({
  subsets: ['cyrillic', 'latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'MentorCareer', statusBarStyle: 'default' },
  icons: { apple: '/images/pwa/icon-192.png' },
  title: {
    template: '%s — MentorCareer LMS',
    default: 'MentorCareer LMS',
  },
  description: 'Платформа обучения MentorCareer — курсы Frontend и Backend с тренажёром кода, геймификацией и сертификатами',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
}

export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect('/login')
  const isAdmin = user.role === 'admin'

  return (
    <html lang="ru" className={inter.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <ToastProvider>
            <PwaProvider />
            <Suspense fallback={null}>
              <NavigationProgress />
              <KeyboardShortcuts />
            </Suspense>
            <SidebarProvider>
              <div className="flex min-h-dvh overflow-x-hidden">
                <div className="contents print:hidden">
                  <Sidebar isAdmin={isAdmin} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col lg:ml-64 print:ml-0">
                  <div className="contents print:hidden">
                    <Header />
                  </div>
                  <main className="flex-1 overflow-x-hidden px-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))] py-6 lg:px-8">{children}</main>
                  <div className="contents print:hidden">
                    <Footer />
                  </div>
                </div>
                <div className="contents print:hidden">
                  <BottomNav />
                </div>
              </div>
            </SidebarProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

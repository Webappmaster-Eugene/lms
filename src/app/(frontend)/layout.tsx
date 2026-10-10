import '@/app/globals.css'
import '@/app/fonts.css'
import { FontPreloads } from '@/components/layout/FontPreloads'
import type { Metadata, Viewport } from 'next'
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
import { getLearningRequest } from '@/server/learning-request'
import { redirect } from 'next/navigation'
import { PwaProvider } from '@/components/pwa/PwaProvider'
import { StudentActivityBridge } from '@/components/analytics/StudentActivityBridge'
import { getTrainerAccess } from '@/server/trainer-access'

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
  const { payload, user, req } = await getLearningRequest()
  if (!user) redirect('/login')
  const isAdmin = user.role === 'admin'
  const trainerEnabled = (await getTrainerAccess(payload, user, req)).hasAccess

  return (
    <html lang="ru" suppressHydrationWarning>
      <head><FontPreloads /></head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <ToastProvider>
            <PwaProvider />
            <Suspense fallback={null}><StudentActivityBridge userId={user.id} /></Suspense>
            <Suspense fallback={null}>
              <NavigationProgress />
              <KeyboardShortcuts trainerEnabled={trainerEnabled} />
            </Suspense>
            <SidebarProvider>
              <div className="flex min-h-dvh overflow-x-hidden">
                <div className="contents print:hidden">
                  <Sidebar isAdmin={isAdmin} trainerEnabled={trainerEnabled} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col lg:ml-64 print:ml-0">
                  <div className="contents print:hidden">
                    <Header trainerEnabled={trainerEnabled} />
                  </div>
                  <main className="flex-1 overflow-x-hidden px-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))] py-6 lg:px-8">{children}</main>
                  <div className="contents print:hidden">
                    <Footer trainerEnabled={trainerEnabled} />
                  </div>
                </div>
                <div className="contents print:hidden">
                  <BottomNav trainerEnabled={trainerEnabled} />
                </div>
              </div>
            </SidebarProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

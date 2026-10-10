import '@/app/globals.css'
import '@/app/fonts.css'
import { FontPreloads } from '@/components/layout/FontPreloads'
import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/layout/ThemeProvider'

export const metadata: Metadata = {
  title: {
    template: '%s — MentorCareer LMS',
    default: 'MentorCareer LMS',
  },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head><FontPreloads /></head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {/* main — единственный ориентир страницы входа: экранные дикторы переходят к форме сразу. */}
          <main className="flex min-h-dvh items-center justify-center bg-background px-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))] py-[max(1.5rem,env(safe-area-inset-top),env(safe-area-inset-bottom))]">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  )
}

import '@/app/globals.css'
import '@/app/fonts.css'
import Link from 'next/link'
import FrontendLayout from '@/app/(frontend)/layout'
import { FontPreloads } from '@/components/layout/FontPreloads'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { getLearningRequest } from '@/server/learning-request'

export { viewport } from '@/app/(frontend)/layout'

export default async function GuidesLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getLearningRequest()
  if (user) return <FrontendLayout>{children}</FrontendLayout>

  return (
    <html lang="ru" suppressHydrationWarning>
      <head><FontPreloads /></head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <div className="flex min-h-dvh flex-col bg-background text-foreground">
            <header className="border-b border-border px-4 py-4 sm:px-8">
              <nav aria-label="Основная навигация" className="mx-auto flex max-w-5xl items-center justify-between gap-4">
                <Link href="/guides" className="text-lg font-semibold focus-visible:outline-2 focus-visible:outline-ring">MentorCareer</Link>
                <Link href="/login?redirect=%2Fguides" className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">Войти в LMS</Link>
              </nav>
            </header>
            <main className="flex-1 px-4 py-8 sm:px-8 sm:py-12">{children}</main>
            <footer className="border-t border-border px-4 py-6 text-center text-sm text-muted-foreground">
              <a href="https://info.mentorcareer.ru" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Обучение и менторство MentorCareer</a>
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}

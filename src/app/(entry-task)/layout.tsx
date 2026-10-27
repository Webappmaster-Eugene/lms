import '@/app/globals.css'
import '@/app/fonts.css'
import { FontPreloads } from '@/components/layout/FontPreloads'
import { ThemeProvider } from '@/components/layout/ThemeProvider'

export { viewport } from '@/app/(frontend)/layout'

const BOOTCAMP_URL = 'https://info.mentorcareer.ru/bootcamp/nodejs/'

/** Кандидат ещё не ученик: страница задания открывается без входа и без меню платформы. */
export default function EntryTaskLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head><FontPreloads /></head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <div className="flex min-h-dvh flex-col bg-background text-foreground">
            <header className="border-b border-border px-4 py-4 sm:px-8">
              <nav aria-label="Основная навигация" className="mx-auto flex max-w-3xl items-center justify-between gap-4">
                <span className="text-lg font-semibold">MentorCareer</span>
                <a href={BOOTCAMP_URL} className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">О буткемпе</a>
              </nav>
            </header>
            <main id="main" className="flex-1 px-4 py-8 sm:px-8 sm:py-12">{children}</main>
            <footer className="border-t border-border px-4 py-6 text-center text-sm text-muted-foreground">
              <a href={BOOTCAMP_URL} className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Буткемп Node.js от MentorCareer</a>
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}

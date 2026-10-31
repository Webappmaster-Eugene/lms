import '@/app/globals.css'
import '@/app/fonts.css'
import { FontPreloads } from '@/components/layout/FontPreloads'
import { ThemeProvider } from '@/components/layout/ThemeProvider'

export { viewport } from '@/app/(frontend)/layout'

/**
 * Кандидат ещё не ученик: страница задания открывается без входа и без меню платформы.
 * Шапку и подвал со ссылкой на программу рисует страница (CandidateFrame).
 */
export default function EntryTaskLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head><FontPreloads /></head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <div className="flex min-h-dvh flex-col bg-background text-foreground">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  )
}

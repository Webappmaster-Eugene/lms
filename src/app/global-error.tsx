'use client'

import '@/app/globals.css'
import '@/app/fonts.css'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { ErrorScreen, errorPrimaryAction, errorSecondaryAction } from '@/components/errors/ErrorScreen'
import { useErrorReport } from '@/components/errors/use-error-report'
import { GUIDE_URL } from '@/lib/site-links'
import { RefreshCw } from 'lucide-react'

/**
 * Последний рубеж: упал сам layout платформы — чаще всего это недоступная база
 * или Payload. Меню и данных пользователя здесь нет, поэтому только перезагрузка
 * всей страницы и ссылка на инструкцию, которая живёт на отдельном сервере.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const reference = useErrorReport(error)

  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <title>Платформа временно недоступна — MentorCareer LMS</title>
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <main className="flex min-h-dvh items-center justify-center bg-background px-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))]">
            <ErrorScreen
              status="503"
              tone="danger"
              eyebrow="MentorCareer LMS"
              title="Платформа временно недоступна"
              description="Сервер ответил не так, как обычно. Мы уже получили отчёт и разбираемся. Обычно это проходит за пару минут — ваш прогресс и решения сохранены."
              terminal={[
                { kind: 'command', text: 'curl -I https://learn.mentorcareer.ru' },
                { kind: 'error', text: 'HTTP/2 503 — сервис недоступен' },
                { kind: 'comment', text: 'отчёт уже у разработчиков' },
                { kind: 'hint', text: 'sleep 60 && reload' },
              ]}
              reference={reference}
              actions={
                <>
                  {/* Полная перезагрузка: router.refresh здесь некуда возвращаться, layout разрушен. */}
                  <button type="button" onClick={() => window.location.reload()} className={errorPrimaryAction}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Обновить страницу
                  </button>
                  <a href={GUIDE_URL} className={errorSecondaryAction}>Инструкция по платформе</a>
                </>
              }
            />
          </main>
        </ThemeProvider>
      </body>
    </html>
  )
}

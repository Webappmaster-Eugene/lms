import type { Metadata } from 'next'
import Link from 'next/link'
import { Compass } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Страница не найдена',
}

/** Своя 404 внутри платформы: заглушка Next — белая, английская и без меню. */
export default function FrontendNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Compass className="h-8 w-8 text-primary" aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-foreground">Такой страницы нет</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Возможно, курс или урок сняли с публикации или ссылка устарела.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          На дашборд
        </Link>
        <Link
          href="/roadmaps"
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-accent"
        >
          К роадмапам
        </Link>
      </div>
    </div>
  )
}

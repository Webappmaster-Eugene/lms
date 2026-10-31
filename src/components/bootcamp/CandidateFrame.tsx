import { GUIDE_URL } from '@/lib/site-links'

type Props = {
  /** Страница программы на лендинге; без программы - сайт MentorCareer. */
  landingUrl: string | null
  /** Короткое название программы: «Node.js». */
  program: string | null
  children: React.ReactNode
}

const button = 'inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'
const link = 'underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring'

/**
 * Шапка и подвал страниц кандидата. Лежат в странице, а не в layout: адрес лендинга
 * зависит от программы заявки, а layout группы о заявке ничего не знает.
 */
export function CandidateFrame({ landingUrl, program, children }: Props) {
  const href = landingUrl ?? `${GUIDE_URL}/`
  return (
    <>
      <header className="border-b border-border px-4 py-4 sm:px-8">
        <nav aria-label="Основная навигация" className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <span className="text-lg font-semibold">MentorCareer</span>
          <a href={href} className={button}>{landingUrl ? 'О буткемпе' : 'На сайт'}</a>
        </nav>
      </header>
      <main id="main" className="flex-1 px-4 py-8 sm:px-8 sm:py-12">{children}</main>
      <footer className="border-t border-border px-4 py-6 text-center text-sm text-muted-foreground">
        <a href={href} className={link}>{landingUrl && program ? `Буткемп ${program} от MentorCareer` : 'MentorCareer'}</a>
      </footer>
    </>
  )
}

import Link from 'next/link'
import { readSiteContacts } from '@/lib/site-settings'
import { AUTHOR_NAME, AUTHOR_URL, PROMO_URL } from '@/lib/site-links'

const SECTIONS = [
  { href: '/courses', label: 'Курсы' },
  { href: '/roadmaps', label: 'Роадмапы' },
  { href: '/trainer', label: 'Тренажёр' },
  { href: '/leaderboard', label: 'Лидерборд' },
  { href: '/certificates', label: 'Сертификаты' },
  { href: '/help', label: 'Помощь' },
] as const

const linkClass = 'text-muted-foreground transition-colors hover:text-primary'

export async function Footer({ trainerEnabled = true }: { trainerEnabled?: boolean } = {}) {
  const contacts = await readSiteContacts()
  const year = new Date().getFullYear()

  const external = [
    { href: contacts.telegramChannel, label: 'Telegram-канал', blank: true },
    { href: contacts.telegramGroup, label: 'Чат учеников', blank: true },
    { href: PROMO_URL, label: 'Инструкция по платформе', blank: true },
    { href: contacts.website || AUTHOR_URL, label: 'Сайт автора', blank: true },
    ...(contacts.links ?? []).map((contact) => ({ href: contact.url, label: contact.title, blank: true })),
    // Почтовый клиент открывается на месте, новая вкладка останется пустой.
    { href: contacts.email ? `mailto:${contacts.email}` : undefined, label: contacts.email, blank: false },
  ].filter((item): item is { href: string; label: string; blank: boolean } =>
    Boolean(item.href && item.label),
  ).filter((item, index, links) => links.findIndex((link) => link.href === item.href) === index)

  return (
    <footer className="border-t border-border bg-card/40 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[calc(5rem+env(safe-area-inset-bottom,0px))] pt-5 text-sm lg:px-8 lg:pb-8 lg:pt-8">
      <div className="mx-auto hidden w-full max-w-5xl gap-8 lg:grid lg:grid-cols-3">
        <div className="space-y-2">
          <p className="font-semibold text-foreground">MentorCareer</p>
          <p className="max-w-xs text-muted-foreground">
            {trainerEnabled ? 'Платформа обучения разработке: курсы Frontend и Backend, роадмапы, тренажёр кода с проверкой решений и сертификаты.' : 'Платформа обучения разработке: персональные курсы, роадмапы и сертификаты.'}
          </p>
        </div>

        <nav aria-label="Разделы платформы" className="space-y-2">
          <p className="font-semibold text-foreground">Разделы</p>
          <ul className="space-y-1.5">
            {SECTIONS.filter((item) => trainerEnabled || item.href !== '/trainer').map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className={linkClass}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Контакты и внешние ссылки" className="space-y-2">
          <p className="font-semibold text-foreground">Связь</p>
          <ul className="space-y-1.5">
            <li>
              <Link href="/contacts" className={linkClass}>
                Все контакты
              </Link>
            </li>
            {external.map(({ href, label, blank }) => (
              <li key={href}>
                <a
                  href={href}
                  target={blank ? '_blank' : undefined}
                  rel={blank ? 'noopener noreferrer' : undefined}
                  className={linkClass}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="flex items-center justify-between gap-3 lg:hidden">
        <Link href="/help" className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground">Нужна помощь?</Link>
        <a href={PROMO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground">Как пользоваться</a>
      </div>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:mt-8 lg:border-t lg:border-border lg:pt-5 lg:text-sm">
        <p>MentorCareer © {year}</p>
        <p>
          Автор и ментор —{' '}
          <a
            href={AUTHOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground transition-colors hover:text-primary"
          >
            {AUTHOR_NAME}
          </a>
        </p>
      </div>
    </footer>
  )
}

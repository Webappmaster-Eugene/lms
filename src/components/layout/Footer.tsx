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

export async function Footer() {
  const contacts = await readSiteContacts()
  const year = new Date().getFullYear()

  const external = [
    { href: contacts.telegramChannel, label: 'Telegram-канал', blank: true },
    { href: contacts.telegramGroup, label: 'Чат учеников', blank: true },
    { href: contacts.website || PROMO_URL, label: 'О платформе', blank: true },
    { href: AUTHOR_URL, label: 'Сайт автора', blank: true },
    // Почтовый клиент открывается на месте, новая вкладка останется пустой.
    { href: contacts.email ? `mailto:${contacts.email}` : undefined, label: contacts.email, blank: false },
  ].filter((item): item is { href: string; label: string; blank: boolean } =>
    Boolean(item.href && item.label),
  )

  return (
    <footer className="border-t border-border bg-card/40 px-4 pb-24 pt-8 text-sm lg:px-8 lg:pb-8">
      <div className="mx-auto grid w-full max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <p className="font-semibold text-foreground">MentorCareer</p>
          <p className="max-w-xs text-muted-foreground">
            Платформа обучения разработке: курсы Frontend и Backend, роадмапы, тренажёр кода
            с проверкой решений и сертификаты.
          </p>
        </div>

        <nav aria-label="Разделы платформы" className="space-y-2">
          <p className="font-semibold text-foreground">Разделы</p>
          <ul className="space-y-1.5">
            {SECTIONS.map(({ href, label }) => (
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

      <div className="mx-auto mt-8 flex w-full max-w-5xl flex-col gap-2 border-t border-border pt-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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

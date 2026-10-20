import type { Metadata } from 'next'
import { readSiteContacts } from '@/lib/site-settings'
import { MessageCircle, Globe, Mail, Users, ExternalLink } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Контакты',
}

export default async function ContactsPage() {
  const contacts = await readSiteContacts()

  const cards = [
    {
      icon: Users,
      title: 'Чат учеников в Telegram',
      description: 'Вопросы по задачам, разборы и общение с другими учениками и ментором',
      link: contacts.telegramGroup,
      linkText: 'Вступить в группу',
    },
    {
      icon: MessageCircle,
      title: 'Telegram-канал',
      description: 'Новости, обновления и полезные материалы',
      link: contacts.telegramChannel,
      linkText: 'Подписаться',
    },
    {
      icon: Globe,
      title: 'Веб-сайт',
      description: 'Сайт Евгения Надточеева: проекты, публикации и менторство',
      link: contacts.website,
      linkText: 'Перейти',
    },
    {
      icon: Mail,
      title: 'Почта поддержки',
      description: 'Для официальных обращений и вопросов, на которые нужен письменный ответ',
      link: contacts.email ? `mailto:${contacts.email}` : undefined,
      linkText: contacts.email ?? 'Не указан',
    },
    ...(contacts.links ?? []).map((contact) => ({
      icon: contact.url.startsWith('https://t.me/') ? MessageCircle : Globe,
      title: contact.title,
      description: contact.description ?? '',
      link: contact.url,
      linkText: contact.url.startsWith('https://t.me/') ? 'Открыть в Telegram' : 'Перейти',
    })),
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">Контакты</h1>
      <p className="text-muted-foreground">
        Свяжитесь с нами удобным способом или присоединяйтесь к нашему сообществу.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ icon: Icon, title, description, link, linkText }) => (
          <div
            key={title}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
            {link ? (
              // Почтовый клиент открывается на месте: новая вкладка осталась бы пустой.
              <a
                href={link}
                aria-label={`${linkText}: ${title}`}
                target={link.startsWith('mailto:') ? undefined : '_blank'}
                rel={link.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
                className="mt-auto inline-flex min-h-11 items-center gap-1.5 break-all text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {linkText}
                {link.startsWith('mailto:') ? null : <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              </a>
            ) : (
              <span className="mt-auto text-sm text-muted-foreground">Не настроено</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

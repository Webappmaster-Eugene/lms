import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { MessageCircle, Globe, Mail, Users, ExternalLink } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Контакты',
}

export default async function ContactsPage() {
  const payload = await getPayload()

  let contacts: { telegramChannel?: string; telegramGroup?: string; website?: string; email?: string } = {}
  try {
    const settings = await payload.findGlobal({ slug: 'site-settings' })
    contacts = (settings.contacts as typeof contacts) ?? {}
  } catch {
    // fallback
  }

  const cards = [
    {
      icon: MessageCircle,
      title: 'Telegram-канал',
      description: 'Новости, обновления и полезные материалы',
      link: contacts.telegramChannel,
      linkText: 'Подписаться',
    },
    {
      icon: Users,
      title: 'Telegram-группа',
      description: 'Общение с другими учениками и наставниками',
      link: contacts.telegramGroup,
      linkText: 'Присоединиться',
    },
    {
      icon: Globe,
      title: 'Веб-сайт',
      description: 'Основной сайт с информацией о курсах',
      link: contacts.website,
      linkText: 'Перейти',
    },
    {
      icon: Mail,
      title: 'Email',
      description: 'Для официальных обращений и предложений',
      link: contacts.email ? `mailto:${contacts.email}` : undefined,
      linkText: contacts.email ?? 'Не указан',
    },
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
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {linkText}
                <ExternalLink className="h-3.5 w-3.5" />
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

import type { Metadata } from 'next'
import Link from 'next/link'
import { HelpCircle, Mail, MessageSquare, Users } from 'lucide-react'
import { FaqAccordion } from '@/components/help/FaqAccordion'
import { SupportForm } from './SupportForm'
import { collectAllPages } from '@/lib/paginate'
import { PLATFORM_SECTIONS, visibleSections } from '@/lib/platform-sections'
import { getLearningRequest } from '@/server/learning-request'
import { getTrainerAccess } from '@/server/trainer-access'
import { getGuideAccess } from '@/server/guide-access'
import { getBootcamps } from '@/server/bootcamps'
import { readSiteContacts } from '@/lib/site-settings'

export const metadata: Metadata = {
  title: 'Помощь',
}


type HelpSearchParams = Promise<{ topic?: string | string[]; ref?: string | string[]; from?: string | string[] }>

function single(value: string | string[] | undefined, maxLength: number): string | undefined {
  const text = Array.isArray(value) ? value[0] : value
  return text?.trim().slice(0, maxLength) || undefined
}

/** Со страницы ошибки ученик приходит с кодом и адресом — форма заполняется сама. */
function errorReportDraft(params: Awaited<HelpSearchParams>): { subject: string; message: string } | undefined {
  if (single(params.topic, 20) !== 'error') return undefined
  const reference = single(params.ref, 64)?.replace(/[^\w-]/g, '')
  const from = single(params.from, 300)
  // Только путь, без переводов строк: иначе ссылкой можно было бы вписать ученику чужой текст обращения.
  const page = from && /^\/[^\s<>"'`]{0,200}$/u.test(from) ? from : undefined
  const details = [reference && `Код ошибки: ${reference}`, page && `Страница: ${page}`].filter(Boolean).join('\n')
  return {
    subject: 'Ошибка на платформе',
    message: `${details}${details ? '\n\n' : ''}Что я делал(а), когда появилась ошибка:\n`,
  }
}

export default async function HelpPage({ searchParams }: { searchParams: HelpSearchParams }) {
  const draft = errorReportDraft(await searchParams)
  const contacts = await readSiteContacts()
  const { payload, user, req } = await getLearningRequest()
  // Справка перечисляет те же разделы, что и меню: тренажёр и гайды скрыты у тех, кому они не назначены.
  const trainerEnabled = user ? (await getTrainerAccess(payload, user, req)).hasAccess : false
  const guidesEnabled = user ? (await getGuideAccess(payload, user, req)).hasAccess : false
  const bootcampEnabled = user ? (await getBootcamps(payload, user, req)).length > 0 : false
  const sections = visibleSections(PLATFORM_SECTIONS, { trainerEnabled, guidesEnabled, bootcampEnabled })

  // Почта открывается на месте: в новой вкладке почтовый клиент оставил бы пустую страницу.
  const channels = [
    { href: '#support', external: false, icon: MessageSquare, title: 'Написать администратору', text: 'Задайте вопрос или сообщите о проблеме — мы ответим как можно скорее.', action: undefined },
    contacts.telegramGroup
      ? { href: contacts.telegramGroup, external: true, icon: Users, title: 'Чат учеников в Telegram', text: 'Вопросы по задачам, разборы и общение с другими учениками и ментором.', action: 'Вступить в группу →' }
      : null,
    contacts.email
      ? { href: `mailto:${contacts.email}`, external: false, icon: Mail, title: 'Почта поддержки', text: 'Для официальных обращений и вопросов, на которые нужен письменный ответ.', action: contacts.email }
      : null,
  ].filter((channel) => channel !== null)
  if (channels.length < 3) {
    channels.push({ href: '#faq', external: false, icon: HelpCircle, title: 'Частые вопросы', text: 'Ответы на самые распространённые вопросы учеников — ниже на странице.', action: undefined })
  }

  const faqDocs = await collectAllPages(
    ({ page, limit }) =>
      payload.find({
        collection: 'faq-items',
        where: { isPublished: { equals: true } },
        sort: ['order', 'id'],
        page,
        limit,
      }),
    { label: 'вопросы FAQ' },
  )

  // Сериализация richText → plain text
  const serializedFaq = faqDocs.map((item) => {
    let answerText = ''
    if (item.answer && typeof item.answer === 'object' && 'root' in item.answer) {
      const root = item.answer.root as { children?: Array<{ children?: Array<{ text?: string }> }> }
      answerText = (root.children ?? [])
        .map((node) => (node.children ?? []).map((c) => c.text ?? '').join(''))
        .filter(Boolean)
        .join('\n\n')
    } else if (typeof item.answer === 'string') {
      answerText = item.answer
    }

    return {
      id: item.id,
      question: item.question,
      answerText,
    }
  })

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex items-center gap-3">
        <HelpCircle className="h-7 w-7 text-primary" />
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Помощь</h1>
      </div>
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Здесь — ответы на частые вопросы, краткое описание каждого раздела платформы и форма, через которую можно написать администратору, если что-то не работает или непонятно.
      </p>

      {/* Support channels */}
      <h2 className="sr-only">Как связаться с нами</h2>
      <div className={`grid gap-4 ${channels.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {channels.map(({ href, external, icon: Icon, title, text, action }) => (
          <a
            key={title}
            href={href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-5 text-center transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">{text}</p>
            {action && <span className="mt-auto break-all text-sm font-semibold text-primary">{action}</span>}
          </a>
        ))}
      </div>

      {/* Support form */}
      <section id="support" className="scroll-mt-20">
        <h2 className="text-lg font-semibold text-foreground mb-4">Обратная связь</h2>
        <SupportForm initialSubject={draft?.subject} initialMessage={draft?.message} />
      </section>

      <section aria-labelledby="platform-sections-title">
        <h2 id="platform-sections-title" className="mb-4 text-lg font-semibold text-foreground">Разделы платформы</h2>
        <dl className="divide-y divide-border rounded-xl border border-border bg-card">
          {sections.map((section) => (
            <div key={section.href} className="grid gap-1 px-5 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt>
                <Link href={section.href} className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                  {section.label}
                </Link>
              </dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">{section.hint}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20">
        <h2 className="text-lg font-semibold text-foreground mb-4">Частые вопросы</h2>
        <FaqAccordion items={serializedFaq} />
      </section>
    </div>
  )
}

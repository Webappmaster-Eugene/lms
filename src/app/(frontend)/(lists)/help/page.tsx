import type { Metadata } from 'next'
import Link from 'next/link'
import { HelpCircle, MessageSquare } from 'lucide-react'
import { FaqAccordion } from '@/components/help/FaqAccordion'
import { SupportForm } from './SupportForm'
import { collectAllPages } from '@/lib/paginate'
import { PLATFORM_SECTIONS } from '@/lib/platform-sections'
import { getLearningRequest } from '@/server/learning-request'
import { getTrainerAccess } from '@/server/trainer-access'

export const metadata: Metadata = {
  title: 'Помощь',
}

export default async function HelpPage() {
  const { payload, user, req } = await getLearningRequest()
  // Справка перечисляет те же разделы, что и меню: тренажёр скрыт у тех, кому он не назначен.
  const trainerEnabled = user ? (await getTrainerAccess(payload, user, req)).hasAccess : false
  const sections = PLATFORM_SECTIONS.filter((section) => trainerEnabled || section.href !== '/trainer')

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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center text-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <MessageSquare className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">Написать администратору</h3>
          <p className="text-sm text-muted-foreground">
            Задайте вопрос или сообщите о проблеме — мы ответим как можно скорее.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center text-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <HelpCircle className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">Частые вопросы</h3>
          <p className="text-sm text-muted-foreground">
            Ниже вы найдёте ответы на самые распространённые вопросы учеников.
          </p>
        </div>
      </div>

      {/* Support form */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Обратная связь</h2>
        <SupportForm />
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
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Частые вопросы</h2>
        <FaqAccordion items={serializedFaq} />
      </section>
    </div>
  )
}

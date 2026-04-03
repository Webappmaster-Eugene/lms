import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { HelpCircle, MessageSquare } from 'lucide-react'
import { FaqAccordion } from '@/components/help/FaqAccordion'
import { SupportForm } from './SupportForm'

export const metadata: Metadata = {
  title: 'Помощь',
}

export default async function HelpPage() {
  const payload = await getPayload()

  const faqItems = await payload.find({
    collection: 'faq-items',
    where: { isPublished: { equals: true } },
    sort: 'order',
    limit: 50,
  })

  // Сериализация richText → plain text
  const serializedFaq = faqItems.docs.map((item) => {
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

      {/* FAQ */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Частые вопросы</h2>
        <FaqAccordion items={serializedFaq} />
      </section>
    </div>
  )
}

import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { MentorQuestions } from '@/components/questions/MentorQuestions'
import { collectAllPages } from '@/lib/paginate'
import { getPayload } from '@/lib/payload'
import { loadQuestionThreads } from '@/lib/questions'

export const metadata: Metadata = {
  title: 'Вопросы учеников',
}

export default async function MentorQuestionsPage() {
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: await headers() })

  // Префикс /admin middleware пропускает без проверки — роль проверяется здесь.
  if (!user || user.role !== 'admin') {
    redirect('/')
  }

  const [threads, templates] = await Promise.all([
    loadQuestionThreads(payload, user),
    collectAllPages(
      ({ page, limit }) =>
        payload.find({
          collection: 'reply-templates',
          user,
          overrideAccess: false,
          select: { title: true, content: true, usageCount: true },
          depth: 0,
          sort: 'id',
          page,
          limit,
        }),
      { label: 'заготовки ответов' },
    ),
  ])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Вопросы учеников</h1>
        <p className="text-sm text-muted-foreground">Ответ уходит ученику уведомлением и появляется под уроком</p>
      </div>
      <MentorQuestions threads={threads} templates={templates} />
    </div>
  )
}

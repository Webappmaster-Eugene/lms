import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { MentorQuestions } from '@/components/questions/MentorQuestions'
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

  const threads = await loadQuestionThreads(payload, user)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Вопросы учеников</h1>
        <p className="text-sm text-muted-foreground">Ответ уходит ученику уведомлением и появляется под уроком</p>
      </div>
      <MentorQuestions threads={threads} />
    </div>
  )
}

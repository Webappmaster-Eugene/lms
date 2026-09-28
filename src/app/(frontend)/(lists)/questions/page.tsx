import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { MyQuestions } from '@/components/questions/MyQuestions'
import { getPayload } from '@/lib/payload'
import { authorId } from '@/lib/comment-threads'
import { loadQuestionThreads } from '@/lib/questions'

export const metadata: Metadata = {
  title: 'Мои вопросы',
}

export default async function QuestionsPage() {
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect('/login')

  const threads = await loadQuestionThreads(payload, user)
  // Ментор видит здесь все ветки — ему нужна своя страница ответов.
  const own = user.role === 'admin' ? threads.filter((t) => authorId(t.question.user) === String(user.id)) : threads

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Мои вопросы</h1>
        <p className="text-sm text-muted-foreground">Вопросы ментору по всем урокам и ответы на них</p>
      </div>
      <MyQuestions threads={own} />
    </div>
  )
}

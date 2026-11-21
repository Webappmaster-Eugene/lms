import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { MentorQuestions } from '@/components/questions/MentorQuestions'
import { adminLoginHref } from '@/lib/admin-login-redirect'
import { collectAllPages } from '@/lib/paginate'
import { loadQuestionThreads } from '@/lib/questions'
import { getLearningRequest } from '@/server/learning-request'

export const metadata: Metadata = {
  title: 'Вопросы учеников',
}

export default async function MentorQuestionsPage() {
  const { payload, user } = await getLearningRequest()

  if (!user) redirect(adminLoginHref(await headers(), '/login'))
  if (user.role !== 'admin') redirect('/')

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

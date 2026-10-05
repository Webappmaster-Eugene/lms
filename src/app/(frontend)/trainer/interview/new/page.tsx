import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from '@/lib/payload'
import { InterviewStart } from '@/components/trainer/interview/InterviewStart'

export const metadata: Metadata = { title: 'Собеседование' }
export default async function InterviewNewPage({ searchParams }: { searchParams: Promise<{ taskId?: string }> }) {
  const { taskId } = await searchParams
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/trainer/interview/new${taskId ? `?taskId=${taskId}` : ''}`)}`)
  if (!user.isActive) return <p>Аккаунт неактивен. Обратитесь к наставнику.</p>
  return <div className="mx-auto max-w-6xl p-4 md:p-8"><InterviewStart taskId={taskId} /></div>
}

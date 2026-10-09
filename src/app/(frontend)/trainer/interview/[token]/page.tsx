import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getTrainerAccess } from '@/server/trainer-access'
import { getPayload } from '@/lib/payload'
import { validRoomToken } from '@/lib/trainer/interview'
import { InterviewWorkspace } from '@/components/trainer/interview/InterviewWorkspace'

export const metadata: Metadata = { title: 'Комната собеседования', robots: { index: false, follow: false } }
export default async function InterviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!validRoomToken(token)) notFound()
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/trainer/interview/${token}`)}`)
  if (!user.isActive) return <p>Аккаунт неактивен. Обратитесь к наставнику.</p>
  if (!(await getTrainerAccess(payload, user)).hasAccess) return <p>Доступ к тренажёру не назначен. Обратитесь к наставнику.</p>
  return <div className="mx-auto max-w-[1600px] p-4 md:p-6"><InterviewWorkspace key={token} token={token} /></div>
}

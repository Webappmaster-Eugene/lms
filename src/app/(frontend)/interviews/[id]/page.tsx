import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getLearningRequest } from '@/server/learning-request'
import { getInterviewDetails, InterviewLibraryError } from '@/server/interviews/service'
import { InterviewDetail } from '@/components/interviews/InterviewDetail'

export const metadata: Metadata = { title: 'Запись собеседования' }

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { payload, user } = await getLearningRequest()
  if (!user) redirect('/login')
  const { id } = await params
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) notFound()
  const initial = await getInterviewDetails(payload, user, Number(id)).catch((error: unknown) => {
    if (error instanceof InterviewLibraryError && error.status === 404) notFound()
    throw error
  })
  if (!initial) notFound()
  return <InterviewDetail initial={initial} />
}

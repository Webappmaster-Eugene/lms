import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getLearningRequest } from '@/server/learning-request'
import { getInterviewLibrary } from '@/server/interviews/service'
import { InterviewLibrary } from '@/components/interviews/InterviewLibrary'
import type { RecordingCategory } from '@/lib/interviews/types'

export const metadata: Metadata = { title: 'Собеседования' }

export default async function InterviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { payload, user } = await getLearningRequest()
  if (!user) redirect('/login')
  const params = await searchParams
  const category: RecordingCategory = params.category === 'personal' || params.category === 'community' ? params.category : 'mentor'
  const filters = { direction: typeof params.direction === 'string' ? params.direction : 'react', category, search: typeof params.search === 'string' ? params.search.slice(0, 100) : '', page: Math.max(1, Number(params.page) || 1) }
  const initial = await getInterviewLibrary(payload, user, filters)
  const direction = initial.directions.find((item) => item.slug === filters.direction)?.slug ?? initial.directions[0]?.slug ?? ''
  return <InterviewLibrary initial={initial} initialFilters={{ ...filters, direction, page: initial.page }} />
}

import { MentorStream } from '@/components/tutoring/MentorStream'
import { StudentStream } from '@/components/tutoring/StudentStream'
import { requireTutoringBootcamp } from '@/server/tutoring-bootcamps'

export const metadata = { title: 'Поток репетиторства' }
type Query = { participant?: string; preview?: string; review?: string; meeting?: string; schedule?: string; saved?: string; error?: string }

export default async function StreamPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<Query> }) {
  const { slug, id } = await params
  const [context, query] = await Promise.all([requireTutoringBootcamp(slug), searchParams])
  return context.isAdmin ? <MentorStream context={context} id={id} query={query} /> : <StudentStream context={context} id={id} query={query} />
}

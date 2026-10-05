import Link from 'next/link'
import { contentId, managedDocument, managedList } from '@/lib/content-management/pages'
import { CourseCatalogue } from '@/components/content-management/CourseCatalogue'
import { ManagementHeading, managementLink, managementPrimary } from '@/components/content-management/ManagementHeading'

export const metadata = { title: 'Курсы роадмапа' }

export default async function RoadmapContentPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string; node?: string }>
}) {
  const { id } = await params
  const roadmap = await managedDocument('roadmaps', id)
  const [courses, nodes, query] = await Promise.all([
    managedList('courses', { roadmap: { equals: roadmap.id } }),
    managedList('roadmap-nodes', { roadmap: { equals: roadmap.id } }),
    searchParams,
  ])
  const nodeId = typeof query.node === 'string' && query.node ? contentId(query.node) : undefined
  return (
    <>
      <ManagementHeading title={roadmap.title} description="Все курсы этого роадмапа, включая черновики. Откройте программу курса, чтобы добавить разделы и уроки." actions={<>
        <Link href={`/manage/courses/new?roadmap=${roadmap.id}${nodeId ? `&node=${nodeId}` : ''}`} className={managementPrimary}>Добавить курс</Link>
        {roadmap.isPublished && <Link href={`/roadmaps/${roadmap.slug}`} className={managementLink}>Открыть роадмап</Link>}
      </>} />
      <CourseCatalogue courses={courses} roadmaps={[roadmap]} nodes={nodes} roadmapId={roadmap.id} nodeId={nodeId} query={typeof query.q === 'string' ? query.q : ''} />
    </>
  )
}

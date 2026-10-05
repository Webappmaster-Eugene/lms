import { contentId, managedList, relationId } from '@/lib/content-management/pages'
import { CourseForm } from '@/components/content-management/CourseForm'
import { ManagementHeading } from '@/components/content-management/ManagementHeading'
import { notFound } from 'next/navigation'

export const metadata = { title: 'Новый курс' }

export default async function NewCoursePage({ searchParams }: { searchParams: Promise<{ roadmap?: string; node?: string }> }) {
  const [roadmaps, nodes, courses, query] = await Promise.all([managedList('roadmaps'), managedList('roadmap-nodes'), managedList('courses'), searchParams])
  const roadmapId = typeof query.roadmap === 'string' && query.roadmap ? contentId(query.roadmap) : undefined
  const nodeId = typeof query.node === 'string' && query.node ? contentId(query.node) : undefined
  if (roadmapId && !roadmaps.some((roadmap) => roadmap.id === roadmapId)) notFound()
  if (nodeId && !nodes.some((node) => node.id === nodeId && (!roadmapId || relationId(node.roadmap) === roadmapId))) notFound()
  return (
    <>
      <ManagementHeading title="Новый курс" description="Начните с названия и описания. После сохранения можно добавить разделы и уроки." />
      <CourseForm roadmaps={roadmaps} nodes={nodes} courses={courses.map(({ id, title }) => ({ id, title }))} defaultRoadmap={roadmapId} defaultNode={nodeId} />
    </>
  )
}

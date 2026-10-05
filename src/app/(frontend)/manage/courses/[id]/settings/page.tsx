import { managedDocument, managedList, relationId } from '@/lib/content-management/pages'
import { CourseForm } from '@/components/content-management/CourseForm'
import { ManagementHeading } from '@/components/content-management/ManagementHeading'

export const metadata = { title: 'Настройки курса' }

export default async function CourseSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const course = await managedDocument('courses', (await params).id)
  const [roadmaps, nodes, courses] = await Promise.all([
    managedList('roadmaps'),
    managedList('roadmap-nodes', { roadmap: { equals: relationId(course.roadmap) } }),
    managedList('courses'),
  ])
  return (
    <>
      <ManagementHeading title="Настройки курса" breadcrumbs={[{ href: `/manage/courses/${course.id}`, label: course.title }]} />
      <CourseForm course={course} roadmaps={roadmaps} nodes={nodes} courses={courses.map(({ id, title }) => ({ id, title }))} />
    </>
  )
}

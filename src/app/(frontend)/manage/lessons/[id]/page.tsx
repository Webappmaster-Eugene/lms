import { notFound } from 'next/navigation'
import { managedDocument, managedList, relationId } from '@/lib/content-management/pages'
import { LessonForm } from '@/components/content-management/LessonForm'
import { ManagementHeading } from '@/components/content-management/ManagementHeading'

export const metadata = { title: 'Редактор урока' }

export default async function EditLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const lesson = await managedDocument('lessons', (await params).id)
  const courseId = relationId(lesson.course)
  if (!courseId) notFound()
  const [course, sections] = await Promise.all([managedDocument('courses', String(courseId)), managedList('sections', { course: { equals: courseId } })])
  return (
    <>
      <ManagementHeading title="Редактор урока" breadcrumbs={[{ href: `/manage/courses/${course.id}`, label: course.title }]} />
      <LessonForm lesson={lesson} course={course} sections={sections} />
    </>
  )
}

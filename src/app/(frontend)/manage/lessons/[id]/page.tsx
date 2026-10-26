import { notFound } from 'next/navigation'
import { managedDocument, managedList, relationId } from '@/lib/content-management/pages'
import { savedNoticeFromQuery } from '@/lib/content-management/saved-notice'
import { LessonForm } from '@/components/content-management/LessonForm'
import { ManagementHeading } from '@/components/content-management/ManagementHeading'

export const metadata = { title: 'Редактор урока' }

export default async function EditLessonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string | string[] }> }) {
  const lesson = await managedDocument('lessons', (await params).id)
  const courseId = relationId(lesson.course)
  if (!courseId) notFound()
  const [course, sections, query] = await Promise.all([managedDocument('courses', String(courseId)), managedList('sections', { course: { equals: courseId } }), searchParams])
  return (
    <>
      <ManagementHeading title="Редактор урока" breadcrumbs={[{ href: `/manage/courses/${course.id}`, label: course.title }]} />
      <LessonForm lesson={lesson} course={course} sections={sections} notice={savedNoticeFromQuery('lessons', query.saved)} />
    </>
  )
}

import { notFound } from 'next/navigation'
import { contentId, managedDocument, managedList } from '@/lib/content-management/pages'
import { LessonForm } from '@/components/content-management/LessonForm'
import { ManagementHeading } from '@/components/content-management/ManagementHeading'

export const metadata = { title: 'Новый урок' }

export default async function NewLessonPage({ searchParams }: { searchParams: Promise<{ course?: string; section?: string }> }) {
  const query = await searchParams
  if (typeof query.course !== 'string') notFound()
  const course = await managedDocument('courses', query.course)
  const sections = await managedList('sections', { course: { equals: course.id } })
  const sectionId = typeof query.section === 'string' && query.section ? contentId(query.section) : undefined
  if (sectionId && !sections.some((section) => section.id === sectionId)) notFound()
  return (
    <>
      <ManagementHeading title="Новый урок" breadcrumbs={[{ href: `/manage/courses/${course.id}`, label: course.title }]} description="Добавьте описание и материалы. Урок появится у учеников после публикации." />
      <LessonForm course={course} sections={sections} defaultSection={sectionId} />
    </>
  )
}

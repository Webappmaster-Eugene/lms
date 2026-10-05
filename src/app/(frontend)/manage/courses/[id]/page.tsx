import Link from 'next/link'
import { managedDocument, managedList, relationId, requireContentAdmin } from '@/lib/content-management/pages'
import { collectAllPages } from '@/lib/paginate'
import { ManagementHeading, managementLink, managementPrimary, PublicationStatus } from '@/components/content-management/ManagementHeading'
import { SectionForm } from '@/components/content-management/SectionForm'
import type { Lesson } from '@/payload-types'

export const metadata = { title: 'Программа курса' }

function LessonRows({ lessons }: { lessons: Pick<Lesson, 'id' | 'title' | 'description' | 'isPublished'>[] }) {
  return lessons.length ? (
    <ul className="divide-y divide-border">
      {lessons.map((lesson) => (
        <li key={lesson.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Link href={`/manage/lessons/${lesson.id}`} className="break-words font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring">{lesson.title}</Link>
            {lesson.description && <p className="max-w-2xl text-sm text-muted-foreground">{lesson.description}</p>}
            <PublicationStatus published={lesson.isPublished === true} />
          </div>
          <Link href={`/manage/lessons/${lesson.id}`} className={managementLink} aria-label={`Редактировать урок «${lesson.title}»`}>Редактировать урок</Link>
        </li>
      ))}
    </ul>
  ) : <p className="p-4 text-sm text-muted-foreground">Уроков пока нет. Добавьте первый урок в этот раздел.</p>
}

export default async function CourseProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const course = await managedDocument('courses', (await params).id)
  const { payload, user } = await requireContentAdmin()
  const [roadmap, sections, lessons] = await Promise.all([
    managedDocument('roadmaps', String(relationId(course.roadmap))),
    managedList('sections', { course: { equals: course.id } }),
    // Контент каждого ролика не нужен для списка программы.
    collectAllPages(
      ({ page, limit }) => payload.find({ collection: 'lessons', where: { course: { equals: course.id } }, select: { title: true, slug: true, section: true, order: true, isPublished: true, description: true }, depth: 0, user, overrideAccess: false, sort: ['order', 'id'], page, limit }),
      { label: `программа курса ${course.id}` },
    ),
  ])
  const sectionIds = new Set(sections.map((section) => section.id))
  const unsectioned = lessons.filter((lesson) => !sectionIds.has(relationId(lesson.section) ?? 0))

  return (
    <>
      <ManagementHeading title={course.title} breadcrumbs={[{ href: `/manage/roadmaps/${roadmap.id}`, label: roadmap.title }]} description="Добавляйте разделы и уроки. Для изменения описания, обложки или публикации откройте настройки курса." actions={<>
        <Link href={`/manage/lessons/new?course=${course.id}`} className={managementPrimary}>Добавить урок</Link>
        <Link href={`/manage/courses/${course.id}/settings`} className={managementLink}>Настройки и публикация</Link>
        {course.isPublished && <Link href={`/courses/${course.slug}`} target="_blank" rel="noopener noreferrer" className={managementLink}>Посмотреть как ученик</Link>}
      </>} />
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <PublicationStatus published={course.isPublished === true} />
        <span>Разделов: {sections.length}</span><span>Уроков: {lessons.length}</span>
      </div>

      <section className="space-y-4" aria-label="Программа курса">
        {sections.map((section) => (
          <section key={section.id} className="overflow-hidden rounded-xl border border-border bg-card" aria-label={`Раздел «${section.title}»`}>
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
              <div className="min-w-0 space-y-2">
                <h2 className="break-words text-lg font-semibold">{section.title}</h2>
                {section.description && <p className="max-w-2xl text-sm text-muted-foreground">{section.description}</p>}
                <PublicationStatus published={section.isPublished === true} />
              </div>
              <Link href={`/manage/lessons/new?course=${course.id}&section=${section.id}`} className={managementLink}>Добавить урок в раздел</Link>
            </header>
            <LessonRows lessons={lessons.filter((lesson) => relationId(lesson.section) === section.id)} />
            <details className="border-t border-border p-4">
              <summary className="min-h-[44px] cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Изменить раздел и публикацию</summary>
              <div className="mt-3"><SectionForm section={section} courseId={course.id} /></div>
            </details>
          </section>
        ))}
        {(unsectioned.length > 0 || sections.length === 0) && (
          <section className="overflow-hidden rounded-xl border border-border bg-card" aria-label="Уроки без раздела">
            <h2 className="border-b border-border p-4 text-lg font-semibold">{sections.length ? 'Уроки без раздела' : 'Уроки курса'}</h2>
            <LessonRows lessons={unsectioned} />
          </section>
        )}
      </section>

      <details className="rounded-xl border border-dashed border-border p-4" open={sections.length === 0}>
        <summary className="min-h-[44px] cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-ring">Добавить раздел</summary>
        <p className="my-3 text-sm text-muted-foreground">Объедините уроки по теме или этапу обучения.</p>
        <SectionForm courseId={course.id} />
      </details>
    </>
  )
}

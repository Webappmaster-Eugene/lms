import Link from 'next/link'
import { managedList } from '@/lib/content-management/pages'
import { CourseCatalogue } from '@/components/content-management/CourseCatalogue'
import { ManagementHeading, managementLink, managementPrimary } from '@/components/content-management/ManagementHeading'

export const metadata = { title: 'Учебный контент' }

export default async function ContentManagementPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [roadmaps, courses, query] = await Promise.all([managedList('roadmaps'), managedList('courses'), searchParams])
  return (
    <>
      <ManagementHeading title="Учебный контент" description="Создавайте курсы, собирайте программу и готовьте уроки. Черновики остаются здесь до публикации." actions={<Link href="/manage/courses/new" className={managementPrimary}>Добавить курс</Link>} />
      <nav aria-label="Контент по роадмапам" className="flex flex-wrap gap-2">
        {roadmaps.map((roadmap) => <Link key={roadmap.id} href={`/manage/roadmaps/${roadmap.id}`} className={managementLink}>{roadmap.title}</Link>)}
      </nav>
      <CourseCatalogue courses={courses} roadmaps={roadmaps} query={typeof query.q === 'string' ? query.q : ''} />
    </>
  )
}

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BootcampTabs } from '@/components/tutoring/BootcampTabs'
import { tutoringArea, tutoringPath } from '@/server/tutoring-bootcamps'
import { routeSlug } from '@/lib/route-slug'
import { CourseDetail, courseDetailTitle } from '@/components/course/CourseDetail'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: await courseDetailTitle(routeSlug((await params).slug), 'bootcamp') }
}

export default async function BootcampDetailPage({ params }: Props) {
  const slug = routeSlug((await params).slug)
  const { tutoring, manuals } = await tutoringArea()
  const course = tutoring.find(item => item.slug === slug)
  const base = tutoringPath(slug)
  if (course && !manuals.some(item => item.id === course.id)) redirect(base)
  return CourseDetail({ slug, area: 'bootcamp', navigation: course ? <BootcampTabs label="Разделы буткемпа" items={[
    { href: `/bootcamp/${encodeURIComponent(slug)}`, label: 'Методички', active: true },
    { href: base, label: 'Репетиторство', active: false },
  ]} /> : undefined })
}

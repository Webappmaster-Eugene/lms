import type { Metadata } from 'next'
import { BootcampTabs } from '@/components/tutoring/BootcampTabs'
import { bootcampLectureArea } from '@/server/tutoring-bootcamps'
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
  const area = await bootcampLectureArea(slug)
  return CourseDetail({ slug, area: 'bootcamp', navigation: area ? <BootcampTabs label="Разделы буткемпа" items={[
    { href: `/bootcamp/${encodeURIComponent(slug)}`, label: 'Методички', active: true },
    { href: area.base, label: 'Лекции', active: false },
  ]} /> : undefined })
}

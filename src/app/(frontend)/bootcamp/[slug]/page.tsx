import type { Metadata } from 'next'
import { BootcampTabs } from '@/components/tutoring/BootcampTabs'
import { bootcampArea, bootcampLectureArea } from '@/server/tutoring-bootcamps'
import { BuyerAccess } from '@/components/bootcamp/BuyerAccess'
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
  const [area, { manuals, isAdmin }] = await Promise.all([bootcampLectureArea(slug), bootcampArea()])
  const course = manuals.find(item => item.slug === slug)
  return CourseDetail({ slug, area: 'bootcamp', navigation: <>{area && <BootcampTabs label="Разделы буткемпа" items={[
    { href: `/bootcamp/${encodeURIComponent(slug)}`, label: 'Методички', active: true },
    { href: area.base, label: 'Лекции', active: false },
  ]} />}{course && !isAdmin && <BuyerAccess scope={{ courseId: course.id }} />}</> })
}

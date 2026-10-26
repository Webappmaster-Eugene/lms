import type { Metadata } from 'next'
import { routeSlug } from '@/lib/route-slug'
import { CourseDetail, courseDetailTitle } from '@/components/course/CourseDetail'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: await courseDetailTitle(routeSlug((await params).slug), 'bootcamp') }
}

export default async function BootcampDetailPage({ params }: Props) {
  // Вызов, а не элемент: страница отдаёт готовое дерево, как до выноса в компонент.
  return CourseDetail({ slug: routeSlug((await params).slug), area: 'bootcamp' })
}

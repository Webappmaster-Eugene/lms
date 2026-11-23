import { notFound, redirect } from 'next/navigation'
import { legacyTutoringPath } from '@/server/tutoring-bootcamps'

export default async function LegacyTutoringPage({ params, searchParams }: {
  params: Promise<{ slug: string; path?: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug, path = [] } = await params
  const base = await legacyTutoringPath(slug)
  if (path.length > 2 || (path.length === 1 && path[0] !== 'streams') ||
    (path.length === 2 && (!['streams', 'lectures'].includes(path[0]) || !/^[1-9]\d*$/.test(path[1])))) notFound()
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query.set(key, value)
  }
  redirect(base + path.map(part => '/' + part).join('') + (query.size ? '?' + query : ''))
}

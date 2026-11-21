import { legacyTutoringStream } from '@/server/tutoring-bootcamps'

export default async function LegacyStream({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return legacyTutoringStream((await params).id, await searchParams)
}

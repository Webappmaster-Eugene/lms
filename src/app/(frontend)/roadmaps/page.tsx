import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import Link from 'next/link'
import { Map } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Роадмапы',
}

export default async function RoadmapsPage() {
  const payload = await getPayload()

  const roadmaps = await payload.find({
    collection: 'roadmaps',
    where: { isPublished: { equals: true } },
    sort: 'order',
    limit: 50,
  })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">Роадмапы</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {roadmaps.docs.map((roadmap) => (
          <Link
            key={roadmap.id}
            href={`/roadmaps/${roadmap.slug}`}
            className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Map className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                  {roadmap.title}
                </h2>
              </div>
            </div>
          </Link>
        ))}

        {roadmaps.docs.length === 0 && (
          <p className="col-span-full text-center text-muted-foreground py-12">
            Роадмапы пока не опубликованы
          </p>
        )}
      </div>
    </div>
  )
}

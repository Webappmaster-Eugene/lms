import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ImportForm } from './ImportForm'

export const metadata: Metadata = {
  title: 'Импорт из Яндекс.Диска',
}

export default async function ImportYandexPage() {
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  if (!user || user.role !== 'admin') {
    redirect('/')
  }

  const courses = await payload.find({
    collection: 'courses',
    sort: 'title',
    limit: 100,
  })

  const courseOptions = courses.docs.map((c) => ({
    id: String(c.id),
    title: c.title,
  }))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Импорт из Яндекс.Диска</h1>
      <p className="text-muted-foreground">
        Автоматически создайте секции и уроки из видео-файлов в публичной папке Яндекс.Диска.
        Файлы должны быть названы по формату: <code className="rounded bg-muted px-1.5 py-0.5 text-sm">1.1 - Название видео.mp4</code>
      </p>

      <ImportForm courses={courseOptions} />
    </div>
  )
}

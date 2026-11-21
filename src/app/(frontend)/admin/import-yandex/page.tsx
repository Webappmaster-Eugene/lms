import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { adminLoginHref } from '@/lib/admin-login-redirect'
import { collectAllPages } from '@/lib/paginate'
import { getLearningRequest } from '@/server/learning-request'
import { ImportForm } from './ImportForm'

export const metadata: Metadata = {
  title: 'Импорт из Яндекс.Диска',
}

export default async function ImportYandexPage() {
  const { payload, user } = await getLearningRequest()

  if (!user) redirect(adminLoginHref(await headers(), '/login'))
  if (user.role !== 'admin') redirect('/')

  const courseDocs = await collectAllPages(
    ({ page, limit }) =>
      payload.find({
        collection: 'courses',
        sort: ['title', 'id'],
        select: { title: true },
        depth: 0,
        page,
        limit,
      }),
    { label: 'курсы для импорта' },
  )

  const courseOptions = courseDocs.map((c) => ({
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

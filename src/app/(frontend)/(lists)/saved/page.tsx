import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { SavedList } from '@/components/bookmarks/SavedList'
import { loadSaved } from '@/lib/bookmarks'
import { getPayload } from '@/lib/payload'

export const metadata: Metadata = {
  title: 'Сохранённое',
}

export default async function SavedPage() {
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect('/login')

  const items = await loadSaved(payload, user.id, user)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Сохранённое</h1>
        <p className="text-sm text-muted-foreground">Уроки и задачи, к которым вы хотели вернуться</p>
      </div>
      <SavedList items={items} />
    </div>
  )
}

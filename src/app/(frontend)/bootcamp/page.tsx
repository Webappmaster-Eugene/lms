import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Tent } from 'lucide-react'
import { getLearningRequest } from '@/server/learning-request'
import { getBootcamps } from '@/server/bootcamps'

export const metadata: Metadata = {
  title: 'Буткемпы',
}

export default async function BootcampPage() {
  const { payload, user, req } = await getLearningRequest()
  if (!user) redirect('/login')
  const bootcamps = await getBootcamps(payload, user, req)
  // Обычно ученик проходит один буткемп: сразу его программа, без лишнего шага. Страница вне (lists):
  // их loading.tsx начинает потоковый ответ, и редирект стал бы клиентским — 200 и мелькание заглушки.
  const [only] = bootcamps
  if (only && bootcamps.length === 1) redirect(`/bootcamp/${only.slug}`)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Tent className="h-7 w-7 text-primary" aria-hidden="true" />
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Буткемпы</h1>
      </div>
      {bootcamps.length === 0 && user.role === 'admin' ? (
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Опубликованных буткемпов нет. Буткемпом становится курс с флажком «Буткемп» в CMS.
        </p>
      ) : bootcamps.length === 0 ? (
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Вам не назначен ни один буткемп. Если вы записались на поток и ждёте доступа, напишите в <Link href="/contacts" className="font-medium text-foreground underline underline-offset-2">поддержку</Link>.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {bootcamps.map((bootcamp) => (
            <li key={bootcamp.id}>
              <Link href={`/bootcamp/${bootcamp.slug}`} className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card p-4 font-semibold text-foreground transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-ring">
                <Tent className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                {bootcamp.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

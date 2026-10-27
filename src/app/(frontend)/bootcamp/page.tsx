import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ExternalLink, Tent } from 'lucide-react'
import { HELP_LINK, LockedSection } from '@/components/access/LockedSection'
import { BOOTCAMP_LANDING_URL } from '@/lib/site-links'
import { getLearningRequest } from '@/server/learning-request'
import { getBootcamps } from '@/server/bootcamps'

export const metadata: Metadata = {
  title: 'Буткемпы',
}

type Props = { searchParams: Promise<{ locked?: string | string[] }> }

export default async function BootcampPage({ searchParams }: Props) {
  const { payload, user, req } = await getLearningRequest()
  if (!user) redirect('/login')
  const bootcamps = await getBootcamps(payload, user, req)
  // Ссылка на закрытый буткемп с карты роадмапа ведёт сюда с ?locked: участник другого буткемпа
  // должен увидеть объяснение, а не уйти редиректом в свой.
  const lockedRequested = (await searchParams).locked !== undefined
  // Обычно ученик проходит один буткемп: сразу его программа, без лишнего шага. Страница вне (lists):
  // их loading.tsx начинает потоковый ответ, и редирект стал бы клиентским — 200 и мелькание заглушки.
  const [only] = bootcamps
  if (only && bootcamps.length === 1 && !lockedRequested) redirect(`/bootcamp/${only.slug}`)
  const isAdmin = user.role === 'admin'
  const showLocked = !isAdmin && (bootcamps.length === 0 || lockedRequested)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Tent className="h-7 w-7 text-primary" aria-hidden="true" />
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Буткемпы</h1>
      </div>
      {bootcamps.length === 0 && isAdmin && (
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Опубликованных буткемпов нет. Буткемпом становится курс с флажком «Буткемп» в CMS.
        </p>
      )}
      {showLocked && (
        <LockedSection
          title={bootcamps.length === 0 ? 'Буткемп вам пока не открыт' : 'Этот буткемп вам пока не открыт'}
          description="В буткемпе вы вместе с наставником неделя за неделей делаете backend-сервис на Node.js по методичкам и сдаёте каждую часть на проверку. Раздел откроется, когда вы запишетесь на поток."
          help={<>Если вы уже записались и ждёте доступа, напишите в разделе {HELP_LINK}.</>}
          action={
            <a href={BOOTCAMP_LANDING_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring">
              Узнать о буткемпе и записаться
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          }
        />
      )}
      {bootcamps.length > 0 && (
        <section className="space-y-3" aria-label="Ваши буткемпы">
          {showLocked && <h2 className="text-base font-semibold text-foreground">Ваши буткемпы</h2>}
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
        </section>
      )}
    </div>
  )
}

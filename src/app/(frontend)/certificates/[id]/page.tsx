import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Award } from 'lucide-react'

import { CertificateActions } from '@/components/certificate/CertificateActions'
import { getPayload } from '@/lib/payload'
import { formatDate } from '@/lib/utils'

type Props = { params: Promise<{ id: string }> }

export const metadata: Metadata = {
  title: 'Сертификат',
}

export default async function CertificatePage({ params }: Props) {
  const { id } = await params
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect('/login')

  // Local API обходит доступы коллекции — владельца проверяем условием выборки.
  const numericId = Number(id)
  if (!Number.isInteger(numericId)) notFound()
  const { docs } = await payload.find({
    collection: 'certificates',
    where: { id: { equals: numericId }, user: { equals: user.id } },
    limit: 1,
    depth: 0,
  })
  const cert = docs[0]
  if (!cert) notFound()

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ')

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/certificates"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground print:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        Все сертификаты
      </Link>

      <CertificateActions />

      <article className="rounded-2xl border-2 border-warning/40 bg-card p-5 text-center sm:p-12 print:border-black print:bg-white print:text-black">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-warning/10 print:bg-transparent">
          <Award className="h-9 w-9 text-warning print:text-black" aria-hidden="true" />
        </div>
        <p className="mt-6 text-sm uppercase tracking-[0.2em] text-muted-foreground print:text-black">
          Сертификат MentorCareer
        </p>
        <p className="mt-6 text-sm text-muted-foreground print:text-black">Настоящим подтверждается, что</p>
        <h1 className="mt-2 break-words text-2xl font-bold sm:text-3xl text-foreground print:text-black">{fullName || user.email}</h1>
        <p className="mt-4 text-sm text-muted-foreground print:text-black">
          успешно завершил(а) {cert.type === 'course' ? 'курс' : 'роадмап'}
        </p>
        <p className="mt-2 text-xl font-semibold text-foreground print:text-black">«{cert.title}»</p>

        <dl className="mx-auto mt-10 grid max-w-md grid-cols-1 sm:grid-cols-2 gap-4 border-t border-dashed border-border pt-6 text-sm print:border-black">
          <div>
            <dt className="text-muted-foreground print:text-black">Дата выдачи</dt>
            <dd className="mt-1 font-medium text-foreground print:text-black">{formatDate(cert.issuedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground print:text-black">Номер</dt>
            <dd className="mt-1 break-all font-mono text-xs font-medium text-foreground print:text-black">{cert.certificateNumber}</dd>
          </div>
        </dl>
      </article>
    </div>
  )
}

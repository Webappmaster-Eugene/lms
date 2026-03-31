import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Award, Download } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Сертификаты',
}

type CertificateDoc = {
  id: string
  type: string
  title: string
  certificateNumber: string
  issuedAt: string
  relatedEntity: string
}

export default async function CertificatesPage() {
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const certificates = await (payload as any).find({
    collection: 'certificates',
    where: { user: { equals: user.id } },
    sort: '-issuedAt',
    limit: 50,
  })

  const docs = (certificates.docs ?? []) as CertificateDoc[]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Мои сертификаты</h1>

      {docs.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Award className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">
            Завершите курс или роадмап, чтобы получить сертификат
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {docs.map((cert) => (
            <div
              key={cert.id}
              className="rounded-xl border border-border bg-card p-6 space-y-4"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10">
                  <Award className="h-6 w-6 text-warning" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{cert.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {cert.type === 'course' ? 'Курс' : 'Роадмап'}
                  </p>
                </div>
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Номер</span>
                  <span className="font-mono text-xs text-foreground">{cert.certificateNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Дата выдачи</span>
                  <span className="text-foreground">{formatDate(cert.issuedAt)}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-border pt-3 text-center">
                <p className="text-xs text-muted-foreground">
                  Сертификат MentorCareer LMS
                </p>
                <p className="text-xs font-semibold text-foreground mt-1">
                  {user.firstName} {user.lastName}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

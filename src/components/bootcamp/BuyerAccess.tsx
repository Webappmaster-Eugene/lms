import Link from 'next/link'
import { defenseLabels } from '@/lib/bootcamp-defense'
import { getBuyerEnrollment } from '@/server/bootcamp-buyer'
import { getLearningRequest } from '@/server/learning-request'
import { PaymentStatusRefresh } from './PaymentStatusRefresh'

export async function BuyerAccess({ scope }: { scope: { leadId: number } | { courseId: number } }) {
  const { payload, req, user } = await getLearningRequest()
  const receipt = 'leadId' in scope
  if (!user) return receipt ? <Link className="font-semibold text-primary underline" href="/login?redirect=%2Fbootcamp">Войти в учебный кабинет</Link> : null
  const access = await getBuyerEnrollment(payload, user, req, scope)
  if (!access) return receipt ? <p className="mt-2 text-sm">
    Если вы уже вошли с почтой из заявки, дождитесь приглашения в поток. Ссылка на проект появится после зачисления.
  </p> : null
  const link = 'font-semibold text-primary underline underline-offset-4'
  return <section className="my-3 grid gap-2 rounded-xl border border-border bg-card p-4 text-sm" aria-label="Доступ к оплаченному буткемпу">
    {receipt && access.courseHref && <Link className={link} href={access.courseHref}>Открыть курс</Link>}
    {access.projectUrl ? <a className={link} href={access.projectUrl} target="_blank" rel="noopener noreferrer">Открыть свой проект GitLab</a> :
      <p>{access.projectStatus === 'failed' || access.projectStatus === 'done'
        ? 'Ссылка на проект пока недоступна. Обратитесь к наставнику.'
        : 'Готовим ваш проект GitLab. Здесь появится ссылка.'}</p>}
    {receipt && ['queued', 'running'].includes(access.projectStatus) && <PaymentStatusRefresh />}
    {access.defense && <div>
      <p className="font-semibold">{defenseLabels[access.defense.outcome]}</p>
      <a className={link} href={access.defense.url} target="_blank" rel="noopener noreferrer">Открыть разбор защиты</a>
    </div>}
  </section>
}

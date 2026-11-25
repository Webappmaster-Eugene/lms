'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@payloadcms/ui'
import { apiFetch, readJson } from '@/lib/http-client'
import type { CourseGrantChoice } from '@/server/bootcamp-course-confirmation'

export function LegacyCoursePanel({ id, studentId, choices, refunded }: { id: number; studentId: number | null; choices: CourseGrantChoice[]; refunded: boolean }) {
  const router = useRouter()
  const [grant, setGrant] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const confirm = async () => {
    setBusy(true)
    try {
      const response = await apiFetch(`/api/bootcamp/enrollments/${id}/course`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grantId: Number(grant) }) })
      const result = await readJson<{ error?: string; course?: number }>(response)
      if (!response.ok || !result?.course) throw new Error(result?.error ?? 'Не удалось подтвердить курс')
      setMessage('Курс подтвержден.')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось подтвердить курс')
    } finally {
      setBusy(false)
    }
  }
  return <section className="lead-path__step" aria-label="Сверка оплаченного курса">
    <h3 className="lead-path__step-title">Сверка оплаченного курса</h3>
    <p>В старом зачислении не указан курс. Сверьте покупку с заявкой и назначениями ученика.</p>
    {refunded && <p>Возврат уже оформлен. Проверьте доступ к этому курсу в карточке ученика.</p>}
    {studentId && <p><Link href={`/admin/learning-access?user=${studentId}`}>Открыть назначения ученика</Link></p>}
    {choices.length > 0 ? <><label className="enrollment__field">Оплаченный курс
      <select value={grant} disabled={busy} onChange={event => setGrant(event.target.value)}>
        <option value="">Выберите из назначений ученика</option>
        {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.title}</option>)}
      </select>
    </label>
    <Button type="button" size="small" disabled={!grant || busy} onClick={() => void confirm()}>Подтвердить оплаченный курс</Button></>
      : <p>{studentId ? 'Среди назначений ученика нет буткемпа. Проверьте доступы перед выпуском.' : 'Учетная запись ученика не привязана. Проверьте зачисление в заявке.'}</p>}
    {message && <p role="status">{message}</p>}
  </section>
}

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button, useDocumentInfo } from '@payloadcms/ui'

import type { LeadEnrollmentState } from '@/server/bootcamp-enrollment'
import { EnrollmentSteps, formatEnrollmentTime } from './EnrollmentSteps'

import './enrollment-admin.scss'

type Form = { firstName: string, lastName: string, username: string, group: string, accessUntil: string }

const POLL_MS = 4000

async function request(url: string, init?: RequestInit): Promise<LeadEnrollmentState> {
  const response = await fetch(url, { credentials: 'same-origin', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const data = await response.json().catch(() => null) as (LeadEnrollmentState & { error?: string }) | null
  if (!response.ok || !data) throw new Error(data?.error ?? `Сервер ответил ${response.status}. Обновите страницу и попробуйте ещё раз.`)
  return data
}

/**
 * Зачисление прямо из заявки: форма с подсказками из заявки, затем ход шагов.
 * Пока GitLab-часть ждёт исполнителя или выполняется, панель обновляется сама.
 */
export function EnrollmentPanel() {
  const { id } = useDocumentInfo()
  const [state, setState] = useState<LeadEnrollmentState | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (id === undefined || id === null) return
    let active = true
    request(`/api/bootcamp/leads/${id}/enrollment`).then((next) => {
      if (!active) return
      setState(next)
      setForm((current) => current ?? { ...next.defaults, accessUntil: '' })
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : String(loadError))
    })
    return () => { active = false }
  }, [id, reload])

  const status = state?.enrollment?.status
  useEffect(() => {
    if (status !== 'queued' && status !== 'running') return
    const timer = window.setInterval(() => setReload((value) => value + 1), POLL_MS)
    return () => window.clearInterval(timer)
  }, [status])

  if (id === undefined || id === null) return null
  if (!state || !form) {
    return <div className="enrollment">{error ? <p className="enrollment__error" role="alert">{error}</p> : <p className="enrollment__hint">Загружаем зачисление…</p>}</div>
  }

  const act = async (run: () => Promise<LeadEnrollmentState | null>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await run()
      if (next) setState(next)
      else setReload((value) => value + 1)
      setConfirming(false)
    } catch (actError) {
      setError(actError instanceof Error ? actError.message : String(actError))
    } finally {
      setBusy(false)
    }
  }

  const enroll = () => act(() => request(`/api/bootcamp/leads/${id}/enrollment`, { method: 'POST', body: JSON.stringify(form) }))
  const retry = (enrollmentId: number) => act(async () => {
    const response = await fetch(`/api/bootcamp/enrollments/${enrollmentId}/retry`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } })
    if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? `Сервер ответил ${response.status}`)
    return null
  })

  const enrollment = state.enrollment
  if (enrollment) {
    return (
      <div className="enrollment" aria-live="polite">
        <p className="enrollment__title">Зачисление: {enrollment.statusLabel}</p>
        <p className="enrollment__hint">
          {enrollment.firstName} {enrollment.lastName}, логин GitLab {enrollment.gitlabUsername}, поток {enrollment.streamGroup}.
          {enrollment.status === 'queued' && ' Учётка LMS готова, учётку и проект в GitLab создаст исполнитель в VM GitLab, обычно за полминуты.'}
        </p>
        <EnrollmentSteps steps={enrollment.steps} />
        {enrollment.error && <p className="enrollment__error" role="alert">{enrollment.error}</p>}
        <p className="enrollment__links">
          {enrollment.gitlabProjectUrl && <a href={enrollment.gitlabProjectUrl} target="_blank" rel="noreferrer">Проект в GitLab</a>}
          {enrollment.lmsUserId && <Link href={`/admin/collections/users/${enrollment.lmsUserId}`}>Учётка LMS</Link>}
          <Link href={`/admin/collections/bootcamp-enrollments/${enrollment.id}`}>Карточка зачисления</Link>
        </p>
        <p className="enrollment__hint">
          Первый вход в LMS: {enrollment.lmsSignedInAt ? formatEnrollmentTime(enrollment.lmsSignedInAt) : 'ещё не было'}.
          {' '}Первый вход в GitLab: {enrollment.gitlabSignedInAt ? formatEnrollmentTime(enrollment.gitlabSignedInAt) : 'ещё не было'}.
        </p>
        {enrollment.status === 'failed' && (
          <div className="enrollment__actions">
            <Button type="button" buttonStyle="secondary" size="small" margin={false} disabled={busy} onClick={() => void retry(enrollment.id)}>
              {busy ? 'Ставим в очередь…' : 'Повторить шаги GitLab'}
            </Button>
            <span className="enrollment__hint">Сделанные шаги исполнитель пропустит.</span>
          </div>
        )}
        {error && <p className="enrollment__error" role="alert">{error}</p>}
      </div>
    )
  }

  const field = (key: keyof Form, label: string, hint?: string, type = 'text') => (
    <label className="enrollment__field">
      <span>{label}</span>
      <input type={type} value={form[key]} disabled={busy} onChange={(event) => { setConfirming(false); setForm({ ...form, [key]: event.target.value }) }} />
      {hint && <small>{hint}</small>}
    </label>
  )

  return (
    <div className="enrollment">
      <p className="enrollment__title">Зачисление</p>
      <p className="enrollment__hint">
        Кнопка заводит ученика целиком: учётку LMS с приглашением и курсом методичек, учётку GitLab с письмом для пароля и проект ученика из bootcamp/course с защищённой main.
        {state.lead.status !== 'admitted' && ` Этап заявки сейчас «${state.lead.statusLabel}», обычно зачисляют после «Допущен».`}
      </p>
      <div className="enrollment__grid">
        {field('firstName', 'Имя')}
        {field('lastName', 'Фамилия')}
        {field('username', 'Логин GitLab', 'Станет путём проекта: поток/логин')}
        {field('group', 'Группа потока в GitLab', 'Должна уже быть в GitLab и в GRADER_GROUPS грейдера')}
        {field('accessUntil', 'Курс методичек открыт до', 'Пусто - без срока', 'date')}
      </div>
      <div className="enrollment__actions">
        {confirming ? (
          <>
            <Button type="button" buttonStyle="primary" size="small" margin={false} disabled={busy} onClick={() => void enroll()}>
              {busy ? 'Зачисляем…' : 'Да, зачислить'}
            </Button>
            <Button type="button" buttonStyle="secondary" size="small" margin={false} disabled={busy} onClick={() => setConfirming(false)}>Отмена</Button>
            <span className="enrollment__hint">На {state.lead.email} уйдут два письма: приглашение в LMS и ссылка для пароля GitLab.</span>
          </>
        ) : (
          <Button type="button" buttonStyle="primary" size="small" margin={false} disabled={busy} onClick={() => setConfirming(true)}>Зачислить</Button>
        )}
      </div>
      {error && <p className="enrollment__error" role="alert">{error}</p>}
    </div>
  )
}

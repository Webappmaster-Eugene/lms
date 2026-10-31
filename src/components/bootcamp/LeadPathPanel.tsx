'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { Button, useDocumentInfo } from '@payloadcms/ui'

import type { LeadPathState } from '@/server/bootcamp-lead-path'
import { EnrollmentSteps, formatEnrollmentTime as at } from './EnrollmentSteps'

import './enrollment-admin.scss'

type Action = 'admit' | 'prepare' | 'reject' | 'withdraw' | 'reopen' | 'extend-entry-task' | 'resend-payment' | 'cancel-admission' | 'mark-paid' | 'enroll'
type Fields = Record<string, string>

const POLL_MS = 4000
const DECISION = ['new', 'contacted', 'diagnostic']
const CLOSED = ['preparation', 'rejected', 'withdrawn']

async function call(url: string, init?: RequestInit): Promise<LeadPathState> {
  const response = await fetch(url, { credentials: 'same-origin', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const data = await response.json().catch(() => null) as (LeadPathState & { error?: string }) | null
  if (!response.ok || !data) throw new Error(data?.error ?? `Сервер ответил ${response.status}. Обновите страницу и попробуйте ещё раз.`)
  return data
}

function Step({ title, done, children }: { title: string, done: boolean, children: ReactNode }) {
  return (
    <section className={`lead-path__step${done ? ' lead-path__step--done' : ''}`}>
      <p className="lead-path__step-title">{title}</p>
      {children}
    </section>
  )
}

/**
 * Путь заявки: решение, оплата и зачисление кнопками (решение владельца 31.10.2026).
 * Этап меняют только эти кнопки и события системы, у каждого перехода свои письма.
 */
export function LeadPathPanel() {
  const { id } = useDocumentInfo()
  const [state, setState] = useState<LeadPathState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<{ action: Action, fields: Fields } | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (id === undefined || id === null) return
    let active = true
    call(`/api/bootcamp/leads/${id}/path`).then((next) => { if (active) setState(next) }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : String(loadError))
    })
    return () => { active = false }
  }, [id, reload])

  const enrollmentStatus = state?.enrollment?.status
  useEffect(() => {
    if (enrollmentStatus !== 'queued' && enrollmentStatus !== 'running') return
    const timer = window.setInterval(() => setReload((value) => value + 1), POLL_MS)
    return () => window.clearInterval(timer)
  }, [enrollmentStatus])

  if (id === undefined || id === null) return null
  if (!state) return <div className="enrollment">{error ? <p className="enrollment__error" role="alert">{error}</p> : <p className="enrollment__hint">Загружаем путь заявки…</p>}</div>

  const { lead, enrollment } = state
  const draft = state.admission?.enrollment
  const run = async (action: Action, body: Fields = {}) => {
    setBusy(true)
    setError(null)
    try {
      setState(await call(`/api/bootcamp/leads/${id}/path`, { method: 'POST', body: JSON.stringify({ action, ...body }) }))
      setForm(null)
    } catch (actError) {
      setError(actError instanceof Error ? actError.message : String(actError))
    } finally {
      setBusy(false)
    }
  }
  const retry = async (enrollmentId: number) => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/bootcamp/enrollments/${enrollmentId}/retry`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } })
      if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? `Сервер ответил ${response.status}`)
      setReload((value) => value + 1)
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : String(retryError))
    } finally {
      setBusy(false)
    }
  }

  const open = (action: Action, fields: Fields = {}) => { setError(null); setForm({ action, fields }) }
  const button = (label: string, onClick: () => void, primary = false) => (
    <Button type="button" buttonStyle={primary ? 'primary' : 'secondary'} size="small" margin={false} disabled={busy} onClick={onClick}>{label}</Button>
  )
  const input = (key: string, label: string, hint?: string, type = 'text') => form && (
    <label className="enrollment__field" key={key}>
      <span>{label}</span>
      {type === 'textarea'
        ? <textarea rows={4} value={form.fields[key] ?? ''} disabled={busy} onChange={(event) => setForm({ ...form, fields: { ...form.fields, [key]: event.target.value } })} />
        : <input type={type} value={form.fields[key] ?? ''} disabled={busy} onChange={(event) => setForm({ ...form, fields: { ...form.fields, [key]: event.target.value } })} />}
      {hint && <small>{hint}</small>}
    </label>
  )
  const confirm = (label: string, hint: string) => form && (
    <div className="enrollment__actions">
      {button(busy ? 'Выполняем…' : label, () => void run(form.action, form.fields), true)}
      {button('Отмена', () => setForm(null))}
      <span className="enrollment__hint">{hint}</span>
    </div>
  )
  const enrollFields = () => <>
    {input('firstName', 'Имя')}
    {input('lastName', 'Фамилия')}
    {input('username', 'Логин GitLab', 'Станет путём проекта: поток/логин')}
    {input('group', 'Группа потока в GitLab', 'Должна быть в GitLab и в GRADER_GROUPS грейдера')}
    {input('accessUntil', 'Курс методичек открыт до', 'Пусто - без срока', 'date')}
  </>
  const enrollDefaults = (): Fields => draft
    ? { firstName: draft.firstName, lastName: draft.lastName, username: draft.username, group: draft.group, accessUntil: draft.accessUntil?.slice(0, 10) ?? '' }
    : { firstName: state.defaults.firstName, lastName: state.defaults.lastName, username: state.defaults.username, group: state.defaults.group, accessUntil: '' }

  const forms: Partial<Record<Action, ReactNode>> = {
    admit: <>
      <div className="enrollment__grid">
        {enrollFields()}
        {input('amount', 'Сумма к оплате, ₽', 'По умолчанию цена потока')}
        {input('dueDays', 'Срок оплаты, дней', 'До конца этого дня по Москве', 'number')}
      </div>
      {input('comment', 'Комментарий в письмо', 'Необязательно. Увидит кандидат', 'textarea')}
      {confirm('Да, допустить', state.paymentsEnabled ? `На ${lead.email} уйдёт письмо с личной ссылкой на оплату. После оплаты зачисление с этими данными запустится само.` : 'Робокасса не подключена: письмо со ссылкой не уйдёт, оплату можно будет отметить вручную.')}
    </>,
    prepare: <>{input('message', 'Что подтянуть', 'Уйдёт кандидату в письме', 'textarea')}{confirm('Да, отправить на подготовку', `На ${lead.email} уйдёт письмо с этим текстом.`)}</>,
    reject: <>{input('message', 'Причина', 'Необязательно. Уйдёт кандидату в письме', 'textarea')}{confirm('Да, отказать', `На ${lead.email} уйдёт письмо с решением.`)}</>,
    withdraw: <>{input('message', 'Заметка', 'Необязательно. Кандидату письмо не уходит', 'textarea')}{confirm('Да, кандидат отказался', 'Заявка закроется без письма.')}</>,
    reopen: confirm('Да, вернуть', 'Заявка вернётся к решению, письма не будет.'),
    'extend-entry-task': confirm('Да, отправить', `На ${lead.email} уйдёт письмо с той же ссылкой и новым сроком, 7 дней. Число отправок решения не обнуляется.`),
    'resend-payment': <>{input('dueDays', 'Новый срок оплаты, дней', 'От сегодняшнего дня', 'number')}{confirm('Да, отправить', `На ${lead.email} уйдёт письмо с той же ссылкой и новым сроком.`)}</>,
    'cancel-admission': confirm('Да, отменить допуск', 'Ссылка на оплату перестанет работать, заявка вернётся к решению. Кандидату письмо не уходит.'),
    'mark-paid': <>
      <div className="enrollment__grid">{input('amount', 'Сумма, ₽')}</div>
      {input('comment', 'Как прошла оплата', 'Например: перевод на карту 31.10', 'textarea')}
      {confirm('Да, отметить оплату', 'Дальше как при оплате через Робокассу: письма и автозачисление.')}
    </>,
    enroll: <><div className="enrollment__grid">{enrollFields()}</div>{confirm('Да, зачислить', `На ${lead.email} уйдут приглашение в LMS и ссылка для пароля GitLab.`)}</>,
  }
  const shown = (action: Action) => form?.action === action ? forms[action] : null

  const decided = !DECISION.includes(lead.status)
  const paid = Boolean(lead.paidAt)
  const paidPayments = state.payments.filter((payment) => payment.status === 'paid')
  // Тестовой картой может «оплатить» кто угодно: такую оплату без зачисления можно снять.
  const testOnly = paid && !enrollment && paidPayments.length > 0 && paidPayments.every((payment) => payment.isTest)

  return (
    <div className="enrollment lead-path" aria-live="polite">
      <p className="enrollment__title">Путь заявки: {lead.statusLabel}</p>
      {!state.paymentsEnabled && <p className="enrollment__hint">Робокасса не подключена: переменные ROBOKASSA_* не заданы. Допустить можно, оплату тогда отмечают вручную.</p>}
      {state.paymentsTest && <p className="enrollment__hint">Робокасса в тестовом режиме: оплаты не настоящие.</p>}

      <Step title="1. Заявка и входное задание" done={Boolean(lead.entrySubmittedAt)}>
        <p className="enrollment__hint">
          Заявка {at(lead.createdAt)}. {lead.entryTaskSentAt ? `Задание отправлено ${at(lead.entryTaskSentAt)}, срок ${lead.entryTaskDueAt ? at(lead.entryTaskDueAt) : 'не задан'}.` : 'Письмо с заданием не ушло.'}
          {' '}{lead.entrySubmittedAt ? `Решение ${at(lead.entrySubmittedAt)}: ${lead.entryPassed} из ${lead.entryTotal} тестов, отправок ${lead.entrySubmissionCount}. Код - ниже, в блоке «Решение входного задания».` : 'Решения пока нет.'}
        </p>
        {DECISION.includes(lead.status) && !form && <div className="enrollment__actions">{button('Продлить срок и отправить задание ещё раз', () => open('extend-entry-task'))}</div>}
        {shown('extend-entry-task')}
      </Step>

      <Step title="2. Решение о допуске" done={decided && !CLOSED.includes(lead.status)}>
        {DECISION.includes(lead.status) && !form && (
          <div className="enrollment__actions">
            {button('Допустить', () => open('admit', { ...enrollDefaults(), amount: state.defaults.amount, dueDays: String(state.defaults.dueDays), comment: '' }), true)}
            {button('Нужна подготовка', () => open('prepare', { message: '' }))}
            {button('Отказать', () => open('reject', { message: '' }))}
            {button('Кандидат отказался сам', () => open('withdraw', { message: '' }))}
          </div>
        )}
        {CLOSED.includes(lead.status) && (
          <>
            <p className="enrollment__hint">Решение: «{lead.statusLabel}».{lead.decisionMessage ? ` Текст: ${lead.decisionMessage}` : ''}</p>
            {!form && <div className="enrollment__actions">{button('Вернуть на рассмотрение', () => open('reopen'))}</div>}
          </>
        )}
        {lead.admittedAt && !CLOSED.includes(lead.status) && <p className="enrollment__hint">Допущен {at(lead.admittedAt)}{draft ? `: ${draft.firstName} ${draft.lastName}, логин GitLab ${draft.username}, поток ${draft.group}` : ''}.</p>}
        {shown('admit')}{shown('prepare')}{shown('reject')}{shown('withdraw')}{shown('reopen')}
      </Step>

      <Step title="3. Оплата" done={paid}>
        {lead.status === 'admitted' && (
          <>
            <p className="enrollment__hint">
              {lead.amount} до {lead.paymentDueAt ? at(lead.paymentDueAt) : '?'}{lead.paymentExpired ? ', срок прошёл' : ''}.
              {' '}Письмо со ссылкой: {lead.paymentLinkSentAt ? at(lead.paymentLinkSentAt) : 'не отправлено'}.
              {' '}Страницу оплаты открыл: {lead.paymentPageOpenedAt ? at(lead.paymentPageOpenedAt) : 'ещё нет'}.
              {' '}К оплате переходил: {lead.paymentStartedAt ? at(lead.paymentStartedAt) : 'ещё нет'}.
              {lead.paymentReminderSentAt ? ` Напоминание: ${at(lead.paymentReminderSentAt)}.` : ''}
            </p>
            {lead.paymentUrl && <p className="enrollment__hint">Личная ссылка кандидата: <a href={lead.paymentUrl} target="_blank" rel="noreferrer">{lead.paymentUrl}</a></p>}
            {!form && (
              <div className="enrollment__actions">
                {state.paymentsEnabled && button('Отправить ссылку ещё раз', () => open('resend-payment', { dueDays: String(state.defaults.dueDays) }))}
                {button('Отметить оплату вручную', () => open('mark-paid', { amount: (lead.amount ?? '').replace(/[^\d,]/g, '').replace(',', '.'), comment: '' }))}
                {button('Отменить допуск', () => open('cancel-admission'))}
              </div>
            )}
          </>
        )}
        {paid && <p className="enrollment__hint">Оплачено {at(lead.paidAt ?? '')}{testOnly ? ' в тестовом режиме: деньги не списаны' : ''}.</p>}
        {testOnly && !form && <div className="enrollment__actions">{button('Отменить допуск', () => open('cancel-admission'))}</div>}
        {!lead.admittedAt && !paid && <p className="enrollment__hint">Ссылка на оплату появится после допуска.</p>}
        {state.payments.length > 0 && (
          <ul className="lead-path__list" aria-label="Попытки оплаты">
            {state.payments.map((payment) => (
              <li key={payment.id}>
                <Link href={`/admin/collections/bootcamp-payments/${payment.id}`}>Счёт {payment.id}</Link>
                {` ${payment.amount}, ${payment.status === 'paid' ? `оплачен ${payment.paidAt ? at(payment.paidAt) : ''}` : payment.status === 'pending' ? 'ждёт оплаты' : 'отменён'}`}
                {payment.method === 'manual' ? ', отмечен вручную' : payment.paymentMethod ? `, ${payment.paymentMethod}` : ''}
                {payment.isTest ? ', тестовый' : ''}
              </li>
            ))}
          </ul>
        )}
        {shown('resend-payment')}{shown('mark-paid')}{shown('cancel-admission')}
      </Step>

      <Step title="4. Зачисление" done={enrollment?.status === 'done'}>
        {enrollment ? (
          <>
            <p className="enrollment__hint">
              {enrollment.statusLabel}: {enrollment.firstName} {enrollment.lastName}, логин GitLab {enrollment.gitlabUsername}, поток {enrollment.streamGroup}.
              {enrollment.status === 'queued' && ' Учётку и проект в GitLab создаст исполнитель в VM GitLab, обычно за полминуты.'}
            </p>
            <EnrollmentSteps steps={enrollment.steps} />
            {enrollment.error && <p className="enrollment__error" role="alert">{enrollment.error}</p>}
            <p className="enrollment__links">
              {enrollment.gitlabProjectUrl && <a href={enrollment.gitlabProjectUrl} target="_blank" rel="noreferrer">Проект в GitLab</a>}
              {enrollment.lmsUserId && <Link href={`/admin/collections/users/${enrollment.lmsUserId}`}>Учётка LMS</Link>}
              <Link href={`/admin/collections/bootcamp-enrollments/${enrollment.id}`}>Карточка зачисления</Link>
            </p>
            {enrollment.status === 'failed' && <div className="enrollment__actions">{button(busy ? 'Ставим в очередь…' : 'Повторить шаги GitLab', () => void retry(enrollment.id))}<span className="enrollment__hint">Сделанные шаги исполнитель пропустит.</span></div>}
          </>
        ) : paid ? (
          <>
            <p className="enrollment__hint">{testOnly
              ? 'Оплата тестовая: доступы по ней автоматически не выдаются. Если это проверка, зачислите кнопкой, если нет - отмените допуск в шаге «Оплата».'
              : 'Оплата есть, а зачисления нет: автозачисление не стартовало, причина в истории ниже. Проверьте данные и зачислите.'}</p>
            {!form && <div className="enrollment__actions">{button('Зачислить', () => open('enroll', enrollDefaults()), true)}</div>}
            {shown('enroll')}
          </>
        ) : <p className="enrollment__hint">Запустится само после оплаты.</p>}
      </Step>

      <Step title="5. Учёба" done={Boolean(enrollment?.gitlabSignedInAt)}>
        <p className="enrollment__hint">
          Первый вход в LMS: {enrollment?.lmsSignedInAt ? at(enrollment.lmsSignedInAt) : 'ещё не было'}.
          {' '}Первый вход в GitLab: {enrollment?.gitlabSignedInAt ? at(enrollment.gitlabSignedInAt) : 'ещё не было'}.
          {' '}MR, CI и вердикты проверки появляются в истории.
        </p>
      </Step>

      {error && <p className="enrollment__error" role="alert">{error}</p>}

      <details className="lead-path__history" open={state.events.length <= 8}>
        <summary>История заявки ({state.events.length})</summary>
        {state.events.length === 0 ? <p className="enrollment__hint">Событий пока нет.</p> : (
          <ul className="lead-path__list">
            {state.events.map((event) => (
              <li key={event.id}>
                <span className="enrollment__detail">{at(event.at)}{event.actor ? `, ${event.actor}` : ''}</span>
                {event.message}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  )
}

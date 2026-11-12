'use client'

import { useEffect, useState, type FormEvent } from 'react'
import type { CreatedStudent, StudentCredentials, StudentDetails, StudentProfile } from './contracts'
import { result } from './request'
import { apiFetch } from '@/lib/http-client'
import { FreezeForm, PlanForm, UnfreezeForm, freezeStatus } from './StudentFreezeForms'

const base = '/api/manage/students'

async function send<T>(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  return result<T>(await apiFetch(url, { method, credentials: 'same-origin', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }))
}

const message = (error: unknown) => error instanceof Error ? error.message : 'Не удалось выполнить операцию'

export function NewStudentForm({ onCreated, onCancel }: { onCreated: (created: CreatedStudent) => void; onCancel: () => void }) {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try { onCreated(await send<CreatedStudent>(base, 'POST', { email, firstName, lastName })) }
    catch (cause) { setError(message(cause)) }
    finally { setSaving(false) }
  }
  return <form className="student-panel" aria-label="Новый ученик" onSubmit={(event) => void submit(event)}>
    <h2>Новый ученик</h2>
    <p>Пароль создаст система и покажет один раз. Письмо ученику не уходит: логин и пароль вы передаёте сами.</p>
    <div className="learning-access__fields">
      <label>Почта (логин)<input type="email" required maxLength={254} value={email} disabled={saving} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Имя<input required maxLength={100} value={firstName} disabled={saving} onChange={(event) => setFirstName(event.target.value)} /></label>
      <label>Фамилия<input required maxLength={100} value={lastName} disabled={saving} onChange={(event) => setLastName(event.target.value)} /></label>
    </div>
    {error && <p role="alert" className="learning-access__error">{error}</p>}
    <div className="access-tree__actions"><button type="submit" className="learning-access__primary" disabled={saving}>{saving ? 'Создаём…' : 'Создать ученика'}</button><button type="button" disabled={saving} onClick={onCancel}>Отмена</button></div>
  </form>
}

export function CredentialsNotice({ credentials, onClose }: { credentials: StudentCredentials; onClose: () => void }) {
  const [copied, setCopied] = useState('')
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const text = `Доступ к платформе MentorCareer\nВход: ${origin}/login\nЛогин: ${credentials.email}\nПароль: ${credentials.password}`
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied('Скопировано')
    } catch { setCopied('Не удалось скопировать, выделите текст вручную') }
  }
  return <section className="student-credentials" aria-label="Логин и пароль ученика">
    <h2>Логин и пароль</h2>
    <p>Передайте их ученику. Пароль показан один раз и нигде не сохранён в открытом виде. Если он потеряется, создайте новый.</p>
    <textarea readOnly rows={4} aria-label="Текст для отправки ученику" value={text} />
    <div className="access-tree__actions"><button type="button" onClick={() => void copy()}>Скопировать</button><button type="button" onClick={onClose}>Скрыть</button>{copied && <span role="status">{copied}</span>}</div>
  </section>
}

type CardProps = { userId: number; disabled: boolean; onBusy?: (busy: boolean) => void; onChanged: () => void; onDeleted: () => void; onCredentials: (credentials: StudentCredentials) => void }

export function StudentCard({ userId, disabled, onBusy, onChanged, onDeleted, onCredentials }: CardProps) {
  const [details, setDetails] = useState<StudentDetails | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [panel, setPanel] = useState<'edit' | 'password' | 'delete' | 'freeze' | 'unfreeze' | 'plan' | null>(null)
  const [draft, setDraft] = useState({ email: '', firstName: '', lastName: '', telegram: '' })
  const [confirmEmail, setConfirmEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const abort = new AbortController()
    apiFetch(`${base}/${userId}`, { signal: abort.signal, credentials: 'same-origin' }).then(result<StudentDetails>)
      .then((data) => { if (!abort.signal.aborted) { setDetails(data); setError('') } })
      .catch((cause) => { if (!abort.signal.aborted) setError(message(cause)) })
    return () => abort.abort()
  }, [userId, attempt])

  async function run(work: () => Promise<void>) {
    setBusy(true)
    onBusy?.(true)
    setError('')
    try { await work() }
    catch (cause) { setError(message(cause)) }
    finally { setBusy(false); onBusy?.(false) }
  }
  const student: StudentProfile | undefined = details?.student
  const locked = disabled || busy
  const reload = () => { setPanel(null); setAttempt((value) => value + 1); onChanged() }
  function openEdit() {
    if (!student) return
    setDraft({ email: student.email, firstName: student.firstName, lastName: student.lastName, telegram: student.telegram ?? '' })
    setPanel('edit')
  }
  const toggle = (next: 'freeze' | 'unfreeze' | 'plan') => setPanel(panel === next ? null : next)
  const sendFreeze = (body: Record<string, unknown>) => run(async () => { await send(`${base}/${userId}/freeze`, 'POST', body); reload() })
  function save(event: FormEvent) {
    event.preventDefault()
    void run(async () => { await send(`${base}/${userId}`, 'PATCH', { ...draft, telegram: draft.telegram || null }); reload() })
  }

  if (!student) return error ? <div role="alert" className="learning-access__error"><p>{error}</p><button type="button" onClick={() => setAttempt(attempt + 1)}>Загрузить снова</button></div> : <p role="status">Загружаем ученика…</p>
  const impact = details?.impact
  return <section className="student-panel" aria-label="Карточка ученика">
    <p className="student-panel__line"><span>{student.email}</span>{student.telegram && <span>{student.telegram}</span>}{!student.isActive && <strong>Отключён: войти не сможет</strong>}{student.freeze.active ? <strong>{freezeStatus(student)}</strong> : <span>{freezeStatus(student)}</span>}{student.freeze.active && student.freeze.note && <span>{student.freeze.note}</span>}</p>
    {disabled && <p className="learning-access__hint">Сначала сохраните или отмените изменения доступа.</p>}
    <div className="access-tree__actions">
      <button type="button" disabled={locked} aria-expanded={panel === 'edit'} onClick={() => panel === 'edit' ? setPanel(null) : openEdit()}>Изменить данные</button>
      <button type="button" disabled={locked} aria-expanded={panel === 'password'} onClick={() => setPanel(panel === 'password' ? null : 'password')}>Новый пароль</button>
      {student.freeze.active
        ? <><button type="button" disabled={locked} aria-expanded={panel === 'unfreeze'} onClick={() => toggle('unfreeze')}>Разморозить</button><button type="button" disabled={locked} aria-expanded={panel === 'freeze'} onClick={() => toggle('freeze')}>Изменить срок</button></>
        : <><button type="button" disabled={locked} aria-expanded={panel === 'freeze'} onClick={() => toggle('freeze')}>Заморозить</button><button type="button" disabled={locked} aria-expanded={panel === 'plan'} onClick={() => toggle('plan')}>{student.freeze.plannedAt ? 'Изменить срок доступа' : 'Назначить срок доступа'}</button></>}
      {/* Отключение заменила бессрочная заморозка; «Включить» остаётся для учёток, отключённых раньше. */}
      {!student.isActive && <button type="button" disabled={locked} onClick={() => void run(async () => { await send(`${base}/${userId}`, 'PATCH', { isActive: true }); reload() })}>Включить</button>}
      <button type="button" disabled={locked} aria-expanded={panel === 'delete'} onClick={() => { setConfirmEmail(''); if (panel !== 'delete') setAttempt((value) => value + 1); setPanel(panel === 'delete' ? null : 'delete') }}>Удалить</button>
    </div>
    <label className="learning-access__radio"><input type="checkbox" checked={student.isTestStudent} disabled={locked} onChange={(event) => { const isTestStudent = event.target.checked; void run(async () => { await send(`${base}/${userId}`, 'PATCH', { isTestStudent }); reload() }) }} /><span><strong>Тестовый ученик</strong><small>Учётка для проверок: автоматическая заморозка через 6 месяцев её не касается.</small></span></label>
    {error && <p role="alert" className="learning-access__error">{error}</p>}
    {panel === 'freeze' && <FreezeForm busy={busy} send={sendFreeze} onCancel={() => setPanel(null)} frozen={student.freeze.active} />}
    {panel === 'unfreeze' && <UnfreezeForm busy={busy} send={sendFreeze} onCancel={() => setPanel(null)} />}
    {panel === 'plan' && <PlanForm busy={busy} send={sendFreeze} onCancel={() => setPanel(null)} plannedAt={student.freeze.plannedAt} />}
    {panel === 'edit' && <form aria-label="Данные ученика" onSubmit={save}>
      <div className="learning-access__fields">
        <label>Почта (логин)<input type="email" required maxLength={254} value={draft.email} disabled={busy} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
        <label>Имя<input required maxLength={100} value={draft.firstName} disabled={busy} onChange={(event) => setDraft({ ...draft, firstName: event.target.value })} /></label>
        <label>Фамилия<input required maxLength={100} value={draft.lastName} disabled={busy} onChange={(event) => setDraft({ ...draft, lastName: event.target.value })} /></label>
        <label>Telegram<input maxLength={64} value={draft.telegram} disabled={busy} onChange={(event) => setDraft({ ...draft, telegram: event.target.value })} /></label>
      </div>
      <div className="access-tree__actions"><button type="submit" disabled={busy}>Сохранить данные</button><button type="button" disabled={busy} onClick={() => setPanel(null)}>Отмена</button></div>
    </form>}
    {panel === 'password' && <div>
      <p>Прежний пароль перестанет работать, а ученик выйдет на всех устройствах. Новый пароль будет показан один раз.</p>
      <div className="access-tree__actions"><button type="button" disabled={busy} onClick={() => void run(async () => { const { credentials } = await send<{ credentials: StudentCredentials }>(`${base}/${userId}/password`, 'POST'); onCredentials(credentials); reload() })}>Создать новый пароль</button><button type="button" disabled={busy} onClick={() => setPanel(null)}>Отмена</button></div>
    </div>}
    {panel === 'delete' && impact && <div>
      {impact.blockers.length > 0 ? impact.blockers.map((blocker) => <p key={blocker} role="alert" className="learning-access__error">{blocker}</p>) : <>
        <p>Удаление нельзя отменить. Вместе с учеником удалятся: уроков в прогрессе - {impact.progress}, сертификатов - {impact.certificates}, комментариев - {impact.comments}, заметок - {impact.notes}, правил доступа - {impact.rules}, баллов - {impact.points}. Если ученик ещё может вернуться, лучше заморозить аккаунт.</p>
        <label>Для подтверждения введите почту ученика<input value={confirmEmail} disabled={busy} autoComplete="off" onChange={(event) => setConfirmEmail(event.target.value)} /></label>
        <div className="access-tree__actions"><button type="button" disabled={busy || confirmEmail.trim().toLowerCase() !== student.email} onClick={() => void run(async () => { await send(`${base}/${userId}`, 'DELETE', { confirmEmail }); onDeleted() })}>Удалить навсегда</button><button type="button" disabled={busy} onClick={() => setPanel(null)}>Отмена</button></div>
      </>}
    </div>}
  </section>
}

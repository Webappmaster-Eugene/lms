'use client'

import { useState, type FormEvent } from 'react'
import { addMoscowMonths, FREEZE_NOTICE_DAYS, FREEZE_REASONS, formatFreezeDate, moscowDayInput, type FreezeReason } from '@/lib/account-freeze'
import type { StudentProfile } from './contracts'

type Send = (body: Record<string, unknown>) => Promise<void>
type FormProps = { busy: boolean; send: Send; onCancel: () => void }

/** Состояние доступа одной строкой для карточки ученика. */
export function freezeStatus(student: StudentProfile): string {
  const { freeze } = student
  if (freeze.active) {
    const reason = freeze.reason ? `, ${FREEZE_REASONS[freeze.reason]}` : ''
    const until = freeze.endsAt ? `Заморожен до ${formatFreezeDate(freeze.endsAt)}` : 'Заморожен бессрочно'
    // Срок закончится, но следом начнётся другой период, например плановая заморозка по сроку доступа.
    const continues = freeze.endsAt !== null && freeze.endsAt !== freeze.frozenUntil
    const after = !continues ? '' : freeze.frozenUntil ? ` Потом заморозка продлится до ${formatFreezeDate(freeze.frozenUntil)}.` : ' Потом заморозка продлится бессрочно: к этому дню истечёт срок доступа.'
    return `${until}${reason}. Войти не сможет.${after}`
  }
  return freeze.plannedAt ? `Доступ до ${formatFreezeDate(freeze.plannedAt)}` : 'Доступ без срока'
}

const terms = [
  ['1m', '1 месяц'],
  ['3m', '3 месяца'],
  ['6m', '6 месяцев'],
  ['1y', '1 год'],
  ['forever', 'Бессрочно, до разморозки'],
  ['date', 'До даты'],
] as const
// «Срок обучения» ставит правило 6 месяцев и плановая дата, вручную его не выбирают.
const manualReasons = (Object.keys(FREEZE_REASONS) as FreezeReason[]).filter((reason) => reason !== 'term')
const tomorrow = () => moscowDayInput(Date.now() + 24 * 60 * 60 * 1000)

export function FreezeForm({ busy, send, onCancel, frozen }: FormProps & { frozen: boolean }) {
  const [term, setTerm] = useState<(typeof terms)[number][0]>('1m')
  const [until, setUntil] = useState(() => moscowDayInput(addMoscowMonths(Date.now(), 1)))
  const [reason, setReason] = useState<FreezeReason>('vacation')
  const [note, setNote] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    void send({ action: 'freeze', term, ...(term === 'date' ? { until } : {}), reason, note })
  }
  return <form aria-label="Заморозка аккаунта" onSubmit={submit}>
    <p>{frozen ? 'Новый срок заменит текущий и считается с сегодняшнего дня.' : 'Ученик сразу выйдет на всех устройствах и не сможет войти, смотреть уроки и скачивать файлы. Прогресс и доступы сохранятся.'}</p>
    <fieldset disabled={busy}><legend>Срок</legend>
      {terms.map(([value, label]) => <label key={value} className="learning-access__radio"><input type="radio" name="freeze-term" checked={term === value} onChange={() => setTerm(value)} /><span><strong>{label}</strong></span></label>)}
      {term === 'date' && <label>Разморозить<input type="date" required min={tomorrow()} value={until} onChange={(event) => setUntil(event.target.value)} /></label>}
    </fieldset>
    <div className="learning-access__fields">
      <label>Причина<select value={reason} disabled={busy} onChange={(event) => setReason(event.target.value as FreezeReason)}>{manualReasons.map((value) => <option key={value} value={value}>{FREEZE_REASONS[value]}</option>)}</select></label>
      <label>Заметка для себя<input maxLength={500} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} /></label>
    </div>
    <div className="access-tree__actions"><button type="submit" className="learning-access__primary" disabled={busy}>{frozen ? 'Сохранить новый срок' : 'Заморозить аккаунт'}</button><button type="button" disabled={busy} onClick={onCancel}>Отмена</button></div>
  </form>
}

const nextOptions = [
  ['6m', 'Через 6 месяцев', 'Через полгода ученик снова замёрзнет и выйдет на связь за продлением.'],
  ['1y', 'Через год', 'Плановая заморозка через 12 месяцев.'],
  ['none', 'Не планировать', 'Доступ без срока, пока его не заморозят вручную.'],
] as const

export function UnfreezeForm({ busy, send, onCancel }: FormProps) {
  const [next, setNext] = useState<(typeof nextOptions)[number][0]>('6m')
  function submit(event: FormEvent) {
    event.preventDefault()
    void send({ action: 'unfreeze', next })
  }
  return <form aria-label="Разморозка аккаунта" onSubmit={submit}>
    <p>Ученик снова сможет войти. Прежние входы не оживут: на каждом устройстве он войдёт заново.</p>
    <fieldset disabled={busy}><legend>Следующая заморозка</legend>
      {nextOptions.map(([value, label, hint]) => <label key={value} className="learning-access__radio"><input type="radio" name="freeze-next" checked={next === value} onChange={() => setNext(value)} /><span><strong>{label}</strong><small>{hint}</small></span></label>)}
    </fieldset>
    <div className="access-tree__actions"><button type="submit" className="learning-access__primary" disabled={busy}>Разморозить аккаунт</button><button type="button" disabled={busy} onClick={onCancel}>Отмена</button></div>
  </form>
}

export function PlanForm({ busy, send, onCancel, plannedAt }: FormProps & { plannedAt: string | null }) {
  const [date, setDate] = useState(() => moscowDayInput(plannedAt ?? addMoscowMonths(Date.now(), 6)))
  function submit(event: FormEvent) {
    event.preventDefault()
    void send({ action: 'plan', date })
  }
  return <form aria-label="Плановая заморозка" onSubmit={submit}>
    <p>{`В этот день ученик замёрзнет бессрочно. За ${FREEZE_NOTICE_DAYS} дней он увидит предупреждение с просьбой написать наставнику.`}</p>
    <div className="learning-access__fields">
      <label>Доступ до<input type="date" required min={tomorrow()} value={date} disabled={busy} onChange={(event) => setDate(event.target.value)} /></label>
    </div>
    <div className="access-tree__actions">
      <button type="submit" className="learning-access__primary" disabled={busy}>Сохранить дату</button>
      {plannedAt && <button type="button" disabled={busy} onClick={() => void send({ action: 'plan', date: null })}>Без плановой заморозки</button>}
      <button type="button" disabled={busy} onClick={onCancel}>Отмена</button>
    </div>
  </form>
}

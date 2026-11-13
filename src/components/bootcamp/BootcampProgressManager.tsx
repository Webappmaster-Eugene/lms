'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { apiFetch, readJson } from '@/lib/http-client'
import { BOOTCAMP_PROGRAM_WEEKS, REVIEW_SLA_DAYS, WEEK_STATE_LABELS, type BootcampProgressReport, type WeekCell, type WeekState } from '@/lib/bootcamp-progress'
import { daysLabel } from '@/lib/learning-analytics'
import '../student-analytics/student-analytics.scss'

const endpoint = '/api/manage/bootcamp-progress'
const DAY_MS = 86_400_000
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Moscow' })
const fullDate = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow' })
const shortDate = (value: string) => dateFormat.format(new Date(value))
// Срок - полночь по Москве начала дня встречи: на экране показываем последний день сдачи.
const dueLabel = (value: string) => dateFormat.format(new Date(Date.parse(value) - 1))

/** Короткая метка ячейки; полный текст - в подсказке и для читалки экрана. */
function code(cell: WeekCell, now: number): string {
  switch (cell.state) {
    case 'accepted': return '✓'
    case 'review': return cell.since ? `${Math.max(0, Math.floor((now - Date.parse(cell.since)) / DAY_MS))} дн` : 'ревью'
    case 'failed-check': return '✗'
    case 'ci-failed': return 'CI'
    case 'checking': return '…'
    case 'open': return 'MR'
    case 'closed': return 'закр'
    case 'none': return cell.late ? '!' : ''
  }
}

function describe(cell: WeekCell, now: number): string {
  const parts = [`Неделя ${cell.week}: ${WEEK_STATE_LABELS[cell.state]}`]
  if (cell.state === 'accepted' && cell.since) parts.push(`слита ${fullDate.format(new Date(cell.since))}`)
  if (cell.state === 'review' && cell.since) parts.push(`ждёт ${daysLabel(Math.max(0, Math.floor((now - Date.parse(cell.since)) / DAY_MS)))}`)
  if (cell.checks) parts.push(`проверок ${cell.checks}`)
  if (cell.dueAt) parts.push(`срок ${dueLabel(cell.dueAt)}${cell.late ? (cell.state === 'accepted' ? ', принята после срока' : ', срок прошёл') : ''}`)
  if (cell.overdue) parts.push(`ревью дольше ${REVIEW_SLA_DAYS} дней`)
  return parts.join(', ')
}

const LEGEND: { state: WeekState; text: string; late?: boolean; overdue?: boolean }[] = [
  { state: 'accepted', text: '✓ принята: наставник слил MR' },
  { state: 'review', text: 'N дн - проверка пройдена, ждёт ревью столько дней' },
  { state: 'checking', text: '… новые коммиты, ждут проверки бота' },
  { state: 'failed-check', text: '✗ проверка не пройдена' },
  { state: 'ci-failed', text: 'CI - упал CI MR' },
  { state: 'open', text: 'MR открыт, проверки ещё не было' },
  { state: 'closed', text: 'закр - MR закрыт без слияния' },
  { state: 'none', late: true, text: '! срок прошёл, сдачи нет' },
  { state: 'ci-failed', late: true, text: 'красный уголок - срок прошёл, неделя не принята' },
  { state: 'review', overdue: true, text: `красная рамка - ревью дольше ${REVIEW_SLA_DAYS} дней` },
]

function hours(value: number | null): string {
  if (value === null) return '-'
  return value >= 48 ? daysLabel(Math.round(value / 24)) : `${Math.round(value)} ч`
}

export function BootcampProgressManager({ initialStream = null }: { initialStream?: number | null }) {
  const [stream, setStream] = useState<number | null>(initialStream)
  const [withTest, setWithTest] = useState(false)
  const [result, setResult] = useState<{ key: string; data: BootcampProgressReport | null; error: string | null } | null>(null)
  const key = `${stream ?? ''}:${withTest}`
  const [now] = useState(() => Date.now())
  useEffect(() => {
    const abort = new AbortController()
    const params = new URLSearchParams()
    if (stream !== null) params.set('stream', String(stream))
    if (withTest) params.set('test', '1')
    apiFetch(`${endpoint}?${params}`, { signal: abort.signal, credentials: 'same-origin' })
      .then(async (response) => {
        const data = await readJson<BootcampProgressReport & { error?: unknown }>(response)
        if (!response.ok || !data) throw new Error(typeof data?.error === 'string' ? data.error : 'Не удалось загрузить данные. Повторите попытку')
        if (!abort.signal.aborted) setResult({ key, data, error: null })
      })
      .catch((error) => { if (!abort.signal.aborted) setResult({ key, data: null, error: error instanceof Error ? error.message : 'Не удалось загрузить учёбу буткемпа' }) })
    return () => abort.abort()
  }, [key, stream, withTest])
  const loading = result?.key !== key
  const data = result?.data ?? null
  const weeks = Array.from({ length: BOOTCAMP_PROGRAM_WEEKS }, (_, index) => index + 1)
  const dues = new Map((data?.students[0]?.weeks ?? []).map((cell) => [cell.week, cell.dueAt]))
  return <div className="student-analytics bootcamp-progress">
    <header><h1>Учёба буткемпа</h1><p>Сдачи недель по событиям GitLab: неделя принята, когда наставник слил MR из ветки week-NN. Сроки недель - из календаря потока, ответ на сдачу - в течение {REVIEW_SLA_DAYS} дней.</p></header>
    <div className="student-analytics__controls learning-analytics__controls">
      <label>Поток<select value={data && !data.stream ? '' : stream ?? data?.stream?.id ?? ''} onChange={(event) => setStream(event.target.value ? Number(event.target.value) : null)}>
        {data && !data.stream && <option value="">Выберите поток</option>}
        {(data?.streams ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
      <label className="student-analytics__check"><input type="checkbox" checked={withTest} onChange={(event) => setWithTest(event.target.checked)} />Показать тестовых</label>
      <Link className="bootcamp-progress__streams-link" href="/admin/collections/bootcamp-streams">Потоки и сроки недель</Link>
    </div>
    {loading && <p role="status">Загружаем учёбу потока…</p>}
    {result?.error && <p role="alert">{result.error}</p>}
    {data && !data.stream && (data.streams.length === 0
      ? <p>Потоков пока нет. Создайте поток в CMS: «Буткемпы» → «Потоки буткемпа», укажите группу GitLab и сроки недель.</p>
      : <p>Такого потока нет: возможно, его удалили. Выберите поток в списке.</p>)}
    {data?.stream && <>
      <dl className="student-analytics__summary" aria-label="Итоги потока">
        <div><dt>Учеников</dt><dd>{data.summary.students}</dd></div>
        <div><dt>Идут по плану</dt><dd>{data.summary.onPlan}</dd></div>
        <div><dt>Отстают на 1 неделю</dt><dd>{data.summary.lagOne}</dd></div>
        <div><dt>Отстают на 2 и больше</dt><dd>{data.summary.lagMore}</dd></div>
        <div><dt>Ждут ревью</dt><dd>{data.summary.waitingReview}</dd></div>
        <div><dt>Ревью дольше {REVIEW_SLA_DAYS} дней</dt><dd>{data.summary.overdueReview}</dd></div>
        <div><dt>Медиана ревью</dt><dd>{hours(data.summary.medianReviewHours)}</dd></div>
      </dl>
      <p className="student-analytics__notice">Группа GitLab: {data.stream.gitlabGroup}. Первая встреча {fullDate.format(new Date(data.stream.startsAt))}.</p>
      {data.students.length === 0 ? <p>В потоке пока нет зачисленных учеников.</p> : <div className="student-analytics__table-wrap" role="region" aria-label="Недели учеников" tabIndex={0}>
        <table className="student-analytics__table bootcamp-progress__matrix">
          <thead><tr>
            <th scope="col">Ученик</th><th scope="col">План<small>к сегодня</small></th><th scope="col">Принято</th><th scope="col">Отставание</th><th scope="col">GitLab<small>последнее</small></th><th scope="col">LMS<small>последнее</small></th><th scope="col">Методички</th>
            {weeks.map((week) => <th key={week} scope="col" className="bootcamp-progress__week">{week}{dues.get(week) && <small>{dueLabel(dues.get(week) as string)}</small>}</th>)}
          </tr></thead>
          <tbody>{data.students.map((student) => <tr key={student.enrollmentId}>
            <th scope="row">
              <strong>{student.title}</strong>
              <small>{student.projectUrl ? <a href={student.projectUrl} target="_blank" rel="noopener noreferrer">{student.gitlabUsername}</a> : student.gitlabUsername}</small>
              {(student.frozen || student.isTest) && <span className="student-analytics__badges">{student.frozen && <span data-tone="frozen">Заморожен</span>}{student.isTest && <span data-tone="muted">Тестовый</span>}</span>}
              {student.userId && <small><Link href={`/admin/student-analytics?user=${student.userId}`}>Карточка ученика</Link></small>}
            </th>
            <td>{student.planned}</td><td>{student.accepted}</td>
            <td data-lag={student.lag > 1 ? 'more' : student.lag === 1 ? 'one' : 'none'}>{student.lag === 0 ? 'нет' : student.lag}</td>
            <td>{student.lastGitlabAt ? shortDate(student.lastGitlabAt) : '-'}</td>
            <td>{student.lastLmsAt ? shortDate(student.lastLmsAt) : '-'}</td>
            <td>{student.manuals ? `${student.manuals.done} из ${student.manuals.total}` : '-'}</td>
            {student.weeks.map((cell) => {
              const label = describe(cell, now)
              const mark = code(cell, now)
              return <td key={cell.week} className="bootcamp-progress__cell" data-state={cell.state} data-late={cell.late} data-overdue={cell.overdue} title={label}>
                {cell.mrUrl ? <a href={cell.mrUrl} target="_blank" rel="noopener noreferrer" aria-label={label}>{mark || '·'}</a> : <span role="img" aria-label={label}>{mark}</span>}
              </td>
            })}
          </tr>)}</tbody>
        </table>
      </div>}
      <ul className="bootcamp-progress__legend" aria-label="Обозначения">
        {LEGEND.map((item) => <li key={item.text}><span className="bootcamp-progress__cell" data-state={item.state} data-late={item.late === true} data-overdue={item.overdue === true} aria-hidden="true" />{item.text}</li>)}
      </ul>
    </>}
  </div>
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { apiFetch, readJson } from '@/lib/http-client'
import { ANALYTICS_PERIODS, daysLabel, formatMinutes, share, type AnalyticsPeriod, type CourseDetail, type CoursesOverview } from '@/lib/learning-analytics'
import { formatPercent, progressBarStyle } from '@/lib/progress-percent'
import '../student-analytics/student-analytics.scss'

const endpoint = '/api/manage/learning-analytics'
const UNOPENED_SHOWN = 30

async function load<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await apiFetch(url, { signal, credentials: 'same-origin' })
  const data = await readJson<{ error?: unknown }>(response)
  if (!response.ok || !data) throw new Error(typeof data?.error === 'string' ? data.error : 'Не удалось загрузить данные. Повторите попытку')
  return data as T
}

const percent = (value: number | null) => value === null ? '-' : formatPercent(value)

function Share({ part, whole }: { part: number; whole: number }) {
  return <span className="student-analytics__progress"><span className="student-analytics__bar" aria-hidden="true"><span style={progressBarStyle(share(part, whole))} /></span><span>{part}{whole > 0 ? ` из ${whole}` : ''}</span></span>
}

function Detail({ courseId, onClose }: { courseId: number; onClose: () => void }) {
  const [state, setState] = useState<{ id: number; data: CourseDetail | null; error: string | null } | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    load<CourseDetail>(`${endpoint}?course=${courseId}`, abort.signal)
      .then((data) => { if (!abort.signal.aborted) setState({ id: courseId, data, error: null }) })
      .catch((error) => { if (!abort.signal.aborted) setState({ id: courseId, data: null, error: error instanceof Error ? error.message : 'Не удалось загрузить курс' }) })
    return () => abort.abort()
  }, [courseId])
  const current = state?.id === courseId ? state : null
  return <section className="student-analytics__section" aria-label="Курс по урокам" id="learning-analytics-course">
    <div className="student-analytics__section-header"><h2>{current?.data ? <>Курс по урокам: <Link href={current.data.href}>{current.data.title}</Link></> : 'Курс по урокам'}</h2><button type="button" onClick={onClose}>Закрыть</button></div>
    {!current && <p role="status">Загружаем уроки курса…</p>}
    {current?.error && <p role="alert">{current.error}</p>}
    {current?.data && <>
      <p className="student-analytics__notice">Начали курс: {current.data.started}. «Прошли» - доля от начавших. Выделен урок, после которого проходящих стало меньше всего.</p>
      <div className="student-analytics__table-wrap" role="region" aria-label="Уроки курса" tabIndex={0}>
        <table className="student-analytics__table">
          <thead><tr><th scope="col">№</th><th scope="col">Урок</th><th scope="col">Прошли</th><th scope="col">Открывали</th><th scope="col">Досмотрели видео</th><th scope="col">Вопросы</th><th scope="col">Заметки</th></tr></thead>
          <tbody>{current.data.lessons.map((lesson) => <tr key={lesson.id} data-drop={lesson.drop}>
            <td>{lesson.position}</td>
            <th scope="row"><Link href={lesson.href}>{lesson.title}</Link>{lesson.drop && <small>Здесь больше всего учеников перестают проходить</small>}</th>
            <td><Share part={lesson.completed} whole={current.data?.started ?? 0} /></td>
            <td>{lesson.viewed}</td><td>{lesson.videoEnded}</td><td>{lesson.questions}</td><td>{lesson.notes}</td>
          </tr>)}</tbody>
        </table>
        {current.data.lessons.length === 0 && <p>В курсе нет опубликованных уроков.</p>}
      </div>
    </>}
  </section>
}

export function LearningAnalyticsManager() {
  const [period, setPeriod] = useState<AnalyticsPeriod>(30)
  const [roadmap, setRoadmap] = useState<number | null>(null)
  const [course, setCourse] = useState<number | null>(null)
  const [result, setResult] = useState<{ key: string; data: CoursesOverview | null; error: string | null } | null>(null)
  const key = `${period}:${roadmap ?? ''}`
  useEffect(() => {
    const abort = new AbortController()
    load<CoursesOverview>(`${endpoint}?period=${period}${roadmap === null ? '' : `&roadmap=${roadmap}`}`, abort.signal)
      .then((data) => { if (!abort.signal.aborted) setResult({ key, data, error: null }) })
      .catch((error) => { if (!abort.signal.aborted) setResult({ key, data: null, error: error instanceof Error ? error.message : 'Не удалось загрузить аналитику курсов' }) })
    return () => abort.abort()
  }, [key, period, roadmap])
  const loading = result?.key !== key
  const data = result?.data ?? null
  const periodLabel = `за ${daysLabel(period)}`
  function openCourse(id: number) {
    setCourse(id)
    window.setTimeout(() => document.getElementById('learning-analytics-course')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 0)
  }
  return <div className="student-analytics learning-analytics">
    <header><h1>Курсы и роадмапы</h1><p>Как ученики проходят открытые им роадмапы и курсы: сколько начали и закончили, сколько времени тратят и на каком уроке останавливаются. Тестовые ученики не учитываются.</p></header>
    <div className="student-analytics__controls learning-analytics__controls">
      <label>Период<select value={period} onChange={(event) => setPeriod(Number(event.target.value) as AnalyticsPeriod)}>{ANALYTICS_PERIODS.map((value) => <option key={value} value={value}>{daysLabel(value)}</option>)}</select></label>
      <label>Роадмап<select value={roadmap ?? ''} onChange={(event) => { setRoadmap(event.target.value ? Number(event.target.value) : null); setCourse(null) }}>
        <option value="">Все курсы</option>
        {data?.roadmaps.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
    </div>
    {loading && <p role="status">Загружаем аналитику курсов…</p>}
    {result?.error && <p role="alert">{result.error}</p>}
    {data && <>
      <section className="student-analytics__section" aria-label="Роадмапы">
        <h2>Роадмапы</h2>
        <p className="student-analytics__notice">Учеников в расчёте: {data.students}. Программа роадмапа - его курсы и курсы, добавленные в темы, как при выдаче сертификата за роадмап.</p>
        {data.roadmaps.length === 0 ? <p>Ни одному ученику не открыт ни один роадмап.</p> : <div className="student-analytics__table-wrap" role="region" aria-label="Таблица роадмапов" tabIndex={0}>
          <table className="student-analytics__table">
            <thead><tr><th scope="col">Роадмап</th><th scope="col">С доступом</th><th scope="col">Начали</th><th scope="col">Закончили</th><th scope="col">Медиана прогресса<small>у учеников с доступом</small></th><th scope="col">Занимались<small>{periodLabel}</small></th><th scope="col">Время<small>{periodLabel}</small></th></tr></thead>
            <tbody>{data.roadmaps.map((item) => <tr key={item.id}>
              <th scope="row"><Link href={item.href}>{item.title}</Link><small>{item.courses} курсов, {item.lessons} уроков</small></th>
              <td>{item.access}</td><td>{item.started}</td><td>{item.completed}</td><td>{percent(item.medianProgress)}</td><td>{item.period.active}</td><td>{formatMinutes(item.period.minutes)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
      <section className="student-analytics__section" aria-label="Курсы в работе">
        <h2>Курсы в работе</h2>
        {data.courses.length === 0 ? <p>{roadmap === null ? 'Ученики ещё не начали ни одного курса.' : 'В этом роадмапе ученики ещё не начали ни одного курса.'}</p> : <div className="student-analytics__table-wrap" role="region" aria-label="Таблица курсов" tabIndex={0}>
          <table className="student-analytics__table">
            <thead><tr><th scope="col">Курс</th><th scope="col">С доступом</th><th scope="col">Начали</th><th scope="col">Закончили</th><th scope="col">Медиана прогресса<small>у начавших</small></th><th scope="col">Время<small>{periodLabel}</small></th><th scope="col">Уроков<small>{periodLabel}</small></th><th scope="col">Вопросы<small>{periodLabel}</small></th><th scope="col">Останавливаются на</th></tr></thead>
            <tbody>{data.courses.map((item) => <tr key={item.id} data-selected={item.id === course}>
              <th scope="row"><button type="button" className="student-analytics__name" aria-pressed={item.id === course} onClick={() => openCourse(item.id)}><strong>{item.title}</strong>{item.roadmap && <small>{item.roadmap}</small>}</button></th>
              <td>{item.access}</td><td>{item.started}</td><td>{item.completed}</td><td>{percent(item.medianProgress)}</td><td>{formatMinutes(item.period.minutes)}</td><td>{item.period.lessons}</td><td>{item.questions}</td>
              <td className="learning-analytics__stuck">{item.stuckAt ? <><Link href={item.stuckAt.href}>{item.stuckAt.title}</Link><small>учеников: {item.stuckAt.students}</small></> : '-'}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
      {course !== null && <Detail courseId={course} onClose={() => setCourse(null)} />}
      {data.unopened.length > 0 && <section className="student-analytics__section" aria-label="Открыты, но никто не начал">
        <h2>Открыты, но никто не начал</h2>
        <p className="student-analytics__notice">Курсов: {data.unopened.length}. Рядом - сколько учеников их видят.</p>
        <ul className="learning-analytics__unopened">{data.unopened.slice(0, UNOPENED_SHOWN).map((item) => <li key={item.id}><Link href={item.href}>{item.title}</Link> <small>доступ у {item.access}</small></li>)}</ul>
        {data.unopened.length > UNOPENED_SHOWN && <details><summary>Ещё {data.unopened.length - UNOPENED_SHOWN}</summary><ul className="learning-analytics__unopened">{data.unopened.slice(UNOPENED_SHOWN).map((item) => <li key={item.id}><Link href={item.href}>{item.title}</Link> <small>доступ у {item.access}</small></li>)}</ul></details>}
      </section>}
    </>}
  </div>
}

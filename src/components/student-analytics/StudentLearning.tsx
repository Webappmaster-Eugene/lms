'use client'

import { useState } from 'react'
import Link from 'next/link'

import { daysLabel, formatMinutes, share, type StudentLearning, type WeekActivity } from '@/lib/learning-analytics'
import { StudentBadges, formatDate } from './StudentsTable'

const shortDate = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
const longDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const weekDate = (week: string, format: Intl.DateTimeFormat) => format.format(new Date(`${week}T00:00:00.000Z`))

function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const percent = share(done, total)
  return <div className="student-analytics__progress">
    <span className="student-analytics__bar" aria-hidden="true"><span style={{ width: `${percent ?? 0}%` }} /></span>
    <span>{label}: {done} из {total}{percent !== null ? ` (${percent}%)` : ''}</span>
  </div>
}

function accessLine(learning: StudentLearning) {
  if (learning.freeze) return learning.freeze.until ? `Заморожен до ${formatDate(learning.freeze.until)}${learning.freeze.reason ? `, ${learning.freeze.reason}` : ''}. Войти не может.` : `Заморожен бессрочно${learning.freeze.reason ? `, ${learning.freeze.reason}` : ''}. Войти не может.`
  if (learning.accessUntil) return `Доступ открыт до ${formatDate(learning.accessUntil)}, потом плановая заморозка.`
  return 'Доступ без срока.'
}

/** Минуты по неделям - один ряд, одна ось; уроки и задачи - в подсказке и таблице, у них свой масштаб. */
function WeeklyChart({ weeks }: { weeks: WeekActivity[] }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(...weeks.map((week) => week.minutes))
  if (max === 0) return <p>За 12 недель занятий не было.</p>
  const hours = max >= 120
  const unit = hours ? 60 : 1
  const rawStep = max / unit / 3
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  // Шаг шкалы - целые минуты или целые часы: «0,5 мин» на оси ничего не говорит.
  const step = Math.max(1, [1, 2, 5, 10].map((factor) => factor * magnitude).find((value) => value >= rawStep) ?? 10 * magnitude) * unit
  const top = Math.ceil(max / step) * step
  const width = 600
  const height = 180
  const left = 44
  const bottom = 24
  const plot = height - bottom - 8
  const band = (width - left) / weeks.length
  const barWidth = Math.min(24, band - 8)
  const y = (value: number) => 8 + plot - (value / top) * plot
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step)
  const tick = (value: number) => hours ? `${value / 60} ч` : `${value} мин`
  const peak = weeks.findIndex((week) => week.minutes === max)
  const labelled = new Set([peak, weeks.length - 1])
  const describe = (week: WeekActivity) => `Неделя с ${weekDate(week.week, longDate)}: ${formatMinutes(week.minutes)}, уроков ${week.lessons}, задач ${week.tasks}`
  const current = active === null ? null : weeks[active]
  return <div className="student-analytics__chart">
    <p className="student-analytics__tooltip" aria-live="polite">{current ? describe(current) : 'Наведите на столбик или выберите его клавишей Tab, чтобы увидеть уроки и задачи недели.'}</p>
    <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`Время на платформе по неделям, больше всего ${formatMinutes(max)} в неделю с ${weekDate(weeks[peak].week, longDate)}`}>
      {ticks.map((value) => <g key={value}>
        <line x1={left} x2={width} y1={y(value)} y2={y(value)} className="student-analytics__grid" />
        <text x={left - 6} y={y(value) + 4} textAnchor="end" className="student-analytics__axis">{tick(value)}</text>
      </g>)}
      {weeks.map((week, index) => {
        const x = left + index * band + (band - barWidth) / 2
        const barTop = y(week.minutes)
        const barHeight = 8 + plot - barTop
        const radius = Math.min(4, barHeight)
        return <g key={week.week} tabIndex={0} role="img" aria-label={describe(week)} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} className="student-analytics__column" data-active={active === index}>
          <rect x={left + index * band} y={8} width={band} height={plot} fill="transparent" />
          {week.minutes > 0 && <path d={`M${x},${8 + plot} V${barTop + radius} Q${x},${barTop} ${x + radius},${barTop} H${x + barWidth - radius} Q${x + barWidth},${barTop} ${x + barWidth},${barTop + radius} V${8 + plot} Z`} className="student-analytics__mark" />}
          {labelled.has(index) && week.minutes > 0 && <text x={x + barWidth / 2} y={barTop - 6} textAnchor="middle" className="student-analytics__value">{formatMinutes(week.minutes)}</text>}
          <text x={left + index * band + band / 2} y={height - 6} textAnchor="middle" className="student-analytics__axis">{weekDate(week.week, shortDate)}</text>
        </g>
      })}
    </svg>
    <details><summary>Таблица по неделям</summary>
      <table className="student-analytics__table student-analytics__table--compact">
        <thead><tr><th scope="col">Неделя с</th><th scope="col">Время</th><th scope="col">Уроков</th><th scope="col">Задач</th></tr></thead>
        <tbody>{weeks.map((week) => <tr key={week.week}><th scope="row">{weekDate(week.week, longDate)}</th><td>{formatMinutes(week.minutes)}</td><td>{week.lessons}</td><td>{week.tasks}</td></tr>)}</tbody>
      </table>
    </details>
  </div>
}

export function StudentLearningBlocks({ studentId, learning }: { studentId: number; learning: StudentLearning }) {
  return <>
    <section className="student-analytics__section" aria-label="Доступ">
      <div className="student-analytics__section-header"><h2>Доступ</h2><Link href={`/admin/learning-access?user=${studentId}`}>Заморозить или разморозить</Link></div>
      <StudentBadges student={learning} />
      <p>{accessLine(learning)}</p>
      <p>{learning.lastActivityAt ? `Последняя активность ${formatDate(learning.lastActivityAt)}${learning.idleDays ? `, ${daysLabel(learning.idleDays)} назад` : ', сегодня'}.` : 'На платформе ещё не занимался.'}</p>
    </section>
    <section className="student-analytics__section" aria-label="Назначенное обучение">
      <h2>Назначенное обучение</h2>
      {learning.roadmaps.length === 0 && learning.courses.length === 0 && <p>Обучение не назначено. Откройте курсы на экране «Ученики и доступы».</p>}
      {learning.roadmaps.length > 0 && <ul className="student-analytics__learning">{learning.roadmaps.map((roadmap) => <li key={roadmap.id}>
        <h3><Link href={roadmap.href}>{roadmap.title}</Link></h3>
        <small>Открыто курсов: {roadmap.courses}, начато: {roadmap.started}</small>
        <Progress done={roadmap.lessonsDone} total={roadmap.lessonsTotal} label="Уроков пройдено" />
      </li>)}</ul>}
      {learning.courses.length > 0 && <><h3>Курсы в работе</h3><ul className="student-analytics__learning">{learning.courses.map((course) => <li key={course.id}>
        <h3><Link href={course.href}>{course.title}</Link>{!course.open && <small>Сейчас закрыт</small>}</h3>
        <Progress done={course.lessonsDone} total={course.lessonsTotal} label="Уроков" />
        <small>Время на курсе: {formatMinutes(course.minutes)}{course.lastActivityAt ? `, последняя активность ${formatDate(course.lastActivityAt)}` : ''}</small>
        {course.stoppedAt && <small>Остановился на уроке <Link href={course.stoppedAt.href}>{course.stoppedAt.title}</Link></small>}
      </li>)}</ul></>}
      {learning.notStarted > 0 && <p className="student-analytics__notice">Ещё не начаты: {learning.notStarted} из открытых курсов.</p>}
    </section>
    <section className="student-analytics__section" aria-label="Активность по неделям">
      <h2>Активность по неделям</h2>
      <p className="student-analytics__notice">Время считается по минутам, когда вкладка платформы открыта и видна. Это не точное время учёбы, но по нему видно, занимается ли ученик.</p>
      <WeeklyChart weeks={learning.weeks} />
    </section>
  </>
}

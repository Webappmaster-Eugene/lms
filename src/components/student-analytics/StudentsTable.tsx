'use client'

import { ANALYTICS_PERIODS, daysLabel, formatMinutes, INACTIVE_DAYS, type AnalyticsPeriod, type StudentFilter, type StudentRow, type StudentSort, type StudentsOverview } from '@/lib/learning-analytics'

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow' })
export const formatDate = (value: string) => dateFormat.format(new Date(value))

const FILTER_LABELS: Record<StudentFilter, string> = {
  all: 'Все',
  learning: 'Занимаются',
  inactive: `Нет активности ${INACTIVE_DAYS} дн.`,
  frozen: 'Заморожены',
  bootcamp: 'Буткемп',
}

export type StudentsQuery = { filter: StudentFilter; period: AnalyticsPeriod; search: string; showTest: boolean; sort: StudentSort; descending: boolean; page: number }

/** Отметки состояния ученика: одни и те же в таблице и в карточке. */
export function StudentBadges({ student }: { student: Pick<StudentRow, 'state' | 'freeze' | 'isTestStudent' | 'bootcamp' | 'idleDays'> }) {
  return <span className="student-analytics__badges">
    {student.freeze && <span data-tone="frozen">{student.freeze.until ? `Заморожен до ${formatDate(student.freeze.until)}` : 'Заморожен бессрочно'}</span>}
    {student.state === 'disabled' && <span data-tone="muted">Отключён</span>}
    {student.state === 'inactive' && <span data-tone="warning">{student.idleDays === null ? 'Не занимался' : `Нет активности ${daysLabel(student.idleDays)}`}</span>}
    {student.bootcamp && <span>Буткемп: {student.bootcamp}</span>}
    {student.isTestStudent && <span data-tone="muted">Тестовый</span>}
  </span>
}

function lastActivity(row: StudentRow) {
  if (!row.lastActivityAt) return <><span>Не занимался</span><small>учётка с {formatDate(row.createdAt)}</small></>
  return <><span>{formatDate(row.lastActivityAt)}</span><small>{row.idleDays === 0 ? 'сегодня' : `${daysLabel(row.idleDays ?? 0)} назад`}</small></>
}

function access(row: StudentRow) {
  if (row.freeze) return <span>заморожен</span>
  if (row.accessUntil) return <span>до {formatDate(row.accessUntil)}</span>
  return <span>без срока</span>
}

type Column = { sort: StudentSort; label: string; hint?: string }

export function StudentsTable({ data, query, loading, selected, onQuery, onSelect }: {
  data: StudentsOverview | null
  query: StudentsQuery
  loading: boolean
  selected: number | null
  onQuery: (next: Partial<StudentsQuery>) => void
  onSelect: (id: number) => void
}) {
  const period = `за ${daysLabel(query.period)}`
  const columns: Column[] = [
    { sort: 'name', label: 'Ученик' },
    { sort: 'activity', label: 'Последняя активность' },
    { sort: 'activeDays', label: 'Дней с занятиями', hint: period },
    { sort: 'minutes', label: 'Время', hint: period },
    { sort: 'lessons', label: 'Уроков', hint: period },
    { sort: 'tasks', label: 'Задач', hint: period },
    { sort: 'courses', label: 'Курсы', hint: 'в работе из открытых' },
    { sort: 'access', label: 'Доступ' },
    { sort: 'questions', label: 'Вопросы', hint: 'ждут ответа' },
  ]
  const sortBy = (sort: StudentSort) => onQuery(sort === query.sort ? { descending: !query.descending, page: 1 } : { sort, descending: sort !== 'name', page: 1 })
  return <section className="student-analytics__overview" aria-label="Список учеников">
    <div className="student-analytics__filters">
      <div role="group" aria-label="Кого показать" className="student-analytics__chips">
        {(Object.keys(FILTER_LABELS) as StudentFilter[]).map((filter) => <button key={filter} type="button" aria-pressed={query.filter === filter} onClick={() => onQuery({ filter, page: 1 })}>
          {FILTER_LABELS[filter]}{data ? <>{' '}<span className="student-analytics__count">{data.counts[filter]}</span></> : null}
        </button>)}
      </div>
      <div className="student-analytics__controls">
        <label>Период<select value={query.period} onChange={(event) => onQuery({ period: Number(event.target.value) as AnalyticsPeriod, page: 1 })}>
          {ANALYTICS_PERIODS.map((value) => <option key={value} value={value}>{daysLabel(value)}</option>)}
        </select></label>
        <label>Имя или email<input type="search" value={query.search} maxLength={100} onChange={(event) => onQuery({ search: event.target.value, page: 1 })} /></label>
        <label className="student-analytics__check"><input type="checkbox" checked={query.showTest} onChange={(event) => onQuery({ showTest: event.target.checked, page: 1 })} />Показать тестовых</label>
      </div>
    </div>
    {loading && <p role="status">Загружаем учеников…</p>}
    {data && <div className="student-analytics__table-wrap" role="region" aria-label="Таблица учеников" tabIndex={0}>
      <table className="student-analytics__table">
        <thead><tr>{columns.map((column) => <th key={column.sort} scope="col" aria-sort={query.sort === column.sort ? (query.descending ? 'descending' : 'ascending') : undefined}>
          <button type="button" onClick={() => sortBy(column.sort)}>{column.label}{query.sort === column.sort && <span aria-hidden="true">{query.descending ? ' ↓' : ' ↑'}</span>}</button>
          {column.hint && <small>{column.hint}</small>}
        </th>)}</tr></thead>
        <tbody>{data.docs.map((row) => <tr key={row.id} data-selected={row.id === selected}>
          <th scope="row"><button type="button" className="student-analytics__name" aria-pressed={row.id === selected} onClick={() => onSelect(row.id)}><strong>{row.title}</strong><small>{row.email}</small></button><StudentBadges student={row} /></th>
          <td>{lastActivity(row)}</td>
          <td>{row.period.activeDays}</td>
          <td>{formatMinutes(row.period.minutes)}</td>
          <td>{row.period.lessons}<small>всего {row.lessonsTotal}</small></td>
          <td>{row.period.tasks}</td>
          <td>{row.courses.started} из {row.courses.open}</td>
          <td>{access(row)}</td>
          <td>{row.waitingQuestions || '-'}</td>
        </tr>)}</tbody>
      </table>
      {data.docs.length === 0 && <p>Под эти условия ученики не подходят. Выберите другой фильтр или очистите поиск.</p>}
    </div>}
    {data && (data.page > 1 || data.hasNextPage) && <nav aria-label="Страницы списка учеников" className="student-analytics__pages">
      <button type="button" disabled={loading || data.page === 1} onClick={() => onQuery({ page: data.page - 1 })}>Назад</button>
      <span>Страница {data.page}</span>
      <button type="button" disabled={loading || !data.hasNextPage} onClick={() => onQuery({ page: data.page + 1 })}>Далее</button>
    </nav>}
  </section>
}

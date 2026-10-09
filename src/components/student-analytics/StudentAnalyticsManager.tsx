'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { AnalyticsTarget, StudentAnalyticsSnapshot, StudentEventDTO, StudentEventType, StudentSessionDTO } from '@/lib/student-analytics'
import { UserPerformanceSummary } from './UserPerformanceSummary'
import './student-analytics.scss'

type StudentOption = { id: number; title: string; email: string; isActive: boolean; role?: 'admin' | 'student' }
type StudentsPage = { docs: StudentOption[]; page: number; hasNextPage: boolean }
const endpoint = '/api/manage/student-analytics'
const emptyStudents: StudentsPage = { docs: [], page: 1, hasNextPage: false }
const eventLabels: Record<StudentEventType, string> = { login: 'Вход на платформу', logout: 'Выход из аккаунта', page_view: 'Открыта страница', lesson_view: 'Открыт урок', lesson_completed: 'Урок пройден', trainer_completed: 'Задача решена и проверена', achievement_unlocked: 'Получено достижение', certificate_issued: 'Выдан сертификат' }
const statusLabels: Record<StudentSessionDTO['status'], string> = { online: 'Активность за последние 5 минут', active: 'Вход сохранён', expired: 'Срок входа истёк', revoked: 'Вход завершён' }

async function responseData<T>(response: Response): Promise<T> {
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Не удалось загрузить данные. Повторите попытку')
  return data as T
}

function dateTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Нет данных'
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function videoTime(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null
  const whole = Math.floor(seconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor(whole % 3600 / 60)
  const remainder = whole % 60
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`
}

function Target({ target }: { target: AnalyticsTarget | null }) {
  if (!target) return null
  return target.href && /^\/(?:courses|lessons)\//.test(target.href) ? <Link href={target.href}>{target.title}</Link> : <span>{target.title}</span>
}

function Pages({ page, hasNextPage, loading, onPage, label }: { page: number; hasNextPage: boolean; loading: boolean; onPage: (page: number) => void; label: string }) {
  return <nav aria-label={label} className="student-analytics__pages"><button type="button" disabled={loading || page === 1} onClick={() => onPage(page - 1)}>Назад</button><span>Страница {page}</span><button type="button" disabled={loading || !hasNextPage} onClick={() => onPage(page + 1)}>Далее</button></nav>
}

function Session({ session }: { session: StudentSessionDTO }) {
  const geo = [session.geo.country, session.geo.region, session.geo.city].filter(Boolean).join(', ')
  const device = session.device === 'Не определено' ? 'Устройство не определено' : session.device
  return <li className="student-analytics__session"><div className="student-analytics__session-title"><div><h3>{device}</h3><small>{session.browser} · {session.os}</small></div><span className="student-analytics__status" data-online={session.status === 'online'}>{statusLabels[session.status]}</span></div>
    <dl className="student-analytics__device-details"><div><dt>Последняя активность</dt><dd>{dateTime(session.lastSeenAt)}</dd></div><div><dt>Срок входа</dt><dd>{dateTime(session.expiresAt)}</dd></div><div><dt>Начало входа</dt><dd>{dateTime(session.firstSeenAt)}</dd></div><div><dt>IP-адрес</dt><dd>{session.ip ?? 'Нет данных'}</dd></div><div><dt>Примерное местоположение</dt><dd>{geo || 'Не определено'}</dd></div><div><dt>Режим и часовой пояс</dt><dd>{session.standalone === null ? 'Режим не определён' : session.standalone ? 'Приложение' : 'Браузер'}{session.timezone ? `, ${session.timezone}` : ''}</dd></div>{session.lesson && <div><dt>Последний открытый урок</dt><dd><Target target={session.lesson} /></dd></div>}{session.course && <div><dt>Курс</dt><dd><Target target={session.course} /></dd></div>}{!session.lesson && session.path && <div><dt>Последняя открытая страница</dt><dd>{session.path}</dd></div>}</dl>
    {session.id === null && <p className="student-analytics__notice">Вход выполнен до начала сбора сведений об устройствах. Старые данные о браузере, IP и местоположении не восстанавливаются.</p>}
  </li>
}

function Event({ event }: { event: StudentEventDTO }) {
  const target = event.lesson ?? event.course
  return <li><time dateTime={event.at}>{dateTime(event.at)}</time><div><h3>{eventLabels[event.type]}</h3>{target && <p><Target target={target} /></p>}{event.title && event.title !== target?.title && <p>{event.title}</p>}{!target && !event.title && event.path && <p>{event.path}</p>}<span className="student-analytics__source">{event.source === 'server' ? 'Зафиксировано платформой' : 'Сообщено устройством'}</span></div></li>
}

export function StudentAnalyticsManager({ initialUserId = null }: { initialUserId?: number | null }) {
  const [search, setSearch] = useState('')
  const [studentsPage, setStudentsPage] = useState(1)
  const [students, setStudents] = useState({ key: '', data: emptyStudents })
  const [studentsError, setStudentsError] = useState('')
  const [userId, setUserId] = useState<number | null>(initialUserId)
  const [eventsPage, setEventsPage] = useState(1)
  const [sessionsPage, setSessionsPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [report, setReport] = useState<{ key: string; data: StudentAnalyticsSnapshot; loadedAt: string } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const searchKey = `${search}:${studentsPage}`
  const reportKey = `${userId}:${eventsPage}:${sessionsPage}:${reload}`
  const searchLoading = students.key !== searchKey
  const options = students.key === searchKey ? students.data : emptyStudents
  const current = report?.key === reportKey ? report : null
  const error = failure?.key === reportKey ? failure.message : null
  const loading = userId !== null && current === null && error === null
  useEffect(() => {
    const abort = new AbortController()
    const timer = window.setTimeout(async () => {
      const query = new URLSearchParams({ kind: 'students', search, page: String(studentsPage) })
      try {
        const data = await responseData<StudentsPage>(await fetch(`${endpoint}?${query}`, { signal: abort.signal, credentials: 'same-origin' }))
        if (!abort.signal.aborted) { setStudents({ key: searchKey, data }); setStudentsError('') }
      } catch (error) {
        if (!abort.signal.aborted) { setStudents({ key: searchKey, data: emptyStudents }); setStudentsError(error instanceof Error ? error.message : 'Не удалось найти пользователя') }
      }
    }, 180)
    return () => { abort.abort(); window.clearTimeout(timer) }
  }, [search, studentsPage, searchKey])
  useEffect(() => {
    if (!userId) return
    const abort = new AbortController()
    const query = new URLSearchParams({ user: String(userId), eventsPage: String(eventsPage), sessionsPage: String(sessionsPage) })
    fetch(`${endpoint}?${query}`, { signal: abort.signal, credentials: 'same-origin' }).then(responseData<StudentAnalyticsSnapshot>).then((data) => {
      if (abort.signal.aborted) return
      if (data.student.id !== userId) throw new Error('Данные пользователя не совпали. Повторите загрузку')
      setReport({ key: reportKey, data, loadedAt: new Date().toISOString() })
      setFailure(null)
    }).catch((error) => { if (!abort.signal.aborted) setFailure({ key: reportKey, message: error instanceof Error ? error.message : 'Не удалось загрузить активность' }) })
    return () => abort.abort()
  }, [userId, eventsPage, sessionsPage, reload, reportKey])
  const loadedKey = current?.key
  useEffect(() => {
    if (!userId || !loadedKey) return
    const timer = window.setInterval(() => { if (!document.hidden) setReload((value) => value + 1) }, 60_000)
    return () => window.clearInterval(timer)
  }, [userId, loadedKey])
  function selectStudent(id: number) { setUserId(id); setSessionsPage(1); setEventsPage(1) }
  const data = error === null && report?.data.student.id === userId ? report.data : null
  return <div className="student-analytics"><header><h1>Активность пользователей</h1><p>Посмотрите, с каких устройств пользователь входит, когда возвращается на платформу и какие результаты получает.</p></header>
    <div className="student-analytics__layout"><aside className="student-analytics__finder" aria-label="Выбор пользователя"><h2>Пользователь</h2><label>Имя или email<input type="search" value={search} maxLength={100} onChange={(event) => { setSearch(event.target.value); setStudentsPage(1) }} /></label>{searchLoading && <p role="status">Ищем пользователей…</p>}{studentsError && <p role="alert">{studentsError}</p>}<ul className="student-analytics__students">{options.docs.map((student) => <li key={student.id}><button type="button" aria-pressed={student.id === userId} onClick={() => selectStudent(student.id)}><strong>{student.title}</strong><small>{student.email}</small>{student.role === 'admin' && <small>Администратор</small>}</button></li>)}</ul>{!searchLoading && !studentsError && !options.docs.length && <p>Пользователи не найдены. Измените поисковый запрос.</p>}<Pages page={studentsPage} hasNextPage={options.hasNextPage} loading={searchLoading} onPage={setStudentsPage} label="Страницы списка пользователей" /></aside>
      <div className="student-analytics__report" aria-busy={loading}>{!userId && <p>Выберите пользователя, чтобы увидеть устройства и историю обучения.</p>}{loading && <p role="status">{data ? 'Обновляем сведения о пользователе…' : 'Загружаем активность пользователя…'}</p>}{error && <div className="student-analytics__error" role="alert"><p>{error}</p><button type="button" onClick={() => setReload(reload + 1)}>Повторить загрузку</button></div>}
        {data && <><div className="student-analytics__student-heading"><div><h2>{data.student.title}</h2><p>{data.student.email}</p>{data.student.role === 'admin' && <small>Администратор</small>}<small>Данные загружены: {dateTime(report?.loadedAt ?? null)}</small></div><div className="student-analytics__actions">{data.student.role !== 'admin' && <Link href={`/admin/learning-access?user=${data.student.id}`}>Назначить обучение</Link>}<Link href={`/admin/collections/users/${data.student.id}`}>Карточка пользователя</Link><button type="button" disabled={loading} onClick={() => setReload(reload + 1)}>Обновить</button></div></div>
          <dl className="student-analytics__summary"><div><dt>Уроков пройдено</dt><dd>{data.totals.completedLessons}</dd></div><div><dt>Задач проверено</dt><dd>{data.totals.verifiedTrainerTasks}</dd></div><div><dt>Баллы</dt><dd>{data.totals.points}</dd></div><div><dt>Достижения</dt><dd>{data.totals.achievements}</dd></div><div><dt>Сертификаты</dt><dd>{data.totals.certificates}</dd></div></dl>
          {data.performance && <UserPerformanceSummary data={data.performance} />}
          <section className="student-analytics__current" aria-label="Последнее место обучения"><h2>Последнее место обучения</h2>{data.resume ? <><h3><Target target={data.resume.lesson} /></h3>{data.resume.course && <p>Курс: <Target target={data.resume.course} /></p>}{videoTime(data.resume.seconds) !== null && <p>Позиция видео: <strong>{videoTime(data.resume.seconds)}</strong></p>}<p>Последнее открытие: {dateTime(data.resume.lastViewedAt)}</p></> : <p>Сохранённого места остановки пока нет.</p>}<small>Последняя активность устройства: {dateTime(data.lastActiveAt)}. Последнее действие в обучении: {dateTime(data.lastLearningAt)}.</small></section>
          <section className="student-analytics__section" aria-label="Устройства и входы"><div className="student-analytics__section-header"><h2>Устройства и входы</h2><span>{data.onlineSessionCount} с недавней активностью, {data.activeSessionCount} сохранённых входов</span></div><p className="student-analytics__notice">«Активность за последние 5 минут» означает недавний сигнал открытой вкладки. Сохранённый вход может действовать до 30 дней, когда пользователь уже закрыл сайт.</p>{data.sessions.docs.length ? <ul className="student-analytics__sessions">{data.sessions.docs.map((session, index) => <Session key={session.id ?? `legacy-${index}-${session.expiresAt}`} session={session} />)}</ul> : <p>Сведений о входах пока нет.</p>}<Pages page={data.sessions.page} hasNextPage={data.sessions.hasNextPage} loading={loading} onPage={setSessionsPage} label="Страницы устройств" /><details><summary>Как понимать местоположение</summary><p>Страна и регион определяются приблизительно по IP-адресу. VPN, мобильный оператор или корпоративная сеть могут показывать другое место.</p></details><p className="student-analytics__notice">Источник: <a href="https://db-ip.com/db/lite.php" target="_blank" rel="noopener noreferrer">DB-IP Lite</a>, данные по лицензии <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>.</p></section>
          <section className="student-analytics__section" aria-label="История пользователя"><h2>История пользователя</h2><p className="student-analytics__notice">Входы, прохождение, достижения и сертификаты фиксирует платформа. Открытие страницы сообщает устройство; это не подтверждает просмотр всего урока.</p>{data.events.docs.length ? <ol className="student-analytics__timeline">{data.events.docs.map((event) => <Event key={event.id} event={event} />)}</ol> : <p>Событий пока нет. История начнёт появляться после новых действий пользователя.</p>}<Pages page={data.events.page} hasNextPage={data.events.hasNextPage} loading={loading} onPage={setEventsPage} label="Страницы истории" /></section>
        </>}
      </div>
    </div>
  </div>
}

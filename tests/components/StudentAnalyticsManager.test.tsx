import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { StudentAnalyticsSnapshot } from '@/lib/student-analytics'
import type { StudentLearning, StudentRow, StudentsOverview } from '@/lib/learning-analytics'
import { StudentAnalyticsManager } from '@/components/student-analytics/StudentAnalyticsManager'

const snapshot: StudentAnalyticsSnapshot = {
  student: { id: 34, title: 'Александр Студент', email: 'alexander@example.test', isActive: true },
  activeSessionCount: 2, onlineSessionCount: 1, lastActiveAt: '2030-01-01T10:30:00Z', lastLearningAt: '2030-01-01T10:25:00Z',
  resume: { course: { id: 1, title: 'Node.js', href: '/courses/node' }, lesson: { id: 2, title: 'Express middleware', href: '/lessons/middleware' }, videoId: 'private-video-key', seconds: 754, lastViewedAt: '2030-01-01T10:25:00Z' },
  totals: { completedLessons: 7, verifiedTrainerTasks: 3, points: 120, achievements: 4, certificates: 1 },
  sessions: { docs: [{ id: 1, device: 'Телефон', browser: 'Яндекс Браузер', os: 'Android', firstSeenAt: '2030-01-01T09:00:00Z', lastSeenAt: '2030-01-01T10:30:00Z', expiresAt: '2030-01-31T09:00:00Z', status: 'online', ip: '192.0.2.4', geo: { countryCode: 'RU', country: 'Россия', region: null, city: null, source: 'local-mmdb', approximate: true }, timezone: 'Europe/Moscow', standalone: true, path: '/lessons/middleware', course: { id: 1, title: 'Node.js', href: '/courses/node' }, lesson: { id: 2, title: 'Express middleware', href: '/lessons/middleware' } }, { id: null, device: 'Не определено', browser: 'Не определено', os: 'Не определено', firstSeenAt: '', lastSeenAt: null, expiresAt: '2030-01-31T09:00:00Z', status: 'active', ip: null, geo: { countryCode: null, country: null, region: null, city: null, source: 'unknown', approximate: true }, timezone: null, standalone: null, path: null, course: null, lesson: null }], page: 1, totalDocs: 2, hasNextPage: false },
  events: { docs: [{ id: 1, type: 'lesson_completed', source: 'server', at: '2030-01-01T10:29:00Z', course: { id: 1, title: 'Node.js', href: '/courses/node' }, lesson: { id: 2, title: 'Express middleware', href: '/lessons/middleware' }, taskId: null, achievementId: null, certificateId: null, title: null, path: null }, { id: 2, type: 'page_view', source: 'observed', at: '2030-01-01T10:30:00Z', course: null, lesson: null, taskId: null, achievementId: null, certificateId: null, title: null, path: '/roadmaps' }], page: 1, totalDocs: 26, hasNextPage: true },
}
const row = (id: number, title: string, email: string, extra: Partial<StudentRow> = {}): StudentRow => ({
  id, title, email, createdAt: '2029-06-01T10:00:00.000Z', isTestStudent: false, state: 'learning', freeze: null, accessUntil: '2030-03-13T10:00:00.000Z', bootcamp: null,
  lastActivityAt: '2030-01-01T10:30:00.000Z', idleDays: 0, period: { activeDays: 5, minutes: 135, lessons: 4, tasks: 1 }, lessonsTotal: 7, courses: { open: 12, started: 2 }, waitingQuestions: 1, ...extra,
})
const overview: StudentsOverview = {
  period: 30, filter: 'all', counts: { all: 3, learning: 1, inactive: 1, frozen: 1, bootcamp: 0 }, page: 1, hasNextPage: false, totalDocs: 3,
  docs: [
    row(34, 'Александр Студент', 'alexander@example.test'),
    row(35, 'Другой ученик', 'other@example.test', { state: 'inactive', idleDays: 20, lastActivityAt: '2029-12-12T10:00:00.000Z', period: { activeDays: 0, minutes: 0, lessons: 0, tasks: 0 } }),
    row(36, 'Ушедший Ученик', 'gone@example.test', { state: 'frozen', freeze: { until: '2030-02-11T21:00:00.000Z', reason: 'отпуск' }, accessUntil: null }),
  ],
}
const learning: StudentLearning = {
  state: 'learning', isTestStudent: false, freeze: null, accessUntil: '2030-03-13T10:00:00.000Z', bootcamp: null, lastActivityAt: '2030-01-01T10:30:00.000Z', idleDays: 0,
  roadmaps: [{ id: 3, title: 'Backend Node.js', href: '/roadmaps/backend-nodejs', courses: 12, started: 2, lessonsDone: 7, lessonsTotal: 140 }, { id: 4, title: 'Frontend React', href: '/roadmaps/frontend-react', courses: 6, started: 1, lessonsDone: 3, lessonsTotal: 631 }],
  courses: [{ id: 1, title: 'Node.js', href: '/courses/node', open: true, lessonsDone: 7, lessonsTotal: 20, minutes: 135, lastActivityAt: '2030-01-01T10:30:00.000Z', stoppedAt: { title: 'Express middleware', href: '/lessons/middleware' } }],
  notStarted: 10,
  weeks: Array.from({ length: 12 }, (_, index) => ({ week: new Date(Date.UTC(2029, 9, 15 + index * 7)).toISOString().slice(0, 10), minutes: index === 11 ? 135 : index === 8 ? 300 : 0, lessons: index === 11 ? 4 : 0, tasks: index === 11 ? 1 : 0 })),
}
let failed = false
let delaySecondPage: Promise<void> | null = null
const fetchMock = vi.fn(async (raw: string | URL | Request) => {
  const url = new URL(String(raw), 'http://localhost')
  if (url.searchParams.get('kind') === 'students') return Response.json({ ...overview, page: Number(url.searchParams.get('page') ?? 1) })
  if (failed) return Response.json({ error: 'Требуется авторизация' }, { status: 401 })
  if (url.searchParams.get('eventsPage') === '2') {
    if (delaySecondPage) await delaySecondPage
    return Response.json({ ...snapshot, events: { docs: [{ ...snapshot.events.docs[0], id: 27, type: 'login', lesson: null, course: null }], page: 2, totalDocs: 26, hasNextPage: false } })
  }
  return Response.json(Number(url.searchParams.get('user')) === 35 ? { ...snapshot, student: { ...snapshot.student, id: 35, title: 'Другой ученик', email: 'other@example.test' }, resume: null, events: { docs: [], page: 1, totalDocs: 0, hasNextPage: false }, sessions: { docs: [], page: 1, totalDocs: 0, hasNextPage: false } } : snapshot)
})

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear(); failed = false; delaySecondPage = null })

describe('аналитика ученика для администратора', () => {
  it('показывает настоящий прогресс, позицию и отдельные значения входа/онлайн', async () => {
    render(<StudentAnalyticsManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    expect(screen.getByText('12:34')).toBeInTheDocument()
    expect(screen.getByText('1 с недавней активностью, 2 сохранённых входов')).toBeInTheDocument()
    expect(screen.getByText('Активность за последние 5 минут', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('Вход сохранён', { exact: true })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Назначить обучение' })).toHaveAttribute('href', '/admin/learning-access?user=34')
    expect(screen.queryByText('private-video-key')).not.toBeInTheDocument()
  })

  it('показывает неизвестные старые устройства честно и указывает источник IP-географии', async () => {
    render(<StudentAnalyticsManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Устройство не определено' })
    expect(screen.getByText(/Вход выполнен до начала сбора/)).toBeInTheDocument()
    expect(screen.getByText('Не определено', { exact: true })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'DB-IP Lite' })).toHaveAttribute('href', 'https://db-ip.com/db/lite.php')
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toBeInTheDocument()
  })

  it('различает серверный результат и сообщённую устройством активность', async () => {
    render(<StudentAnalyticsManager initialUserId={34} />)
    const timeline = await screen.findByRole('region', { name: 'История пользователя' })
    expect(within(timeline).getByText('Зафиксировано платформой')).toBeInTheDocument()
    expect(within(timeline).getByText('Сообщено устройством')).toBeInTheDocument()
    expect(within(timeline).getByText('Урок пройден')).toBeInTheDocument()
  })

  it('при перелистывании не теряет сфокусированную кнопку и не показывает чужую карточку', async () => {
    let release: (() => void) | undefined
    delaySecondPage = new Promise((resolve) => { release = resolve })
    const user = userEvent.setup()
    render(<StudentAnalyticsManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    const pages = screen.getByRole('navigation', { name: 'Страницы истории' })
    const next = within(pages).getByRole('button', { name: 'Далее' })
    await user.click(next)
    expect(next).toHaveFocus()
    expect(next).toBeDisabled()
    expect(screen.getByRole('heading', { name: 'Александр Студент' })).toBeInTheDocument()
    release?.()
    await within(pages).findByText('Страница 2')
    expect(next).toHaveFocus()
    expect(screen.getByText('Вход на платформу')).toBeInTheDocument()
  })

  it('смена ученика сбрасывает страницы и старые сведения', async () => {
    const user = userEvent.setup()
    render(<StudentAnalyticsManager initialUserId={34} />)
    await screen.findByRole('button', { name: /Другой ученик/ })
    await user.click(screen.getByRole('button', { name: /Другой ученик/ }))
    await screen.findByRole('heading', { name: 'Другой ученик' })
    expect(screen.queryByText('12:34')).not.toBeInTheDocument()
    expect(screen.getByText('Сохранённого места остановки пока нет.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Карточка пользователя' })).toHaveAttribute('href', '/admin/collections/users/35')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('user=35&eventsPage=1&sessionsPage=1'), expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('при истёкшей авторизации показывает понятную ошибку и повторную загрузку', async () => {
    failed = true
    const user = userEvent.setup()
    render(<StudentAnalyticsManager initialUserId={34} />)
    await screen.findByRole('alert')
    expect(screen.queryByRole('heading', { name: 'Александр Студент' })).not.toBeInTheDocument()
    failed = false
    await user.click(screen.getByRole('button', { name: 'Повторить загрузку' }))
    await screen.findByRole('heading', { name: 'Александр Студент' })
  })

  it('не раскрывает данные, если API вернул другого ученика', async () => {
    fetchMock.mockImplementationOnce(async () => Response.json({ ...snapshot, student: { ...snapshot.student, id: 999, title: 'Чужие данные' } }))
    render(<StudentAnalyticsManager initialUserId={34} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Данные пользователя не совпали'))
    expect(screen.queryByText('Чужие данные')).not.toBeInTheDocument()
  })

  it('скрывает ранее загруженные IP и карточку, если авторизация истекла при обновлении', async () => {
    const user = userEvent.setup()
    render(<StudentAnalyticsManager initialUserId={34} />)
    await screen.findByText('192.0.2.4')
    failed = true
    await user.click(screen.getByRole('button', { name: 'Обновить' }))
    await screen.findByRole('alert')
    expect(screen.queryByText('192.0.2.4')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Александр Студент' })).not.toBeInTheDocument()
  })

  it('после ошибки и выбора другого пользователя возвращается к успешно загруженной карточке', async () => {
    failed = true
    const user = userEvent.setup()
    render(<StudentAnalyticsManager initialUserId={34} />)
    await screen.findByRole('alert')
    await screen.findByRole('button', { name: /Другой ученик/ })
    failed = false
    await user.click(screen.getByRole('button', { name: /Другой ученик/ }))
    await screen.findByRole('heading', { name: 'Другой ученик' })
    await user.click(screen.getByRole('button', { name: /Александр Студент/ }))
    await screen.findByRole('heading', { name: 'Александр Студент' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('обновляет текущую карточку раз в минуту только при открытой вкладке', async () => {
    vi.useFakeTimers()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const view = render(<StudentAnalyticsManager initialUserId={34} />)
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(200) })
      const before = fetchMock.mock.calls.filter(([url]) => !String(url).includes('kind=students')).length
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes('kind=students'))).toHaveLength(before + 1)
      hidden.mockReturnValue(true)
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes('kind=students'))).toHaveLength(before + 1)
    } finally { view.unmount(); hidden.mockRestore(); vi.useRealTimers() }
  })

  it('показывает сессии администратора и не предлагает назначать ему обучение', async () => {
    fetchMock.mockImplementationOnce(async () => Response.json({ ...snapshot, student: { ...snapshot.student, title: 'Евгений Администратор', role: 'admin' }, performance: { windowDays: 30, metrics: [{ name: 'LCP', sampleCount: 0, p75: null }] } }))
    render(<StudentAnalyticsManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Евгений Администратор' })
    expect(screen.getByText('Администратор', { exact: true })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Назначить обучение' })).not.toBeInTheDocument()
    expect(screen.getByText('Активность за последние 5 минут', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('Скорость сайта у пользователя за 30 дней')).toBeInTheDocument()
  })

  it('ошибка загрузки списка видна над таблицей и не мешает карточке', async () => {
    vi.stubGlobal('fetch', vi.fn(async (raw: string | URL | Request) => new URL(String(raw), 'http://localhost').searchParams.get('kind') === 'students'
      ? Response.json({ error: 'Список временно недоступен' }, { status: 503 })
      : fetchMock(raw)))
    render(<StudentAnalyticsManager initialUserId={34} />)
    expect(await screen.findByText('Список временно недоступен')).toHaveAttribute('role', 'alert')
    expect(screen.queryByRole('region', { name: 'Таблица учеников' })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Александр Студент' })).toBeInTheDocument()
  })

  // Прокси перед приложением отвечает на 502/504 не JSON: фразу интерфейса не должна подменять ошибка парсера.
  it('ответ не в JSON (502 от прокси) показывается понятной фразой', async () => {
    vi.stubGlobal('fetch', vi.fn(async (raw: string | URL | Request) => new URL(String(raw), 'http://localhost').searchParams.has('user')
      ? new Response('<html>502 Bad Gateway</html>', { status: 502 })
      : fetchMock(raw)))
    render(<StudentAnalyticsManager initialUserId={34} />)
    const alert = await screen.findByText((_, element) => element?.getAttribute('role') === 'alert' && Boolean(element.closest('#student-analytics-report')))
    expect(alert).toHaveTextContent('Не удалось загрузить данные. Повторите попытку')
  })

  it('таблица показывает состояние учеников: заморозку, пропавших и счётчики фильтров', async () => {
    render(<StudentAnalyticsManager />)
    const table = await screen.findByRole('region', { name: 'Таблица учеников' })
    expect(within(table).getByText('Заморожен до 12.02.2030')).toBeInTheDocument()
    expect(within(table).getByText('Нет активности 20 дней')).toBeInTheDocument()
    const first = within(table).getByRole('row', { name: /Александр Студент/ })
    expect(within(first).getByText('2 ч 15 мин')).toBeInTheDocument()
    expect(within(first).getByText('2 из 12')).toBeInTheDocument()
    expect(within(first).getByText('до 13.03.2030')).toBeInTheDocument()
    expect(within(within(table).getByRole('row', { name: /Ушедший Ученик/ })).getByText('заморожен')).toBeInTheDocument()
    const filters = screen.getByRole('group', { name: 'Кого показать' })
    expect(within(filters).getByRole('button', { name: /Нет активности 14 дн\. 1/ })).toBeInTheDocument()
  })

  it('фильтр, период, сортировка и «показать тестовых» уходят в запрос списка', async () => {
    const user = userEvent.setup()
    render(<StudentAnalyticsManager initialFilter="inactive" />)
    await screen.findByRole('region', { name: 'Таблица учеников' })
    const lastList = () => new URL(String(fetchMock.mock.calls.filter(([url]) => String(url).includes('kind=students')).at(-1)?.[0]), 'http://localhost').searchParams
    expect(lastList().get('filter')).toBe('inactive')
    await user.click(within(screen.getByRole('group', { name: 'Кого показать' })).getByRole('button', { name: /Заморожены/ }))
    await waitFor(() => expect(lastList().get('filter')).toBe('frozen'))
    await user.selectOptions(screen.getByLabelText('Период'), '7')
    await waitFor(() => expect(lastList().get('period')).toBe('7'))
    await user.click(screen.getByRole('button', { name: 'Время' }))
    await waitFor(() => expect(lastList().get('sort')).toBe('minutes'))
    expect(lastList().get('dir')).toBe('desc')
    await user.click(screen.getByRole('button', { name: /Время/ }))
    await waitFor(() => expect(lastList().get('dir')).toBe('asc'))
    await user.click(screen.getByLabelText('Показать тестовых'))
    await waitFor(() => expect(lastList().get('test')).toBe('1'))
  })

  it('карточка ученика показывает доступ, назначенное обучение и активность по неделям', async () => {
    fetchMock.mockImplementation(async (raw: string | URL | Request) => {
      const url = new URL(String(raw), 'http://localhost')
      if (url.searchParams.get('kind') === 'students') return Response.json(overview)
      return Response.json({ ...snapshot, learning })
    })
    try {
      render(<StudentAnalyticsManager initialUserId={34} />)
      const accessBlock = await screen.findByRole('region', { name: 'Доступ' })
      expect(within(accessBlock).getByText('Доступ открыт до 13.03.2030, потом плановая заморозка.')).toBeInTheDocument()
      expect(within(accessBlock).getByRole('link', { name: 'Заморозить или разморозить' })).toHaveAttribute('href', '/admin/learning-access?user=34')
      const assigned = screen.getByRole('region', { name: 'Назначенное обучение' })
      expect(within(assigned).getByText('Уроков пройдено: 7 из 140 (5%)')).toBeInTheDocument()
      // 3 из 631 при округлении давали «0%» и пустую полоску, будто ученик не начинал.
      const tiny = within(assigned).getByText('Уроков пройдено: 3 из 631 (меньше 1%)').closest('.student-analytics__progress')
      expect(tiny?.querySelector<HTMLElement>('.student-analytics__bar > span')?.style.minWidth).toBe('4px')
      expect(within(assigned).getByRole('link', { name: 'Express middleware' })).toHaveAttribute('href', '/lessons/middleware')
      expect(within(assigned).getByText('Ещё не начаты: 10 из открытых курсов.')).toBeInTheDocument()
      const weeks = screen.getByRole('region', { name: 'Активность по неделям' })
      expect(within(weeks).getByRole('group', { name: /больше всего 5 ч в неделю/ })).toBeInTheDocument()
      const column = within(weeks).getAllByRole('img').find((element) => element.getAttribute('aria-label')?.includes('уроков 4'))
      expect(column).toBeDefined()
      act(() => { column?.focus() })
      expect(within(weeks).getByText(/2 ч 15 мин, уроков 4, задач 1/, { selector: 'p' })).toBeInTheDocument()
    } finally {
      fetchMock.mockReset()
    }
  })
})

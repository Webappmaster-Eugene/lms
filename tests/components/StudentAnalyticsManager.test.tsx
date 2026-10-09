import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { StudentAnalyticsSnapshot } from '@/lib/student-analytics'
import { StudentAnalyticsManager } from '@/components/student-analytics/StudentAnalyticsManager'

const snapshot: StudentAnalyticsSnapshot = {
  student: { id: 34, title: 'Александр Студент', email: 'alexander@example.test', isActive: true },
  activeSessionCount: 2, onlineSessionCount: 1, lastActiveAt: '2030-01-01T10:30:00Z', lastLearningAt: '2030-01-01T10:25:00Z',
  resume: { course: { id: 1, title: 'Node.js', href: '/courses/node' }, lesson: { id: 2, title: 'Express middleware', href: '/lessons/middleware' }, videoId: 'private-video-key', seconds: 754, lastViewedAt: '2030-01-01T10:25:00Z' },
  totals: { completedLessons: 7, verifiedTrainerTasks: 3, points: 120, achievements: 4, certificates: 1 },
  sessions: { docs: [{ id: 1, device: 'Телефон', browser: 'Яндекс Браузер', os: 'Android', firstSeenAt: '2030-01-01T09:00:00Z', lastSeenAt: '2030-01-01T10:30:00Z', expiresAt: '2030-01-31T09:00:00Z', status: 'online', ip: '192.0.2.4', geo: { countryCode: 'RU', country: 'Россия', region: null, city: null, source: 'local-mmdb', approximate: true }, timezone: 'Europe/Moscow', standalone: true, path: '/lessons/middleware', course: { id: 1, title: 'Node.js', href: '/courses/node' }, lesson: { id: 2, title: 'Express middleware', href: '/lessons/middleware' } }, { id: null, device: 'Не определено', browser: 'Не определено', os: 'Не определено', firstSeenAt: '', lastSeenAt: null, expiresAt: '2030-01-31T09:00:00Z', status: 'active', ip: null, geo: { countryCode: null, country: null, region: null, city: null, source: 'unknown', approximate: true }, timezone: null, standalone: null, path: null, course: null, lesson: null }], page: 1, totalDocs: 2, hasNextPage: false },
  events: { docs: [{ id: 1, type: 'lesson_completed', source: 'server', at: '2030-01-01T10:29:00Z', course: { id: 1, title: 'Node.js', href: '/courses/node' }, lesson: { id: 2, title: 'Express middleware', href: '/lessons/middleware' }, taskId: null, achievementId: null, certificateId: null, title: null, path: null }, { id: 2, type: 'page_view', source: 'observed', at: '2030-01-01T10:30:00Z', course: null, lesson: null, taskId: null, achievementId: null, certificateId: null, title: null, path: '/roadmaps' }], page: 1, totalDocs: 26, hasNextPage: true },
}
let failed = false
let delaySecondPage: Promise<void> | null = null
const fetchMock = vi.fn(async (raw: string | URL | Request) => {
  const url = new URL(String(raw), 'http://localhost')
  if (url.searchParams.get('kind') === 'students') return Response.json({ docs: [{ id: 34, title: 'Александр Студент', email: 'alexander@example.test', isActive: true }, { id: 35, title: 'Другой ученик', email: 'other@example.test', isActive: true }], page: Number(url.searchParams.get('page') ?? 1), hasNextPage: false })
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
})

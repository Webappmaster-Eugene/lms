import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BootcampProgressManager } from '@/components/bootcamp/BootcampProgressManager'
import type { BootcampProgressReport, WeekCell } from '@/lib/bootcamp-progress'

const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()
const cell = (week: number, extra: Partial<WeekCell> = {}): WeekCell => ({ week, state: 'none', since: null, mrUrl: null, overdue: false, dueAt: null, late: false, checks: null, ...extra })
const weeks = (cells: WeekCell[]) => Array.from({ length: 20 }, (_, index) => cells.find((item) => item.week === index + 1) ?? cell(index + 1))

const report: BootcampProgressReport = {
  streams: [{ id: 1, title: 'Поток 1, февраль 2027' }, { id: 2, title: 'Поток 2, май 2027' }],
  stream: { id: 1, title: 'Поток 1, февраль 2027', program: 'nodejs', startsAt: '2027-02-12T21:00:00.000Z', gitlabGroup: 'nodejs-bootcamp' },
  summary: { students: 2, onPlan: 1, lagOne: 1, lagMore: 0, waitingReview: 1, overdueReview: 1, medianReviewHours: 30 },
  students: [
    {
      enrollmentId: 1, userId: 171, title: 'Иван Петров', gitlabUsername: 'ivan', projectUrl: 'https://git.test/nodejs-bootcamp/ivan', isTest: false, frozen: false,
      lastGitlabAt: ago(1), lastLmsAt: ago(2), manuals: { done: 12, total: 40 }, planned: 3, accepted: 1, lag: 2,
      weeks: weeks([
        cell(1, { state: 'accepted', since: ago(9), mrUrl: 'https://git.test/mr/1', dueAt: ago(8), checks: '26 из 26' }),
        cell(2, { state: 'review', since: ago(4), mrUrl: 'https://git.test/mr/2', dueAt: ago(1), late: true, overdue: true, checks: '24 из 24' }),
        cell(3, { dueAt: ago(0.5), late: true }),
        cell(4, { state: 'ci-failed', mrUrl: 'https://git.test/mr/4', dueAt: ago(-6) }),
      ]),
    },
    {
      enrollmentId: 2, userId: 194, title: 'Анна Смирнова', gitlabUsername: 'anna', projectUrl: null, isTest: false, frozen: true,
      lastGitlabAt: null, lastLmsAt: null, manuals: null, planned: 3, accepted: 3, lag: 0, weeks: weeks([]),
    },
  ],
}
const fetchMock = vi.fn(async (_url: string | URL | Request) => Response.json(report))

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear() })

describe('учёба буткемпа', () => {
  it('сводка потока и матрица недель: принята, ждёт ревью дольше срока, просрочена без сдачи', async () => {
    render(<BootcampProgressManager />)
    expect(await screen.findByLabelText('Итоги потока')).toHaveTextContent('Ревью дольше 3 дней1')
    expect(screen.getByLabelText('Итоги потока')).toHaveTextContent('Медиана ревью30 ч')
    const matrix = screen.getByRole('region', { name: 'Недели учеников' })
    const ivan = within(matrix).getByRole('row', { name: /Иван Петров/ })
    expect(within(ivan).getByRole('link', { name: /^Неделя 1: принята, слита .*, проверок 26 из 26/ })).toHaveAttribute('href', 'https://git.test/mr/1')
    const review = within(ivan).getByRole('link', { name: /^Неделя 2: ждёт ревью, ждёт 4 дня, .*срок прошёл, ревью дольше 3 дней$/ })
    expect(review).toHaveTextContent('4 дн')
    expect(review.closest('td')).toHaveAttribute('data-overdue', 'true')
    expect(within(ivan).getByRole('img', { name: /^Неделя 3: не начата, срок .*, срок прошёл$/ })).toHaveTextContent('!')
    expect(within(ivan).getByRole('link', { name: /^Неделя 4: CI упал/ })).toHaveTextContent('CI')
    expect(within(ivan).getByRole('link', { name: 'Карточка ученика' })).toHaveAttribute('href', '/admin/student-analytics?user=171')
    expect(within(ivan).getByText('12 из 40')).toBeInTheDocument()
    const anna = within(matrix).getByRole('row', { name: /Анна Смирнова/ })
    expect(within(anna).getByText('Заморожен')).toBeInTheDocument()
    expect(within(anna).getByText('anna')).not.toHaveAttribute('href')
  })

  it('поток и тестовые уходят в запрос', async () => {
    const user = userEvent.setup()
    render(<BootcampProgressManager />)
    await screen.findByRole('region', { name: 'Недели учеников' })
    await user.selectOptions(screen.getByLabelText('Поток'), '2')
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('stream=2'))
    await user.click(screen.getByLabelText('Показать тестовых'))
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toMatch(/stream=2&test=1/))
  })

  it('без потоков подсказывает, где его завести; ошибка видна', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ streams: [], stream: null, summary: report.summary, students: [] })))
    const { unmount } = render(<BootcampProgressManager />)
    expect(await screen.findByText(/Потоков пока нет/)).toBeInTheDocument()
    unmount()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ streams: report.streams, stream: null, summary: report.summary, students: [] })))
    const stale = render(<BootcampProgressManager initialStream={999} />)
    expect(await screen.findByText('Такого потока нет: возможно, его удалили. Выберите поток в списке.')).toBeInTheDocument()
    expect(screen.getByLabelText('Поток')).toHaveValue('')
    stale.unmount()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Не удалось загрузить учёбу буткемпа' }, { status: 500 })))
    render(<BootcampProgressManager />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить учёбу буткемпа')
  })
})

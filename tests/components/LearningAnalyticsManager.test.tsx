import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { LearningAnalyticsManager } from '@/components/learning-analytics/LearningAnalyticsManager'
import type { CourseDetail, CoursesOverview } from '@/lib/learning-analytics'

const overview: CoursesOverview = {
  period: 30, roadmap: null, students: 6,
  roadmaps: [{ id: 3, title: 'Backend Node.js', href: '/roadmaps/backend-nodejs', courses: 15, lessons: 600, access: 2, started: 2, completed: 0, medianProgress: 12, period: { minutes: 420, active: 2 } }],
  courses: [{ id: 7, title: 'Node.js с нуля', href: '/courses/node', roadmap: 'Backend Node.js', lessons: 40, access: 2, started: 2, completed: 0, medianProgress: 30, period: { minutes: 380, lessons: 9, active: 2 }, questions: 3, stuckAt: { title: 'Event loop', href: '/lessons/event-loop', students: 2 } }],
  unopened: Array.from({ length: 32 }, (_, index) => ({ id: 100 + index, title: `Курс ${index + 1}`, href: `/courses/c${index}`, access: 1 })),
}
const detail: CourseDetail = {
  id: 7, title: 'Node.js с нуля', href: '/courses/node', started: 2,
  lessons: [
    { id: 1, title: 'Введение', href: '/lessons/intro', position: 1, completed: 2, viewed: 2, videoEnded: 2, questions: 0, notes: 1, drop: false },
    { id: 2, title: 'Event loop', href: '/lessons/event-loop', position: 2, completed: 0, viewed: 2, videoEnded: 1, questions: 3, notes: 0, drop: true },
  ],
}
const fetchMock = vi.fn(async (raw: string | URL | Request) => {
  const url = new URL(String(raw), 'http://localhost')
  return Response.json(url.searchParams.has('course') ? detail : overview)
})

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear() })

describe('аналитика курсов и роадмапов', () => {
  it('показывает роадмапы, курсы в работе и урок, на котором стоят', async () => {
    render(<LearningAnalyticsManager />)
    const roadmaps = await screen.findByRole('region', { name: 'Таблица роадмапов' })
    expect(within(roadmaps).getByRole('row', { name: /Backend Node\.js/ })).toHaveTextContent('12%')
    const courses = screen.getByRole('region', { name: 'Таблица курсов' })
    const row = within(courses).getByRole('row', { name: /Node\.js с нуля/ })
    expect(within(row).getByRole('link', { name: 'Event loop' })).toHaveAttribute('href', '/lessons/event-loop')
    expect(within(row).getByText('6 ч 20 мин')).toBeInTheDocument()
    const unopened = screen.getByRole('region', { name: 'Открыты, но никто не начал' })
    expect(within(unopened).getByText('Ещё 2')).toBeInTheDocument()
  })

  it('роадмап и период уходят в запрос, курс открывается по урокам', async () => {
    const user = userEvent.setup()
    render(<LearningAnalyticsManager />)
    await screen.findByRole('region', { name: 'Таблица курсов' })
    await user.selectOptions(screen.getByLabelText('Роадмап'), '3')
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('roadmap=3'))
    await user.selectOptions(screen.getByLabelText('Период'), '90')
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('period=90'))
    await user.click(await screen.findByRole('button', { name: /Node\.js с нуля/ }))
    const lessons = await screen.findByRole('region', { name: 'Уроки курса' })
    expect(within(lessons).getByText('Здесь больше всего учеников перестают проходить')).toBeInTheDocument()
    expect(within(within(lessons).getByRole('row', { name: /Введение/ })).getByText('2 из 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('region', { name: 'Уроки курса' })).not.toBeInTheDocument()
  })

  it('ошибка загрузки видна, а не выдаётся за пустую таблицу', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Не удалось загрузить аналитику курсов' }, { status: 500 })))
    render(<LearningAnalyticsManager />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить аналитику курсов')
    expect(screen.queryByRole('region', { name: 'Таблица курсов' })).not.toBeInTheDocument()
  })
})

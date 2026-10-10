import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { LearningHistoryList, RecentLearningCourses } from '@/components/learning/LearningHistory'
import type { LearningHistoryEntry } from '@/lib/learning-history'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const entries: LearningHistoryEntry[] = [
  { lessonId: 1, title: 'Замыкания', courseId: 10, course: 'JavaScript', courseSlug: 'js', href: '/lessons/closures?video=clip#video-clip', lastViewedAt: '2026-10-10T12:00:00Z', videoTitle: 'Практика', seconds: 754, ended: false, isCompleted: false },
  { lessonId: 2, title: 'Docker Compose', courseId: 20, course: 'DevOps', courseSlug: 'devops', href: '/lessons/docker', lastViewedAt: '2026-10-09T12:00:00Z', isCompleted: true },
]

describe('навигация по истории обучения', () => {
  it('каждый курс имеет отдельное место остановки и свою историю', () => {
    render(<RecentLearningCourses entries={entries} />)
    expect(screen.getByRole('link', { name: /JavaScript.*Замыкания.*12:34/ })).toHaveAttribute('href', entries[0].href)
    expect(screen.getByRole('link', { name: /DevOps.*Docker Compose/ })).toHaveAttribute('href', entries[1].href)
    expect(screen.getAllByRole('link', { name: 'Все просмотры этого курса' }).map(link => link.getAttribute('href'))).toEqual(['/learning-history?course=10', '/learning-history?course=20'])
    expect(screen.getByRole('link', { name: 'История обучения' })).toHaveAttribute('href', '/learning-history')
  })

  it('просмотр и завершение показаны как разные состояния', () => {
    render(<LearningHistoryList entries={entries} />)
    const rows = within(screen.getByRole('list', { name: 'Просмотренные уроки' })).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Урок открыт')
    expect(rows[0]).not.toHaveTextContent('Урок пройден')
    expect(rows[1]).toHaveTextContent('Урок пройден')
    expect(within(rows[0]).getByRole('link', { name: /Замыкания/ })).toHaveAttribute('href', entries[0].href)
  })

  it('досмотренное видео не предлагает продолжение с последней секунды', () => {
    render(<LearningHistoryList entries={[{ ...entries[0], ended: true }]} />)
    expect(screen.getByText(/Видео досмотрено/)).toBeVisible()
    expect(screen.queryByText(/Остановились на/)).not.toBeInTheDocument()
  })

  it('пустой список курсов не создаёт неработающие ссылки продолжения', () => {
    const { container } = render(<RecentLearningCourses entries={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

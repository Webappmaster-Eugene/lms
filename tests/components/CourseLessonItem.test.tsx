import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const { CourseLessonItem } = await import('@/components/course/CourseLessonItem')
const lesson = { slug: 'node-events', title: 'События Node.js', estimatedMinutes: 25 }

describe('доступ к уроку в программе курса', () => {
  it('неназначенный урок виден без ссылки и метки следующего шага', () => {
    render(<CourseLessonItem lesson={lesson} isCompleted={false} isNext accessAllowed={false} />)
    expect(screen.getByText(lesson.title)).toBeInTheDocument()
    expect(screen.getByText('Доступ к этому уроку не назначен')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText('Следующий')).not.toBeInTheDocument()
  })

  it('назначенный урок доступен с клавиатуры и отмечен следующим', () => {
    render(<CourseLessonItem lesson={lesson} isCompleted={false} isNext accessAllowed />)
    const link = screen.getByRole('link', { name: /События Node.js/ })
    expect(link).toHaveAttribute('href', '/lessons/node-events')
    expect(link).toHaveAttribute('aria-current', 'step')
    link.focus()
    expect(link).toHaveFocus()
  })
})

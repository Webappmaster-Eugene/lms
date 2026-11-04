import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CoursesEmptyState } from '@/components/course/CoursesEmptyState'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

describe('пустой каталог курсов', () => {
  it('ученика буткемпа ведёт в раздел буткемпа, а не говорит, что курсов нет', () => {
    render(<CoursesEmptyState hasBootcamp />)

    const section = screen.getByRole('region', { name: 'Курсов вне буткемпа пока нет' })
    expect(section).toHaveTextContent('Ваш буткемп - в отдельном разделе')
    expect(screen.getByRole('link', { name: 'Открыть буткемп' })).toHaveAttribute('href', '/bootcamp')
    expect(screen.queryByText('Курсы вам пока не назначены')).not.toBeInTheDocument()
  })

  it('без буткемпа объясняет, что курсы откроет ментор', () => {
    render(<CoursesEmptyState hasBootcamp={false} />)

    expect(screen.getByRole('region', { name: 'Курсы вам пока не назначены' })).toHaveTextContent('Доступ выдаёт ментор')
    expect(screen.queryByRole('link', { name: 'Открыть буткемп' })).not.toBeInTheDocument()
  })
})

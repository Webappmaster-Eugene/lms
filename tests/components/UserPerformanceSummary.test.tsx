import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UserPerformanceSummary } from '@/components/student-analytics/UserPerformanceSummary'

describe('производительность по реальным наблюдениям пользователя', () => {
  it('показывает единицы и количество, оставляя малую выборку без рейтинга', () => {
    render(<UserPerformanceSummary data={{ windowDays: 30, metrics: [{ name: 'LCP', p75: 2500, sampleCount: 4 }, { name: 'INP', p75: 180, sampleCount: 9 }, { name: 'CLS', p75: 0, sampleCount: 14 }] }} />)
    expect(screen.getByText('2,5 с')).toBeInTheDocument()
    expect(screen.getByText('180 мс')).toBeInTheDocument()
    expect(screen.getByText('0', { exact: true })).toBeInTheDocument()
    expect(screen.getAllByText('Наблюдений пока мало; выводы делать рано.')).toHaveLength(3)
    expect(screen.queryByText('Хорошо', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Описание Core Web Vitals' })).toHaveAttribute('href', 'https://web.dev/articles/vitals')
  })
  it('отсутствующие данные не превращает в нулевые быстрые результаты', () => {
    render(<UserPerformanceSummary data={{ windowDays: 30, metrics: [{ name: 'LCP', p75: null, sampleCount: 0 }, { name: 'INP', p75: null, sampleCount: 0 }, { name: 'CLS', p75: null, sampleCount: 0 }] }} />)
    expect(screen.getAllByText('Нет данных')).toHaveLength(3)
    expect(screen.queryByText('0', { exact: true })).not.toBeInTheDocument()
    expect(screen.getAllByText(/Замеры появятся/)).toHaveLength(3)
  })
})

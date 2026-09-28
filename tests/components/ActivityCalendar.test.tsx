import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ActivityCalendar } from '@/components/profile/ActivityCalendar'
import { activityGrid, countByDay } from '@/lib/activity'

const now = new Date('2026-09-28T15:00:00Z')

describe('календарь занятий', () => {
  it('итог периода озвучивается одной подписью', () => {
    const grid = activityGrid(countByDay(['2026-09-21T10:00:00Z', '2026-09-22T10:00:00Z'], ['2026-09-22T11:00:00Z']), now)
    render(<ActivityCalendar grid={grid} />)

    expect(screen.getByRole('img', { name: /Календарь занятий\. 2 активных дня: 2 урока, 1 задача/ })).toBeInTheDocument()
  })

  it('у дня с занятиями подсказка с датой и составом', () => {
    const grid = activityGrid(countByDay(['2026-09-22T10:00:00Z'], ['2026-09-22T11:00:00Z']), now)
    const { container } = render(<ActivityCalendar grid={grid} />)

    const cell = container.querySelector('[title^="22 сентября"]')
    expect(cell).toHaveAttribute('title', '22 сентября: 1 урок, 1 задача')
    expect(cell).toHaveAttribute('data-level', '2')
  })

  it('17 недель по 7 дней, будущие дни без подсказки', () => {
    const { container } = render(<ActivityCalendar grid={activityGrid(new Map(), now)} />)

    expect(container.querySelectorAll('[data-level]')).toHaveLength(17 * 7)
    expect(container.querySelectorAll('[data-level]:not([title])')).toHaveLength(6)
  })

  it('без занятий говорит об этом прямо', () => {
    render(<ActivityCalendar grid={activityGrid(new Map(), now)} />)

    expect(screen.getByText('За последние месяцы занятий пока не было')).toBeInTheDocument()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const { CourseCatalog, courseStatus, filterCourses } = await import('@/components/course/CourseCatalog')
import type { CatalogCourse } from '@/components/course/CourseCatalog'

/** Каталог из полусотни курсов: ученик должен быстро найти свои начатые и курсы своего роадмапа. */

function course(id: string, overrides: Partial<CatalogCourse> = {}): CatalogCourse {
  return {
    id,
    title: `Курс ${id}`,
    slug: `c-${id}`,
    estimatedHours: 0,
    roadmapTitle: 'Frontend',
    totalLessons: 4,
    completedCount: 0,
    progressPercent: 0,
    ...overrides,
  }
}

const courses = [
  course('1', { title: 'React', completedCount: 2 }),
  course('2', { title: 'TypeScript', completedCount: 4 }),
  course('3', { title: 'NestJS', roadmapTitle: 'Backend' }),
]

describe('статус курса', () => {
  it('пройден, в процессе, не начат', () => {
    expect(courses.map(courseStatus)).toEqual(['active', 'done', 'new'])
  })

  it('курс без уроков не считается пройденным', () => {
    expect(courseStatus(course('x', { totalLessons: 0 }))).toBe('new')
  })
})

describe('фильтр каталога', () => {
  it('по роадмапу, статусу и названию вместе', () => {
    expect(filterCourses(courses, { roadmap: 'Frontend', status: 'all', query: '' }).map((c) => c.id)).toEqual(['1', '2'])
    expect(filterCourses(courses, { roadmap: null, status: 'active', query: '' }).map((c) => c.id)).toEqual(['1'])
    expect(filterCourses(courses, { roadmap: null, status: 'all', query: 'nest' }).map((c) => c.id)).toEqual(['3'])
  })
})

describe('каталог', () => {
  it('фильтр «В процессе» оставляет начатые курсы', async () => {
    render(<CourseCatalog courses={courses} />)

    await userEvent.click(screen.getByRole('button', { name: /В процессе/ }))

    expect(screen.getByRole('link', { name: /React/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /NestJS/ })).not.toBeInTheDocument()
    expect(screen.getByText('1 курс')).toBeInTheDocument()
  })

  it('фильтр по роадмапу', async () => {
    render(<CourseCatalog courses={courses} />)

    await userEvent.click(screen.getByRole('button', { name: 'Backend' }))

    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('поиск без результата подсказывает сбросить фильтры', async () => {
    render(<CourseCatalog courses={courses} />)

    await userEvent.type(screen.getByRole('searchbox', { name: /Найти курс/ }), 'кобол')

    expect(screen.getByText(/попробуйте сбросить фильтры/)).toBeInTheDocument()
  })
})

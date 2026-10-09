import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', async () => (await import('../helpers/url-navigation')).urlNavigationMock())

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const { CourseCatalog, courseStatus, filterCourses } = await import('@/components/course/CourseCatalog')
import { navigationRouter, navigationURL, setNavigationURL } from '../helpers/url-navigation'

beforeEach(() => setNavigationURL('/courses'))

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
  it('показывает программу закрытого курса и количество назначенных уроков', () => {
    render(<CourseCatalog courses={[course('closed', { accessAllowed: false }), course('partial', { accessAllowed: true, accessibleLessons: 1 })]} />)
    expect(screen.getByRole('link', { name: /Курс closed/ })).toHaveAttribute('href', '/courses/c-closed')
    expect(screen.getByText('Доступ не назначен · Посмотреть программу')).toBeInTheDocument()
    expect(screen.getByText('Доступно 1 из 4 уроков')).toBeInTheDocument()
  })

  it('по фильтру назначений оставляет полный и частичный доступ', async () => {
    render(<CourseCatalog courses={[course('closed', { accessAllowed: false }), course('partial', { accessAllowed: true, accessibleLessons: 1 }), course('full', { accessAllowed: true })]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Назначенные мне' }))
    expect(screen.queryByRole('link', { name: /Курс closed/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Весь каталог' }))
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })
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

    expect(await screen.findByText(/попробуйте сбросить фильтры/)).toBeInTheDocument()
  })

  it('восстанавливает фильтры из прямой ссылки и возвращает их при переходе назад', async () => {
    setNavigationURL('/courses?roadmap=Backend&q=nest&assigned=1&sort=title&keep=ok')
    render(<CourseCatalog courses={courses} />)
    expect(screen.getByRole('searchbox')).toHaveValue('nest')
    expect(screen.getByRole('link', { name: /NestJS/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /React/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Frontend' }))
    expect(navigationURL()).toContain('keep=ok')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    act(() => navigationRouter().back())
    expect(screen.getByRole('link', { name: /NestJS/ })).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('nest')
  })

  it('страница и сортировка восстанавливаются; фильтр сбрасывает страницу', async () => {
    const many = Array.from({ length: 50 }, (_, index) => course(String(index + 1), { title: `Курс ${String(index + 1).padStart(2, '0')}` }))
    setNavigationURL('/courses?page=2&sort=title')
    const view = render(<CourseCatalog courses={many} />)
    expect(screen.getByText('2 из 3')).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(24)
    expect(screen.getByRole('link', { name: /Курс 25/ })).toBeInTheDocument()
    view.unmount()
    render(<CourseCatalog courses={many} />)
    expect(screen.getByText('2 из 3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Не начатые/ }))
    await waitFor(() => expect(navigationURL()).not.toContain('page='))
    expect(screen.getByText('1 из 3')).toBeInTheDocument()
  })
})

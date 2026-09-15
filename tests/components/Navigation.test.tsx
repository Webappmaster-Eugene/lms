import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { createElement, type FunctionComponent } from 'react'
import userEvent from '@testing-library/user-event'

const pathname = { current: '/' }
const push = vi.fn()
const setMobileOpen = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push, refresh: vi.fn() }),
}))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
vi.mock('@xyflow/react', async () => (await import('../helpers/component-mocks')).xyflowMock())
vi.mock('@/components/layout/SidebarContext', () => ({
  useSidebar: () => ({ mobileOpen: false, setMobileOpen, toggleMobile: vi.fn() }),
}))

const { Sidebar } = await import('@/components/layout/Sidebar')
const { CourseSidebar } = await import('@/components/course/CourseSidebar')
const { RoadmapGraph } = await import('@/components/roadmap/RoadmapGraph')

/** Навигация: боковое меню платформы, оглавление курса и карта навыков. */

describe('боковое меню', () => {
  /** Меню рендерится дважды — для мобильной и настольной ширины. */
  const desktop = () => screen.getAllByRole('navigation').at(-1) as HTMLElement

  beforeEach(() => {
    vi.clearAllMocks()
    pathname.current = '/'
    global.fetch = vi.fn(async () => Response.json({ user: { role: 'student' } })) as unknown as typeof fetch
  })

  it('содержит основные разделы платформы', async () => {
    render(<Sidebar />)

    for (const label of ['Дашборд', 'Курсы', 'Роадмапы', 'Тренажёр', 'Лидерборд']) {
      expect(within(desktop()).getByRole('link', { name: new RegExp(label) })).toBeInTheDocument()
    }
  })

  it('текущий раздел подсвечен', () => {
    pathname.current = '/courses'
    render(<Sidebar />)

    expect(within(desktop()).getByRole('link', { name: /Курсы/ }).className).toContain('bg-')
  })

  it('дашборд подсвечивается только на главной', () => {
    pathname.current = '/courses'
    render(<Sidebar />)

    const dashboard = within(desktop()).getByRole('link', { name: /Дашборд/ })
    const courses = within(desktop()).getByRole('link', { name: /Курсы/ })
    expect(dashboard.className).not.toBe(courses.className)
  })

  it('обычному ученику админских пунктов не видно', async () => {
    render(<Sidebar />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: /Импорт из YD/ })).not.toBeInTheDocument()
  })

  it('администратору показываются служебные пункты', async () => {
    global.fetch = vi.fn(async () => Response.json({ user: { role: 'admin' } })) as unknown as typeof fetch

    render(<Sidebar />)

    await waitFor(() =>
      expect(within(desktop()).getByRole('link', { name: /Импорт из YD/ })).toBeInTheDocument(),
    )
  })

  it('сбой проверки роли не добавляет админских пунктов', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('сеть недоступна')
    }) as unknown as typeof fetch

    render(<Sidebar />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: /Импорт из YD/ })).not.toBeInTheDocument()
  })

  it('выход завершает сессию на сервере', async () => {
    const user = userEvent.setup()
    render(<Sidebar />)

    await user.click(screen.getAllByRole('button', { name: /Выйти/ })[0])

    await waitFor(() => {
      const logout = vi
        .mocked(global.fetch)
        .mock.calls.find(([url]) => String(url).includes('/api/users/logout'))
      expect(logout?.[1]).toMatchObject({ method: 'POST' })
    })
  })
})

describe('оглавление курса', () => {
  const sections = [
    {
      id: 's1',
      title: 'Webpack и введение',
      order: 1,
      lessons: [
        { id: 'l1', title: 'Как устроена сборка', slug: 'build', order: 1 },
        { id: 'l2', title: 'Конфигурация', slug: 'config', order: 2 },
      ],
    },
    {
      id: 's2',
      title: 'Работа с данными',
      order: 2,
      lessons: [{ id: 'l3', title: 'Json server', slug: 'json-server', order: 1 }],
    },
  ]

  const props = {
    courseTitle: 'Глубокий React',
    sections,
    completedLessonIds: new Set(['l1']),
    totalLessons: 3,
    totalCompleted: 1,
  }

  it('показывает название курса и разделы', () => {
    render(<CourseSidebar {...props} />)

    expect(screen.getByText('Глубокий React')).toBeInTheDocument()
    expect(screen.getByText('Webpack и введение')).toBeInTheDocument()
  })

  it('разделы свёрнуты, пока в них нет текущего урока', () => {
    render(<CourseSidebar {...props} />)

    expect(screen.queryByRole('link', { name: /Как устроена сборка/ })).not.toBeInTheDocument()
  })

  it('раздел с текущим уроком раскрыт сразу', () => {
    render(<CourseSidebar {...props} currentLessonId="l1" />)

    expect(screen.getAllByRole('link', { name: /Как устроена сборка/ })[0]).toHaveAttribute(
      'href',
      '/lessons/build',
    )
  })

  it('раздел раскрывается по клику', async () => {
    const user = userEvent.setup()
    render(<CourseSidebar {...props} />)

    await user.click(screen.getAllByText('Webpack и введение')[0])

    expect(screen.getAllByRole('link', { name: /Как устроена сборка/ })[0]).toBeInTheDocument()
  })

  it('общий прогресс курса виден', () => {
    render(<CourseSidebar {...props} />)

    expect(screen.getAllByText(/1\s*\/\s*3|1 из 3/).length).toBeGreaterThan(0)
  })

  it('пройденный урок отличается от непройденного', () => {
    render(<CourseSidebar {...props} currentLessonId="l1" />)

    const done = screen.getAllByRole('link', { name: /Как устроена сборка/ })[0]
    const todo = screen.getAllByRole('link', { name: /Конфигурация/ })[0]
    expect(done.className).not.toBe(todo.className)
  })

  it('текущий урок выделен — иначе в длинном курсе теряешься', () => {
    render(<CourseSidebar {...props} currentLessonId="l2" />)

    const current = screen.getAllByRole('link', { name: /Конфигурация/ })[0]
    const sibling = screen.getAllByRole('link', { name: /Как устроена сборка/ })[0]
    expect(current.className).not.toBe(sibling.className)
  })

  it('курс без разделов не ломает страницу урока', () => {
    render(<CourseSidebar {...props} sections={[]} totalLessons={0} totalCompleted={0} />)

    expect(screen.getByText('Глубокий React')).toBeInTheDocument()
  })
})

describe('карта навыков', () => {
  const graph = {
    nodes: [
      {
        id: 'n1',
        type: 'topic',
        position: { x: 0, y: 0 },
        data: {
          label: 'Глубокий React',
          nodeType: 'topic',
          courseSlug: 'deep-react',
          courses: [],
          icon: null,
          description: null,
          status: 'available',
          comingSoon: false,
          progressPercent: 0,
          totalLessons: 0,
          completedLessons: 0,
          stage: null,
          color: null,
          bullets: [],
        },
      },
    ],
    edges: [],
  }

  beforeEach(() => vi.clearAllMocks())

  it('узлы попадают в граф', () => {
    render(createElement(RoadmapGraph as FunctionComponent<Record<string, unknown>>, graph))

    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-node-count', '1')
  })

  it('узел рисуется компонентом своего типа', () => {
    render(createElement(RoadmapGraph as FunctionComponent<Record<string, unknown>>, graph))

    expect(screen.getByTestId('flow-node')).toHaveAttribute('data-node-type', 'topic')
    expect(screen.getByText('Глубокий React')).toBeInTheDocument()
  })

  it('пустая карта не падает', () => {
    render(
      createElement(RoadmapGraph as FunctionComponent<Record<string, unknown>>, {
        nodes: [],
        edges: [],
      }),
    )

    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-node-count', '0')
  })
})

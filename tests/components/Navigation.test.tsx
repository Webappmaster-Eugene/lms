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
const { RoadmapEditorNavLink } = await import('@/components/roadmap-editor/NavLink')

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

  it('обычному ученику админских пунктов не видно', () => {
    render(<Sidebar isAdmin={false} />)

    expect(screen.queryByText('Управление')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Редактор роадмапов' })).not.toBeInTheDocument()
    expect(screen.queryByText('Учебный контент')).not.toBeInTheDocument()
  })

  it('администратор сразу видит вход в панель, редактор и управление учениками', () => {
    render(<Sidebar isAdmin />)

    const menu = within(desktop())
    expect(menu.getByRole('link', { name: 'CMS и настройки' })).toHaveAttribute('href', '/admin')
    expect(menu.getByRole('link', { name: 'Учебный контент' })).toHaveAttribute('href', '/manage')
    expect(menu.getByRole('link', { name: 'Редактор роадмапов' })).toHaveAttribute('href', '/admin/roadmap-editor')
    expect(menu.getByRole('link', { name: 'Ученики и администраторы' })).toHaveAttribute('href', '/admin/collections/users')
    expect(menu.getByRole('link', { name: 'Вопросы учеников' })).toHaveAttribute('href', '/admin/questions')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('без подтверждённой роли не добавляет админские пункты', () => {
    render(<Sidebar />)

    expect(screen.queryByRole('link', { name: 'Редактор роадмапов' })).not.toBeInTheDocument()
  })

  it('группы меню дают доступ к контенту, тренажёру, прогрессу и настройкам', async () => {
    const user = userEvent.setup()
    render(<Sidebar isAdmin />)
    const menu = within(desktop())

    for (const label of ['Настройки контента в CMS', 'Управление тренажёром', 'Прогресс и награды', 'Общение и настройки']) {
      await user.click(menu.getByText(label))
    }

    for (const [label, href] of [
      ['Курсы', '/admin/collections/courses'],
      ['Уроки', '/admin/collections/lessons'],
      ['Импорт из Яндекс.Диска', '/admin/import-yandex'],
      ['Задачи тренажёра', '/admin/collections/trainer-tasks'],
      ['Прогресс по урокам', '/admin/collections/user-progress'],
      ['Настройки платформы', '/admin/globals/site-settings'],
    ]) {
      expect(menu.getAllByRole('link', { name: label }).some((link) => link.getAttribute('href') === href)).toBe(true)
    }
  })

  it('выделяет редактор выбранной карты, а не всю панель управления', () => {
    pathname.current = '/admin/roadmap-editor/7'
    render(<Sidebar isAdmin />)

    const menu = within(desktop())
    expect(menu.getByRole('link', { name: 'Редактор роадмапов' })).toHaveAttribute('aria-current', 'page')
    expect(menu.getByRole('link', { name: 'CMS и настройки' })).not.toHaveAttribute('aria-current')
  })

  it('закрывает мобильное меню после выбора редактора', async () => {
    const user = userEvent.setup()
    render(<Sidebar isAdmin />)

    await user.click(screen.getAllByRole('link', { name: 'Редактор роадмапов' })[0])

    expect(setMobileOpen).toHaveBeenCalledWith(false)
  })

  it('автоматически раскрывает группу текущего административного раздела', () => {
    pathname.current = '/admin/collections/lessons/12'
    render(<Sidebar isAdmin />)

    expect(within(desktop()).getByText('Настройки контента в CMS').closest('details')).toHaveAttribute('open')
    expect(within(desktop()).getByRole('link', { name: 'Уроки' })).toHaveAttribute('aria-current', 'page')
  })

  it('в админке доступны рабочие разделы и возврат на платформу', () => {
    pathname.current = '/admin/roadmap-editor/7'
    render(<RoadmapEditorNavLink />)

    expect(screen.getByRole('link', { name: 'Редактор роадмапов' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Вопросы учеников' })).toHaveAttribute('href', '/admin/questions')
    expect(screen.getByRole('link', { name: 'Импорт из Яндекс.Диска' })).toHaveAttribute('href', '/admin/import-yandex')
    expect(screen.getByRole('link', { name: 'Открыть платформу' })).toHaveAttribute('href', '/')
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

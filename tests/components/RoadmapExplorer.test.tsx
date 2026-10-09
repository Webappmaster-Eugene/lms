import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', async () => (await import('../helpers/url-navigation')).urlNavigationMock())

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
vi.mock('@xyflow/react', async () => (await import('../helpers/component-mocks')).xyflowMock())

const { flowSetCenter } = await import('../helpers/component-mocks')
const { RoadmapGraph } = await import('@/components/roadmap/RoadmapGraph')
const { RoadmapNodePanel } = await import('@/components/roadmap/RoadmapNodePanel')
const { RoadmapTopicList, groupTopicsByStage } = await import('@/components/roadmap/RoadmapTopicList')
const { RoadmapExplorer } = await import('@/components/roadmap/RoadmapExplorer')

import { navigationRouter, navigationURL, setNavigationURL } from '../helpers/url-navigation'

import type { GraphNode, NodeCourse, RoadmapNodeData } from '@/components/roadmap/types'

/**
 * Роадмап — главный маршрут ученика. Проверяется то, ради чего он есть:
 * из темы видно все её курсы, понятно, с какого урока продолжить и что
 * закрывает доступ, а карта и список показывают одно и то же.
 */

function course(overrides: Partial<NodeCourse> = {}): NodeCourse {
  return {
    slug: 'react-basics',
    title: 'Основы React',
    totalLessons: 10,
    completedLessons: 3,
    nextLesson: { slug: 'react-state', title: 'Состояние компонента' },
    blockedBy: [],
    ...overrides,
  }
}

function data(overrides: Partial<RoadmapNodeData> = {}): RoadmapNodeData {
  return {
    label: 'React',
    nodeType: 'topic',
    courseSlug: 'react-basics',
    courses: [course()],
    icon: null,
    description: null,
    status: 'in-progress',
    comingSoon: false,
    progressPercent: 30,
    totalLessons: 10,
    completedLessons: 3,
    stage: 'stage1',
    color: null,
    bullets: [],
    isNextStep: false,
    ...overrides,
  }
}

function node(id: string, overrides: Partial<RoadmapNodeData> = {}, position = { x: 0, y: 0 }): GraphNode {
  return { id, type: overrides.nodeType ?? 'topic', position, data: data(overrides) }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  setNavigationURL('/roadmaps/frontend')
})

describe('панель темы', () => {
  it('добавляет курс по ID документа темы, а не по строковому ID графа', async () => {
    render(<RoadmapTopicList nodes={[node('semantic-react-node', { managementNodeId: 91 })]} looseCourses={[]} managementRoadmapId={7} />)
    await userEvent.click(screen.getByText('React').closest('summary') as HTMLElement)
    expect(screen.getByRole('link', { name: 'Добавить курс в тему' })).toHaveAttribute('href', '/manage/courses/new?roadmap=7&node=91')
    expect(screen.getByRole('link', { name: 'Управлять курсами темы' })).toHaveAttribute('href', '/manage/roadmaps/7?node=91')
  })

  it('не показывает управление темой ученику', async () => {
    render(<RoadmapTopicList nodes={[node('semantic-react-node', { managementNodeId: 91 })]} looseCourses={[]} />)
    await userEvent.click(screen.getByText('React').closest('summary') as HTMLElement)
    expect(screen.queryByRole('link', { name: 'Добавить курс в тему' })).not.toBeInTheDocument()
  })

  it('ведёт в следующий урок, а не просто в курс', () => {
    render(<RoadmapNodePanel data={data()} onClose={vi.fn()} />)

    const link = screen.getByRole('link', { name: /Продолжить: Состояние компонента/ })
    expect(link).toHaveAttribute('href', '/lessons/react-state')
  })

  it('непройденный курс предлагает начать', () => {
    render(<RoadmapNodePanel data={data({ courses: [course({ completedLessons: 0 })] })} onClose={vi.fn()} />)

    expect(screen.getByRole('link', { name: /Начать: Состояние компонента/ })).toBeInTheDocument()
  })

  it('показывает все курсы темы, а не только первый', () => {
    render(
      <RoadmapNodePanel
        data={data({ courses: [course(), course({ slug: 'react-hooks', title: 'Хуки React' })] })}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Курсы темы (2)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Хуки React' })).toHaveAttribute('href', '/courses/react-hooks')
  })

  it('рекомендует пререквизиты без запрета назначенного урока', () => {
    render(
      <RoadmapNodePanel
        data={data({ status: 'locked', courses: [course({ blockedBy: ['Основы JS', 'TypeScript'] })] })}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Рекомендуем сначала пройти курсы: Основы JS, TypeScript')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Продолжить/ })).toBeInTheDocument()
  })

  it('сохраняет программу неназначенного курса без ссылки на урок', () => {
    render(<RoadmapNodePanel data={data({ courses: [course({ accessAllowed: false })] })} onClose={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Основы React' })).toHaveAttribute('href', '/courses/react-basics')
    expect(screen.getByText(/Доступ к обучению не назначен/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Продолжить/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'React' })).toHaveFocus()
  })

  it('назначение отдельных уроков не сокращает общее число уроков', () => {
    render(<RoadmapNodePanel data={data({ courses: [course({ accessAllowed: true, accessibleLessons: 2 })] })} onClose={vi.fn()} />)
    expect(screen.getByText('Доступно 2 из 10 уроков')).toBeInTheDocument()
    expect(screen.getByText('3/10')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Продолжить/ })).toHaveAttribute('href', '/lessons/react-state')
  })

  it('закрывается по Escape и кнопке', async () => {
    const onClose = vi.fn()
    render(<RoadmapNodePanel data={data()} onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть панель темы' }))

    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('фокус переходит в панель', () => {
    render(<RoadmapNodePanel data={data()} onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'React' })).toHaveFocus()
  })
})

describe('карта', () => {
  const nodes = [
    node('react', { label: 'React' }),
    node('ts', { label: 'TypeScript', courses: [course({ slug: 'ts', title: 'Типы в TypeScript' })], isNextStep: true }),
  ]

  it('клик по теме открывает панель вместо перехода', async () => {
    render(<RoadmapGraph nodes={nodes} edges={[]} />)

    await userEvent.click(screen.getAllByTestId('flow-node')[0])

    expect(screen.getByRole('complementary', { name: 'Тема «React»' })).toBeInTheDocument()
  })

  it('поиск находит тему по названию курса и открывает её', async () => {
    render(<RoadmapGraph nodes={nodes} edges={[]} />)

    await userEvent.type(screen.getByRole('combobox', { name: /Найти тему/ }), 'типы{Enter}')

    expect(screen.getByRole('complementary', { name: 'Тема «TypeScript»' })).toBeInTheDocument()
    expect(flowSetCenter).toHaveBeenCalled()
  })

  it('поиск без результата сообщает об этом', async () => {
    render(<RoadmapGraph nodes={nodes} edges={[]} />)

    await userEvent.type(screen.getByRole('combobox', { name: /Найти тему/ }), 'кобол{Enter}')

    expect(screen.getByRole('status')).toHaveTextContent('Ничего не нашлось')
  })

  it('«К моему шагу» открывает тему следующего шага', async () => {
    render(<RoadmapGraph nodes={nodes} edges={[]} nextStepNodeId="ts" />)

    await userEvent.click(screen.getByRole('button', { name: 'К моему шагу' }))

    expect(screen.getByRole('complementary', { name: 'Тема «TypeScript»' })).toBeInTheDocument()
  })

  it('без следующего шага кнопки нет', () => {
    render(<RoadmapGraph nodes={nodes} edges={[]} />)

    expect(screen.queryByRole('button', { name: 'К моему шагу' })).not.toBeInTheDocument()
  })
})

describe('список по этапам', () => {
  it('этапы идут в порядке обучения, темы — сверху вниз', () => {
    const groups = groupTopicsByStage([
      node('late', { label: 'Практика', stage: 'practice' }),
      node('b', { label: 'Второй', stage: 'stage1' }, { x: 0, y: 200 }),
      node('a', { label: 'Первый', stage: 'stage1' }, { x: 0, y: 100 }),
      node('cat', { label: 'Категория', nodeType: 'category', stage: 'stage1' }),
      node('x', { label: 'Без этапа', stage: null }),
    ])

    expect(groups.map((g) => g.title)).toEqual([
      'Стажёр: основа',
      'Middle: практика и подготовка к собеседованиям',
      'Другие темы',
    ])
    expect(groups[0].nodes.map((n) => n.data.label)).toEqual(['Первый', 'Второй'])
  })

  it('тема следующего шага раскрыта и помечена', () => {
    render(<RoadmapTopicList nodes={[node('ts', { label: 'TypeScript', isNextStep: true })]} looseCourses={[]} />)

    expect(screen.getByText('Следующий шаг')).toBeInTheDocument()
    expect(screen.getByText('TypeScript').closest('details')).toHaveAttribute('open')
  })

  it('курсы вне карты не теряются', () => {
    render(<RoadmapTopicList nodes={[node('a')]} looseCourses={[course({ slug: 'git', title: 'Git' })]} />)

    const section = screen.getByText('Курсы вне карты').closest('section') as HTMLElement
    expect(within(section).getByRole('link', { name: 'Git' })).toBeInTheDocument()
  })
})

describe('переключение вида', () => {
  const nodes = [node('react', { label: 'React' })]

  it('выбор вида запоминается', async () => {
    render(<RoadmapExplorer nodes={nodes} edges={[]} looseCourses={[]} nextStepNodeId={null} />)

    await userEvent.click(screen.getByRole('tab', { name: /Список по этапам/ }))

    expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument()
    expect(navigationURL()).toContain('view=list')
  })

  it('вид из ссылки важнее прежнего выбора устройства', () => {
    window.localStorage.setItem('roadmap-view', 'map')
    setNavigationURL('/roadmaps/frontend?view=list')
    render(<RoadmapExplorer nodes={nodes} edges={[]} looseCourses={[]} nextStepNodeId={null} />)

    expect(screen.getByRole('tab', { name: /Список по этапам/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('без карты показывает список курсов без переключателя', () => {
    render(<RoadmapExplorer nodes={[]} edges={[]} looseCourses={[course()]} nextStepNodeId={null} />)

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByText('Курсы роадмапа')).toBeInTheDocument()
  })

  it('прямая ссылка раскрывает тему; назад восстанавливает список и тему', async () => {
    setNavigationURL('/roadmaps/frontend?view=list&topic=react&q=hooks')
    const view = render(<RoadmapExplorer nodes={nodes} edges={[]} looseCourses={[]} nextStepNodeId={null} />)
    expect(screen.getByText('React').closest('details')).toHaveAttribute('open')
    await userEvent.click(screen.getByRole('tab', { name: 'Карта' }))
    expect(screen.getByRole('complementary', { name: 'Тема «React»' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Найти тему или курс на карте' })).toHaveValue('hooks')
    act(() => navigationRouter().back())
    expect(screen.getByRole('tab', { name: 'Список по этапам' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('React').closest('details')).toHaveAttribute('open')
    view.unmount()
    render(<RoadmapExplorer nodes={nodes} edges={[]} looseCourses={[]} nextStepNodeId={null} />)
    expect(screen.getByText('React').closest('details')).toHaveAttribute('open')
  })
})

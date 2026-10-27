import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement, type FunctionComponent } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', async () => (await import('../helpers/url-navigation')).urlNavigationMock())
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
vi.mock('@xyflow/react', async () => (await import('../helpers/component-mocks')).xyflowMock())

const { NodeExtraList } = await import('@/components/roadmap/NodeExtraList')
const { RoadmapNodePanel } = await import('@/components/roadmap/RoadmapNodePanel')
const { RoadmapTopicList } = await import('@/components/roadmap/RoadmapTopicList')
const { RoadmapTopicNode } = await import('@/components/roadmap/RoadmapTopicNode')
const { RoadmapGraph } = await import('@/components/roadmap/RoadmapGraph')

import { routeHistoryThroughNavigation, setNavigationURL } from '../helpers/url-navigation'
import type { GraphNode, NodeCourse, NodeExtra, RoadmapNodeData } from '@/components/roadmap/types'

/**
 * Гайды и буткемпы в теме карты. Закрытые видны с замком, а не пропадают: ученик должен знать,
 * что материал есть и что доступ к нему выдаётся отдельно. В прогресс темы они не входят.
 */

function extra(overrides: Partial<NodeExtra> = {}): NodeExtra {
  return { key: 'guide-1', kind: 'guide', title: 'LinkedIn', href: '/guides/linkedin', accessAllowed: true, read: false, ...overrides }
}

const bootcamp = extra({ key: 'bootcamp-9', kind: 'bootcamp', title: 'Буткемп Node.js', href: '/bootcamp?locked=1', accessAllowed: false })
const readGuide = extra({ key: 'guide-1', title: 'LinkedIn', read: true })
const closedGuide = extra({ key: 'guide-2', title: 'Резюме', href: '/guides/resume', accessAllowed: false })

function course(overrides: Partial<NodeCourse> = {}): NodeCourse {
  return { slug: 'react-basics', title: 'Основы React', totalLessons: 10, completedLessons: 3, nextLesson: null, blockedBy: [], ...overrides }
}

function data(overrides: Partial<RoadmapNodeData> = {}): RoadmapNodeData {
  return {
    label: 'Карьера', nodeType: 'topic', courseSlug: null, courses: [], extras: [bootcamp, readGuide, closedGuide], icon: null, description: null,
    status: 'available', comingSoon: false, progressPercent: 0, totalLessons: 0, completedLessons: 0, stage: 'stage1', color: null, bullets: [], isNextStep: false,
    ...overrides,
  }
}

/** Ближайший предок по селектору; без него тест падает с понятной причиной. */
function closest(element: HTMLElement, selector: string): HTMLElement {
  const found = element.closest<HTMLElement>(selector)
  if (!found) throw new Error(`Нет предка ${selector}`)
  return found
}

function node(id: string, overrides: Partial<RoadmapNodeData> = {}): GraphNode {
  return { id, type: overrides.nodeType ?? 'topic', position: { x: 0, y: 0 }, data: data(overrides) }
}

beforeEach(() => {
  vi.clearAllMocks()
  setNavigationURL('/roadmaps/frontend')
  routeHistoryThroughNavigation()
})

describe('список гайдов и буткемпов темы', () => {
  it('группирует буткемпы и гайды, закрытые ведут на экран «нет доступа» с подписью', () => {
    render(<NodeExtraList extras={[bootcamp, readGuide, closedGuide]} />)

    expect(screen.getAllByRole('heading').map((heading) => heading.textContent)).toEqual(['Буткемп', 'Гайды'])
    expect(screen.getByRole('link', { name: 'Буткемп Node.js' })).toHaveAttribute('href', '/bootcamp?locked=1')
    expect(screen.getByRole('link', { name: 'Резюме' })).toHaveAttribute('href', '/guides/resume')
    expect(screen.getAllByText('Доступ не назначен')).toHaveLength(2)
    expect(within(closest(screen.getByRole('link', { name: 'LinkedIn' }), 'li')).getByText('Прочитан')).toBeInTheDocument()
    expect(screen.getByText('В прогресс роадмапа не входят')).toBeInTheDocument()
  })

  it('открытый непрочитанный гайд — без подписи, пустой список ничего не рисует', () => {
    const { container, rerender } = render(<NodeExtraList extras={[extra()]} />)
    expect(screen.getByRole('heading', { name: 'Гайд' })).toBeInTheDocument()
    expect(screen.queryByText('Прочитан')).toBeNull()
    expect(screen.queryByText('Доступ не назначен')).toBeNull()
    rerender(<NodeExtraList extras={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('панель темы', () => {
  it('тема только из гайдов и буткемпов не «готовится» и показывает их после курсов', () => {
    render(<RoadmapNodePanel data={data()} onClose={() => {}} />)
    const panel = screen.getByRole('complementary', { name: 'Тема «Карьера»' })

    expect(within(panel).queryByText(/Курсов по этой теме пока нет/)).toBeNull()
    expect(within(panel).queryByText(/Материалы готовятся/)).toBeNull()
    expect(within(panel).getByRole('link', { name: 'Буткемп Node.js' })).toBeInTheDocument()
  })

  it('курсы темы идут первыми, гайды — после них', () => {
    render(<RoadmapNodePanel data={data({ courses: [course()], totalLessons: 10, completedLessons: 3, progressPercent: 30, extras: [readGuide] })} onClose={() => {}} />)
    const links = screen.getAllByRole('link').map((link) => link.textContent)

    expect(links.indexOf('Основы React')).toBeLessThan(links.indexOf('LinkedIn'))
    expect(screen.getByText('Пройдено 3 из 10 уроков · 30%')).toBeInTheDocument()
  })
})

describe('мобильный список', () => {
  it('раскрытая тема показывает гайды и буткемпы, а «Курсов пока нет» — только у пустой темы', async () => {
    render(<RoadmapTopicList nodes={[node('career', { label: 'Карьера' }), node('empty', { label: 'Пустая', extras: [], comingSoon: true, status: 'locked' })]} looseCourses={[]} />)

    await userEvent.click(screen.getByText('Карьера'))
    const career = closest(screen.getByText('Карьера'), 'details')
    expect(within(career).getByRole('link', { name: 'Буткемп Node.js' })).toHaveAttribute('href', '/bootcamp?locked=1')
    expect(within(career).queryByText('Курсов по этой теме пока нет.')).toBeNull()
    expect(within(closest(screen.getByText('Пустая'), 'details')).getByText('Курсов по этой теме пока нет.')).toBeInTheDocument()
  })
})

type NodeLike = { data: unknown; id: string; type: string }
const renderCard = (overrides: Partial<RoadmapNodeData> = {}) =>
  render(createElement(RoadmapTopicNode as unknown as FunctionComponent<NodeLike>, { data: data(overrides), id: 'career', type: 'topic' }))

describe('карточка темы на карте', () => {
  it('значки видов: замок с подписью, если ни один материал вида не открыт', () => {
    renderCard()

    const badge = closest(screen.getByText('Буткемп'), 'span')
    expect(within(badge).getByRole('img', { name: 'Доступ не назначен' })).toBeInTheDocument()
    // Один из двух гайдов открыт — замка у значка нет.
    expect(within(closest(screen.getByText('Гайды · 2'), 'span')).queryByRole('img')).toBeNull()
  })

  it('тема без уроков с закрытыми материалами объясняет замок, а не отсылает к предыдущим курсам', () => {
    renderCard({ status: 'locked', extras: [closedGuide] })

    expect(screen.getAllByText('Доступ не назначен').length).toBeGreaterThan(0)
    expect(screen.queryByText('Пройдите предыдущие курсы')).toBeNull()
    expect(screen.queryByText('Материалы готовятся')).toBeNull()
  })
})

describe('поиск по карте', () => {
  it('находит тему по названию гайда', async () => {
    render(<RoadmapGraph nodes={[node('react', { label: 'React', extras: [] }), node('career', { label: 'Карьера' })]} edges={[]} />)

    await userEvent.type(screen.getByRole('combobox', { name: /Найти тему/ }), 'резюме{Enter}')

    expect(screen.getByRole('complementary', { name: 'Тема «Карьера»' })).toBeInTheDocument()
  })
})

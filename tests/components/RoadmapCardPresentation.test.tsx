import { createElement, type FunctionComponent } from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { NodeCourse, RoadmapNodeData } from '@/components/roadmap/types'

vi.mock('@xyflow/react', async () => (await import('../helpers/component-mocks')).xyflowMock())

const { RoadmapTopicNode } = await import('@/components/roadmap/RoadmapTopicNode')
const { RoadmapSubtopicNode } = await import('@/components/roadmap/RoadmapSubtopicNode')

const baseData: RoadmapNodeData = {
  label: 'Архитектура Node.js',
  nodeType: 'topic',
  courseSlug: null,
  courses: [],
  icon: null,
  description: null,
  status: 'available',
  comingSoon: false,
  progressPercent: 0,
  totalLessons: 0,
  completedLessons: 0,
  stage: 'stage1',
  color: null,
  bullets: [],
  isNextStep: false,
}

type NodeLike = { data: RoadmapNodeData; id: string; type: string }

function renderNode(component: unknown, data: Partial<RoadmapNodeData> = {}) {
  return render(createElement(component as FunctionComponent<NodeLike>, {
    id: 'architecture',
    type: 'topic',
    data: { ...baseData, ...data },
  }))
}

function course(index: number): NodeCourse {
  return {
    slug: `course-${index}`,
    title: `Курс архитектуры ${index}`,
    totalLessons: index * 10,
    completedLessons: 0,
    nextLesson: null,
    blockedBy: [],
  }
}

describe('читаемая краткая программа на карте', () => {
  it('ограничивает длинную программу четырьмя темами и объясняет, где остальные', () => {
    renderNode(RoadmapTopicNode, {
      bullets: ['Модули', 'Слои', 'Зависимости', 'Контракты', 'Транзакции', 'Наблюдаемость'],
    })

    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText('Контракты')).toBeInTheDocument()
    expect(screen.queryByText('Транзакции')).not.toBeInTheDocument()
    expect(screen.getByText('Ещё 2 — в описании темы')).toBeInTheDocument()
  })

  it('показывает три курса и количество остальных вместо перегруженной карты', () => {
    renderNode(RoadmapTopicNode, {
      courses: Array.from({ length: 5 }, (_, index) => course(index + 1)),
      bullets: ['Служебное описание не дублируется'],
    })

    expect(screen.getByText('Курс архитектуры 3')).toBeInTheDocument()
    expect(screen.queryByText('Курс архитектуры 4')).not.toBeInTheDocument()
    expect(screen.getByText('Ещё 2 — в программе темы')).toBeInTheDocument()
    expect(screen.queryByText('Служебное описание не дублируется')).not.toBeInTheDocument()
  })

  it('не обещает скрытые пункты, когда показана вся программа', () => {
    renderNode(RoadmapTopicNode, { bullets: ['Модули', 'Слои', 'Зависимости', 'Контракты'] })

    expect(screen.queryByText(/Ещё/)).not.toBeInTheDocument()
  })

  it('публикует доступное значение прогресса для вспомогательных технологий', () => {
    renderNode(RoadmapTopicNode, {
      status: 'in-progress',
      totalLessons: 20,
      completedLessons: 5,
      progressPercent: 25,
    })

    expect(screen.getByRole('progressbar', { name: 'Прогресс темы «Архитектура Node.js»' }))
      .toHaveAttribute('aria-valuenow', '25')
    expect(screen.getByText('5/20 уроков')).toBeInTheDocument()
  })

  it('объясняет реальный блокирующий курс вместо показа недоступного прогресса', () => {
    renderNode(RoadmapTopicNode, {
      status: 'locked',
      totalLessons: 10,
      courses: [{ ...course(1), blockedBy: ['Основы JavaScript'] }],
    })

    expect(screen.getByText('Сначала: Основы JavaScript')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it.each([RoadmapTopicNode, RoadmapSubtopicNode])('обозначает следующий шаг независимо от типа темы', (component) => {
    renderNode(component, { isNextStep: true })

    expect(screen.getByText('Ваш шаг')).toBeInTheDocument()
    expect(screen.getByText('Архитектура Node.js')).toBeInTheDocument()
  })
})

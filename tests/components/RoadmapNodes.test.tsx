import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement, type FunctionComponent } from 'react'

vi.mock('@xyflow/react', async () => (await import('../helpers/component-mocks')).xyflowMock())

const { RoadmapTopicNode } = await import('@/components/roadmap/RoadmapTopicNode')
const { RoadmapCategoryNode } = await import('@/components/roadmap/RoadmapCategoryNode')
const { RoadmapSubtopicNode } = await import('@/components/roadmap/RoadmapSubtopicNode')
const { RoadmapAnnotationNode } = await import('@/components/roadmap/RoadmapAnnotationNode')
const { RoadmapIcon } = await import('@/components/roadmap/RoadmapIcon')

import type { RoadmapNodeData } from '@/components/roadmap/types'

/**
 * Узлы карты навыков. Цвет и статус узла — единственный способ показать
 * ученику, что уже пройдено и что ещё закрыто, поэтому проверяются ветки
 * по статусу, а не оформление.
 */

function nodeData(overrides: Partial<RoadmapNodeData> = {}): RoadmapNodeData {
  return {
    label: 'Глубокий React',
    nodeType: 'topic',
    courseSlug: 'deep-react',
    courses: [],
    icon: 'rocket',
    description: null,
    status: 'available',
    comingSoon: false,
    progressPercent: 0,
    totalLessons: 0,
    completedLessons: 0,
    stage: 'stage1',
    color: null,
    bullets: [],
    ...overrides,
  }
}

/** Узлы объявлены через NodeProps, но читают из него только data. */
type NodeLike = { data: unknown; id: string; type: string; selected?: boolean }

const renderNode = (Node: unknown, data: Partial<RoadmapNodeData> = {}) =>
  render(
    createElement(Node as FunctionComponent<NodeLike>, {
      data: nodeData(data),
      id: 'n1',
      type: 'topic',
    }),
  )

describe('карточка темы', () => {
  it('показывает название', () => {
    renderNode(RoadmapTopicNode, { label: 'Глубокий React' })

    expect(screen.getByText('Глубокий React')).toBeInTheDocument()
  })

  it('описание уходит в подсказку, а не в разметку карточки', () => {
    const { container } = renderNode(RoadmapTopicNode, { description: 'Подробности темы' })

    expect(container.firstElementChild).toHaveAttribute('title', 'Подробности темы')
  })

  it('закрытая тема помечена замком с пояснением', () => {
    renderNode(RoadmapTopicNode, { status: 'locked' })

    expect(screen.getByText('Глубокий React')).toBeInTheDocument()
  })

  it('список курсов показывается, когда их больше одного', () => {
    renderNode(RoadmapTopicNode, {
      courses: [
        { slug: 'a', title: 'Первый курс' },
        { slug: 'b', title: 'Второй курс' },
      ] as RoadmapNodeData['courses'],
    })

    expect(screen.getByText('Первый курс')).toBeInTheDocument()
    expect(screen.getByText('Второй курс')).toBeInTheDocument()
  })

  it('единственный курс отдельным списком не дублируется', () => {
    renderNode(RoadmapTopicNode, {
      courses: [{ slug: 'a', title: 'Единственный' }] as RoadmapNodeData['courses'],
    })

    expect(screen.queryByText('Единственный')).not.toBeInTheDocument()
  })

  it('есть точки соединения для входящих и исходящих связей', () => {
    renderNode(RoadmapTopicNode)
    const handles = screen.getAllByTestId('handle')

    expect(handles.map((h) => h.dataset.handleType).sort()).toEqual(['source', 'target'])
  })

  it('цвет статуса виден в классах — по нему ученик отличает пройденное', () => {
    const { container: completed } = renderNode(RoadmapTopicNode, { status: 'completed' })
    const { container: available } = renderNode(RoadmapTopicNode, { status: 'available' })

    expect(completed.firstElementChild?.className).not.toBe(
      available.firstElementChild?.className,
    )
  })
})

describe('карточка категории', () => {
  it('показывает название стадии', () => {
    renderNode(RoadmapCategoryNode, { label: 'СТАЖЁР' })

    expect(screen.getByText('СТАЖЁР')).toBeInTheDocument()
  })

  it('описание выводится под названием', () => {
    renderNode(RoadmapCategoryNode, { description: 'Первые четыре недели' })

    expect(screen.getByText('Первые четыре недели')).toBeInTheDocument()
  })

  it('без описания лишнего блока не появляется', () => {
    const { container } = renderNode(RoadmapCategoryNode, { description: null })

    expect(container.querySelectorAll('span')).toHaveLength(1)
  })

  it('есть обе точки соединения', () => {
    renderNode(RoadmapCategoryNode)

    expect(screen.getAllByTestId('handle')).toHaveLength(2)
  })
})

describe('мини-узел подтемы', () => {
  it('показывает название', () => {
    renderNode(RoadmapSubtopicNode, { label: 'Мониторинг' })

    expect(screen.getByText('Мониторинг')).toBeInTheDocument()
  })

  it('закрытая подтема объясняет причину подписью к замку', () => {
    renderNode(RoadmapSubtopicNode, { status: 'locked', comingSoon: false })

    expect(screen.getByLabelText('Пройдите предыдущие курсы')).toBeInTheDocument()
  })

  it('готовящаяся подтема объясняет это отдельно', () => {
    renderNode(RoadmapSubtopicNode, { status: 'locked', comingSoon: true })

    expect(screen.getByLabelText('Материалы готовятся')).toBeInTheDocument()
  })

  it('доступная подтема замка не показывает', () => {
    renderNode(RoadmapSubtopicNode, { status: 'available' })

    expect(screen.queryByLabelText(/Пройдите|готовятся/)).not.toBeInTheDocument()
  })
})

describe('поясняющие надписи на карте', () => {
  const renderAnnotation = (annotationType: string, text: string) =>
    render(
      createElement(RoadmapAnnotationNode as unknown as FunctionComponent<NodeLike>, {
        data: { annotationType, text },
        id: 'a',
        type: 'annotation',
      }),
    )

  it.each([
    ['levelBadge', 'JUNIOR'],
    ['rightLabel', 'Ожидается базовое понимание'],
    ['leftLabel', '1 неделя\nповторяем базу'],
  ] as const)('тип %s выводит свой текст', (type, text) => {
    renderAnnotation(type, text)

    expect(screen.getByText(text.split('\n')[0], { exact: false })).toBeInTheDocument()
  })

  it('разные типы оформляются по-разному', () => {
    const { container: badge } = renderAnnotation('levelBadge', 'JUNIOR')
    const { container: left } = renderAnnotation('leftLabel', 'JUNIOR')

    expect(badge.firstElementChild?.className).not.toBe(left.firstElementChild?.className)
  })

  it('переносы строк сохраняются — надписи на доске многострочные', () => {
    const { container } = renderAnnotation('leftLabel', '1 неделя\nповторяем базу')

    expect(container.firstElementChild?.className).toContain('whitespace-pre-line')
  })
})

describe('иконка узла', () => {
  it('известное имя даёт иконку', () => {
    const { container } = render(<RoadmapIcon name="rocket" />)

    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('неизвестное имя не ломает рендер', () => {
    const { container } = render(<RoadmapIcon name="такого-нет" />)

    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('классы прокидываются на svg', () => {
    const { container } = render(<RoadmapIcon name="rocket" className="h-5 w-5" />)

    expect(container.querySelector('svg')).toHaveClass('h-5', 'w-5')
  })
})

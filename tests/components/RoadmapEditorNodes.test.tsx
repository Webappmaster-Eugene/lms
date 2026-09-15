import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement, type FunctionComponent } from 'react'

vi.mock('@xyflow/react', async () => (await import('../helpers/component-mocks')).xyflowMock())

const params = vi.fn(() => ({ segments: ['collections', 'roadmaps', '5'] }) as Record<string, unknown>)
vi.mock('next/navigation', () => ({ useParams: () => params() }))

const { EditorTopicNode } = await import('@/components/roadmap-editor/EditorTopicNode')
const { EditorCategoryNode } = await import('@/components/roadmap-editor/EditorCategoryNode')
const { EditorSubtopicNode } = await import('@/components/roadmap-editor/EditorSubtopicNode')
const { RoadmapEditorNavLink } = await import('@/components/roadmap-editor/NavLink')
const { OpenEditorButton } = await import('@/components/roadmap-editor/OpenEditorButton')

import type { EditorNodeData } from '@/components/roadmap-editor/types'

/**
 * Узлы визуального редактора роадмапа.
 *
 * Оформление здесь инлайновое, а не классами: узлы рисует ReactFlow, куда
 * Tailwind не доезжает. Поэтому проверяются подписи, ветки и наличие точек
 * соединения — по одной с каждой стороны, иначе связь некуда тянуть.
 */

function data(overrides: Partial<EditorNodeData> = {}): EditorNodeData {
  return {
    label: 'Глубокий React',
    nodeType: 'topic',
    icon: 'rocket',
    description: null,
    stage: null,
    color: null,
    bullets: [],
    courseId: null,
    courseName: null,
    order: 0,
    payloadId: null,
    nodeId: 'n1',
    ...overrides,
  }
}

/** Узлы объявлены через NodeProps, но читают из него только data и selected. */
type NodeLike = { data: unknown; id: string; type: string; selected: boolean }

const renderNode = (Node: unknown, overrides: Partial<EditorNodeData> = {}, selected = false) =>
  render(
    createElement(Node as FunctionComponent<NodeLike>, {
      data: data(overrides),
      id: 'n1',
      type: 'topic',
      selected,
    }),
  )

describe('узел темы в редакторе', () => {
  it('показывает название', () => {
    renderNode(EditorTopicNode, { label: 'Глубокий React' })

    expect(screen.getByText('Глубокий React')).toBeInTheDocument()
  })

  it('выводит пункты списка', () => {
    renderNode(EditorTopicNode, { bullets: ['Хуки', 'SSR'] })

    expect(screen.getByText('Хуки')).toBeInTheDocument()
    expect(screen.getByText('SSR')).toBeInTheDocument()
  })

  it('длинный список обрезается, чтобы узел не растянулся на всю канву', () => {
    const bullets = Array.from({ length: 20 }, (_, i) => `Пункт ${i + 1}`)
    renderNode(EditorTopicNode, { bullets })

    expect(screen.getByText('Пункт 14')).toBeInTheDocument()
    expect(screen.queryByText('Пункт 15')).not.toBeInTheDocument()
  })

  it('привязанный курс подписан на узле', () => {
    renderNode(EditorTopicNode, { label: 'Тема', courseName: 'Основы Node.js' })

    expect(screen.getByText(/Основы Node\.js/)).toBeInTheDocument()
  })

  it('без курса подписи нет', () => {
    renderNode(EditorTopicNode, { courseName: null, label: 'Тема' })

    expect(screen.queryByText(/📚/)).not.toBeInTheDocument()
  })

  it('выделенный узел отличается от невыделенного', () => {
    const { container: on } = renderNode(EditorTopicNode, {}, true)
    const { container: off } = renderNode(EditorTopicNode, {}, false)

    expect(on.firstElementChild?.getAttribute('style')).not.toBe(
      off.firstElementChild?.getAttribute('style'),
    )
  })
})

describe('узел категории в редакторе', () => {
  it('показывает название', () => {
    renderNode(EditorCategoryNode, { label: 'СТАЖЁР' })

    expect(screen.getByText('СТАЖЁР')).toBeInTheDocument()
  })

  it('выделение меняет оформление', () => {
    const { container: on } = renderNode(EditorCategoryNode, {}, true)
    const { container: off } = renderNode(EditorCategoryNode, {}, false)

    expect(on.firstElementChild?.getAttribute('style')).not.toBe(
      off.firstElementChild?.getAttribute('style'),
    )
  })
})

describe('узел подтемы в редакторе', () => {
  it('показывает название', () => {
    renderNode(EditorSubtopicNode, { label: 'Мониторинг' })

    expect(screen.getByText('Мониторинг')).toBeInTheDocument()
  })

  it('связь можно тянуть с любой стороны — по точке на каждую', () => {
    renderNode(EditorSubtopicNode)
    const positions = screen.getAllByTestId('handle').map((h) => h.dataset.handlePosition)

    expect(new Set(positions)).toEqual(new Set(['top', 'bottom', 'left', 'right']))
  })

  it('есть и входящие, и исходящие точки', () => {
    renderNode(EditorSubtopicNode)
    const types = screen.getAllByTestId('handle').map((h) => h.dataset.handleType)

    expect(types).toContain('source')
    expect(types).toContain('target')
  })
})

describe('ссылка на редактор в админке', () => {
  it('ведёт на страницу редактора', () => {
    render(<RoadmapEditorNavLink />)

    expect(screen.getByRole('link')).toHaveAttribute('href', '/admin/roadmap-editor')
  })

  it('подписана понятно', () => {
    render(<RoadmapEditorNavLink />)

    expect(screen.getByRole('link')).toHaveTextContent('Редактор роадмапов')
  })
})

describe('кнопка открытия редактора из карточки роадмапа', () => {
  it('ведёт на редактор конкретного роадмапа', () => {
    params.mockReturnValue({ segments: ['collections', 'roadmaps', '5'] })
    render(<OpenEditorButton />)

    expect(screen.getByRole('link')).toHaveAttribute('href', '/admin/roadmap-editor/5')
  })

  it('на страницах без id ничего не показывает', () => {
    params.mockReturnValue({ segments: ['collections', 'roadmaps'] })
    const { container } = render(<OpenEditorButton />)

    expect(container).toBeEmptyDOMElement()
  })

  it('без сегментов вовсе тоже молчит', () => {
    params.mockReturnValue({})
    const { container } = render(<OpenEditorButton />)

    expect(container).toBeEmptyDOMElement()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createElement, type FunctionComponent } from 'react'
import userEvent from '@testing-library/user-event'

vi.mock('@xyflow/react', async () => (await import('../helpers/component-mocks')).xyflowMock())

const { EditorToolbar } = await import('@/components/roadmap-editor/EditorToolbar')
const { RoadmapSelector } = await import('@/components/roadmap-editor/RoadmapSelector')
const { RoadmapEditorClient } = await import('@/components/roadmap-editor/RoadmapEditorClient')
const { RoadmapEditorCanvas } = await import('@/components/roadmap-editor/RoadmapEditorCanvas')
const RoadmapEditorView = (await import('@/components/roadmap-editor/RoadmapEditorView')).default

/**
 * Обвязка визуального редактора: панель действий, выбор роадмапа и канва.
 *
 * Оформление инлайновое, потому что редактор живёт внутри админки Payload
 * со своими стилями, — поэтому проверяются доступность кнопок и переходы,
 * а не классы.
 */

const toolbarProps = {
  roadmapInfo: { id: 7, title: 'Frontend React', slug: 'frontend-react' },
  isDirty: false,
  isSaving: false,
  hasSelection: false,
  onAddNode: vi.fn(),
  onDeleteSelected: vi.fn(),
  onSave: vi.fn(),
}

describe('панель действий редактора', () => {
  beforeEach(() => vi.clearAllMocks())

  it('показывает название роадмапа', () => {
    render(<EditorToolbar {...toolbarProps} />)

    expect(screen.getByText(/Frontend React/)).toBeInTheDocument()
  })

  it('без несохранённых правок сохранять нечего', () => {
    render(<EditorToolbar {...toolbarProps} isDirty={false} />)

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
  })

  it('с правками сохранение доступно', () => {
    render(<EditorToolbar {...toolbarProps} isDirty />)

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled()
  })

  it('несохранённые правки помечены — иначе о них легко забыть', () => {
    render(<EditorToolbar {...toolbarProps} isDirty />)

    expect(screen.getByTitle('Есть несохранённые изменения')).toBeInTheDocument()
  })

  it('во время сохранения кнопка занята и подписана', () => {
    render(<EditorToolbar {...toolbarProps} isDirty isSaving />)

    expect(screen.getByRole('button', { name: 'Сохранение...' })).toBeDisabled()
  })

  it('удалять нечего, пока ничего не выделено', () => {
    render(<EditorToolbar {...toolbarProps} hasSelection={false} />)

    expect(screen.getByRole('button', { name: /Удалить/ })).toBeDisabled()
  })

  it('с выделением удаление доступно и срабатывает', async () => {
    const user = userEvent.setup()
    render(<EditorToolbar {...toolbarProps} hasSelection />)

    await user.click(screen.getByRole('button', { name: /Удалить/ }))

    expect(toolbarProps.onDeleteSelected).toHaveBeenCalled()
  })

  it('сохранение вызывается по кнопке', async () => {
    const user = userEvent.setup()
    render(<EditorToolbar {...toolbarProps} isDirty />)

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(toolbarProps.onSave).toHaveBeenCalled()
  })

  describe('добавление узла', () => {
    it('меню видов открывается по кнопке', async () => {
      const user = userEvent.setup()
      render(<EditorToolbar {...toolbarProps} />)

      await user.click(screen.getByRole('button', { name: /Добавить/ }))

      expect(screen.getByRole('button', { name: 'Подтема' })).toBeInTheDocument()
    })

    it('выбор вида сообщается наружу', async () => {
      const user = userEvent.setup()
      render(<EditorToolbar {...toolbarProps} />)

      await user.click(screen.getByRole('button', { name: /Добавить/ }))
      await user.click(screen.getByRole('button', { name: 'Подтема' }))

      expect(toolbarProps.onAddNode).toHaveBeenCalledWith('subtopic')
    })
  })
})

describe('выбор роадмапа для правки', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn(async () =>
      Response.json({ docs: [{ id: 7, title: 'Frontend React', slug: 'frontend-react' }] }),
    ) as unknown as typeof fetch
  })

  it('показывает доступные роадмапы ссылками на редактор', async () => {
    render(<RoadmapSelector />)

    const link = await screen.findByRole('link', { name: /Frontend React/ })
    expect(link).toHaveAttribute('href', expect.stringContaining('/admin/roadmap-editor/7'))
  })

  it('пустой список объясняет, что роадмапов нет', async () => {
    global.fetch = vi.fn(async () => Response.json({ docs: [] })) as unknown as typeof fetch

    render(<RoadmapSelector />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: /Frontend React/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /коллекции/ })).toBeInTheDocument()
  })

  it('отказ загрузки не оставляет пустой экран без объяснения', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('сеть недоступна')
    }) as unknown as typeof fetch

    render(<RoadmapSelector />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: /Frontend React/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Панель управления/ })).toBeInTheDocument()
  })
})

describe('точка входа редактора', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn(async () => Response.json({ docs: [] })) as unknown as typeof fetch
  })

  it('без выбранного роадмапа показывает список', () => {
    render(<RoadmapEditorClient roadmapId={null} />)

    expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Панель управления/ })).toBeInTheDocument()
  })

  it('серверная обёртка достаёт id из адреса', () => {
    render(
      createElement(RoadmapEditorView as FunctionComponent<Record<string, unknown>>, {
        params: { segments: ['roadmap-editor', '7'] },
      }),
    )

    expect(screen.queryByText(/ошибка/i)).not.toBeInTheDocument()
  })

  it('адрес без id ведёт к выбору роадмапа', () => {
    render(
      createElement(RoadmapEditorView as FunctionComponent<Record<string, unknown>>, {
        params: { segments: ['roadmap-editor'] },
      }),
    )

    expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument()
  })
})

describe('канва редактора', () => {
  const canvasProps = {
    nodes: [
      {
        id: 'n1',
        type: 'topic',
        position: { x: 0, y: 0 },
        data: {
          label: 'Тема',
          nodeType: 'topic',
          icon: null,
          description: null,
          stage: null,
          color: null,
          bullets: [],
          courseId: null,
          courseName: null,
          order: 0,
          payloadId: null,
          nodeId: 'n1',
        },
      },
    ],
    edges: [],
    onNodesChange: vi.fn(),
    onEdgesChange: vi.fn(),
    onConnect: vi.fn(),
    onNodeClick: vi.fn(),
    onPaneClick: vi.fn(),
  }

  it('передаёт узлы в граф', () => {
    render(createElement(RoadmapEditorCanvas as FunctionComponent<Record<string, unknown>>, canvasProps))

    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-node-count', '1')
  })

  it('узел рисуется своим компонентом по типу', () => {
    render(createElement(RoadmapEditorCanvas as FunctionComponent<Record<string, unknown>>, canvasProps))

    expect(screen.getByTestId('flow-node')).toHaveAttribute('data-node-type', 'topic')
  })
})

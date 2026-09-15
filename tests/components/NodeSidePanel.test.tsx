import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@xyflow/react', async () => (await import('../helpers/component-mocks')).xyflowMock())

const { NodeSidePanel } = await import('@/components/roadmap-editor/NodeSidePanel')

import type { EditorNode } from '@/components/roadmap-editor/types'

/**
 * Панель правки выделенного узла роадмапа.
 *
 * Правки уходят наверх сразу, без кнопки «Применить»: состояние графа живёт
 * в редакторе, а панель только отображает его и сообщает об изменениях.
 */

const onUpdate = vi.fn()
const onDelete = vi.fn()
const onClose = vi.fn()

function node(): EditorNode {
  return {
    id: 'n1',
    type: 'topic',
    position: { x: 0, y: 0 },
    data: {
      label: 'Глубокий React',
      nodeType: 'topic',
      icon: null,
      description: null,
      stage: null,
      color: null,
      bullets: ['Хуки'],
      courseId: null,
      courseName: null,
      order: 1,
      payloadId: 10,
      nodeId: 'n1',
    },
  } as EditorNode
}

const renderPanel = () =>
  render(
    <NodeSidePanel
      node={node()}
      roadmapId={7}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onClose={onClose}
    />,
  )

describe('панель правки узла', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn(async () =>
      Response.json({ docs: [{ id: 51, title: 'Глубокий React' }] }),
    ) as unknown as typeof fetch
  })

  it('показывает текущие значения узла', () => {
    renderPanel()

    expect(screen.getByDisplayValue('Глубокий React')).toBeInTheDocument()
  })

  it('правка названия сообщается наверх сразу', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByPlaceholderText('Название узла'), '!')

    expect(onUpdate).toHaveBeenCalledWith('n1', expect.objectContaining({ label: expect.any(String) }))
  })

  it('смена типа узла уходит наверх', async () => {
    const user = userEvent.setup()
    renderPanel()

    const select = screen.getAllByRole('combobox')[0]
    await user.selectOptions(select, 'category')

    expect(onUpdate).toHaveBeenCalledWith('n1', { nodeType: 'category' })
  })

  it('сброс стадии передаёт null, а не пустую строку', async () => {
    const user = userEvent.setup()
    renderPanel()

    const selects = screen.getAllByRole('combobox')
    const stage = selects[1]
    await user.selectOptions(stage, '')

    expect(onUpdate).toHaveBeenCalledWith('n1', { stage: null })
  })

  it('курсы роадмапа подгружаются для привязки', async () => {
    renderPanel()

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(String(vi.mocked(global.fetch).mock.calls[0][0])).toContain(
      'where[roadmap][equals]=7',
    )
  })

  it('удаление вызывается по кнопке', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /Удалить/ }))

    expect(onDelete).toHaveBeenCalled()
  })

  it('панель закрывается', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()

    await user.click(container.querySelectorAll('button')[0])

    expect(onClose).toHaveBeenCalled()
  })

  it('отказ загрузки курсов не ломает панель', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('сеть недоступна')
    }) as unknown as typeof fetch

    renderPanel()

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.getByDisplayValue('Глубокий React')).toBeInTheDocument()
  })
})

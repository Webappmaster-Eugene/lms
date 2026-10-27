import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
      guideIds: [],
      bootcampIds: [],
      order: 1,
      payloadId: 10,
      nodeId: 'n1',
    },
  } as EditorNode
}

const renderPanel = (data: Partial<EditorNode['data']> = {}) =>
  render(
    <NodeSidePanel
      node={{ ...node(), data: { ...node().data, ...data } } as EditorNode}
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

    // Категория — заголовок этапа: гайды и буткемпы с неё снимаются тем же обновлением.
    expect(onUpdate).toHaveBeenCalledWith('n1', { nodeType: 'category', guideIds: [], bootcampIds: [] })
    await user.selectOptions(select, 'subtopic')
    expect(onUpdate).toHaveBeenLastCalledWith('n1', { nodeType: 'subtopic' })
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

  describe('гайды и буткемпы темы', () => {
    const lists = (url: string) => {
      if (url.includes('/api/guides')) return Response.json({ docs: [{ id: 1, title: 'LinkedIn', isPublished: true }, { id: 2, title: 'Резюме', isPublished: false }] })
      if (url.includes('[isBootcamp]')) return Response.json({ docs: [{ id: 90, title: 'Буткемп Node.js', isPublished: true }] })
      return Response.json({ docs: [{ id: 51, title: 'Глубокий React' }, { id: 90, title: 'Буткемп Node.js', isBootcamp: true }] })
    }
    beforeEach(() => {
      global.fetch = vi.fn(async (input: RequestInfo | URL) => lists(String(input))) as unknown as typeof fetch
    })

    it('черновик гайда помечен, отметка добавляет id в конец, снятие убирает', async () => {
      const user = userEvent.setup()
      renderPanel({ guideIds: [2] })
      const guides = screen.getByRole('group', { name: /Гайды темы/ })

      await user.click(await within(guides).findByRole('checkbox', { name: 'LinkedIn' }))
      expect(onUpdate).toHaveBeenLastCalledWith('n1', { guideIds: [2, 1] })
      await user.click(within(guides).getByRole('checkbox', { name: 'Резюме (черновик)' }))
      expect(onUpdate).toHaveBeenLastCalledWith('n1', { guideIds: [] })
      expect(String(vi.mocked(global.fetch).mock.calls.find(([url]) => String(url).includes('/api/guides'))?.[0])).toContain('select[isPublished]=true')
    })

    it('буткемп выбирается только своим списком: в «Привязанном курсе» его нет', async () => {
      const user = userEvent.setup()
      renderPanel()
      const bootcamps = screen.getByRole('group', { name: /Буткемпы темы/ })

      await user.click(await within(bootcamps).findByRole('checkbox', { name: 'Буткемп Node.js' }))
      expect(onUpdate).toHaveBeenLastCalledWith('n1', { bootcampIds: [90] })
      const course = screen.getByRole('combobox', { name: 'Привязанный курс' })
      await waitFor(() => expect(within(course).getByRole('option', { name: 'Глубокий React' })).toBeInTheDocument())
      expect(within(course).queryByRole('option', { name: 'Буткемп Node.js' })).toBeNull()
    })

    it('у категории списков нет', () => {
      renderPanel({ nodeType: 'category' })

      expect(screen.queryByRole('group', { name: /Гайды темы/ })).toBeNull()
      expect(screen.queryByRole('group', { name: /Буткемпы темы/ })).toBeNull()
    })

    it('сбой загрузки виден, а выбранный id остаётся и снимается', async () => {
      global.fetch = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/api/guides') ? new Response('нет', { status: 500 }) : lists(String(input))) as unknown as typeof fetch
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const user = userEvent.setup()
      renderPanel({ guideIds: [7] })
      const guides = screen.getByRole('group', { name: /Гайды темы/ })

      expect(await within(guides).findByRole('alert')).toHaveTextContent('Список не загрузился')
      await user.click(within(guides).getByRole('checkbox', { name: 'Гайд #7' }))
      expect(onUpdate).toHaveBeenLastCalledWith('n1', { guideIds: [] })
      expect(error).toHaveBeenCalled()
      error.mockRestore()
    })
  })

  it('удаление вызывается по кнопке', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: 'Удалить узел' }))

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

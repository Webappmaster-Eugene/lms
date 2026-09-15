import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const toast = vi.fn()
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }))

const { LessonComments } = await import('@/components/lesson/LessonComments')

/**
 * Приватные вопросы ментору под уроком.
 *
 * Отправка и перезагрузка списка связаны: без повторного запроса ученик не
 * видит только что заданный вопрос и задаёт его второй раз.
 */

type Comment = {
  id: string
  content: string
  user: { firstName?: string; lastName?: string } | string
  createdAt: string
}

function comment(id: string, overrides: Partial<Comment> = {}): Comment {
  return {
    id,
    content: `Вопрос ${id}`,
    user: { firstName: 'Алексей', lastName: 'Морозов' },
    createdAt: '2026-09-15T10:00:00.000Z',
    ...overrides,
  }
}

let posted: Record<string, unknown>[] = []

function mockApi({ docs = [] as Comment[], postOk = true } = {}) {
  posted = []
  global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      return postOk ? Response.json({ doc: { id: 'new' } }) : new Response('нет', { status: 500 })
    }
    return Response.json({ docs })
  }) as unknown as typeof fetch
}

describe('комментарии под уроком', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi()
  })

  describe('список', () => {
    it('запрашиваются комментарии только этого урока и только верхнего уровня', async () => {
      render(<LessonComments lessonId={42} />)

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      const url = String(vi.mocked(global.fetch).mock.calls[0][0])
      expect(url).toContain('where[lesson][equals]=42')
      expect(url).toContain('where[parentComment][exists]=false')
    })

    it('пустой список приглашает написать первым', async () => {
      render(<LessonComments lessonId={42} />)

      expect(await screen.findByText(/Пока нет комментариев/)).toBeInTheDocument()
    })

    it('показывает текст и автора', async () => {
      mockApi({ docs: [comment('1', { content: 'Не запускается пример' })] })
      render(<LessonComments lessonId={42} />)

      expect(await screen.findByText('Не запускается пример')).toBeInTheDocument()
      expect(screen.getByText(/Алексей Морозов/)).toBeInTheDocument()
    })

    it('автор без имени не оставляет пустую строку', async () => {
      mockApi({ docs: [comment('1', { user: {} })] })
      render(<LessonComments lessonId={42} />)

      expect(await screen.findByText('Вопрос 1')).toBeInTheDocument()
    })

    it('неразвёрнутый автор не ломает список', async () => {
      mockApi({ docs: [comment('1', { user: 'user-id-3' })] })
      render(<LessonComments lessonId={42} />)

      expect(await screen.findByText('Вопрос 1')).toBeInTheDocument()
    })
  })

  describe('отправка', () => {
    it('пустой комментарий отправить нельзя', async () => {
      render(<LessonComments lessonId={42} />)

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(screen.getByRole('button')).toBeDisabled()
    })

    it('пробелы за текст не считаются', async () => {
      const user = userEvent.setup()
      render(<LessonComments lessonId={42} />)

      await user.type(screen.getByRole('textbox'), '   ')

      expect(screen.getByRole('button')).toBeDisabled()
    })

    it('уходит POST с числовым id урока', async () => {
      const user = userEvent.setup()
      render(<LessonComments lessonId={42} />)

      await user.type(screen.getByRole('textbox'), 'Почему так?')
      await user.click(screen.getByRole('button'))

      await waitFor(() => expect(posted).toHaveLength(1))
      expect(posted[0]).toMatchObject({ lesson: 42, content: 'Почему так?' })
      expect(typeof posted[0].lesson).toBe('number')
    })

    it('после успеха поле очищается и список обновляется', async () => {
      const user = userEvent.setup()
      render(<LessonComments lessonId={42} />)

      await user.type(screen.getByRole('textbox'), 'Почему так?')
      const before = vi.mocked(global.fetch).mock.calls.length
      await user.click(screen.getByRole('button'))

      await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''))
      expect(toast).toHaveBeenCalledWith('Комментарий добавлен', 'success')
      await waitFor(() =>
        expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThan(before + 1),
      )
    })

    it('отказ виден ученику, текст не теряется', async () => {
      mockApi({ postOk: false })
      const user = userEvent.setup()
      render(<LessonComments lessonId={42} />)

      await user.type(screen.getByRole('textbox'), 'Важный вопрос')
      await user.click(screen.getByRole('button'))

      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith('Не удалось добавить комментарий', 'error'),
      )
      expect(screen.getByRole('textbox')).toHaveValue('Важный вопрос')
    })

    it('во время отправки кнопка заблокирована — двойной вопрос не уйдёт', async () => {
      let release!: (value: Response) => void
      global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') return new Promise<Response>((r) => { release = r })
        return Response.json({ docs: [] })
      }) as unknown as typeof fetch

      const user = userEvent.setup()
      render(<LessonComments lessonId={42} />)

      await user.type(screen.getByRole('textbox'), 'Вопрос')
      await user.click(screen.getByRole('button'))

      await waitFor(() => expect(screen.getByRole('button')).toBeDisabled())
      release(Response.json({}))
    })
  })
})
